import { Request, Response } from "express";
import { recordTransaction, Section, Module, Page, Action, EntityType } from "@/utils/transactionHistory";
import { prisma } from "@/config/database";
import { z } from "zod";

// Validation schemas
const createChannelSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(["CHANNEL", "DM", "GROUP"]).default("CHANNEL"),
  members: z.array(z.string()).optional(), // Array of user IDs to add
});

export const createChannel = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req as any;
    const userId = (req as any).user.id;

    const validated = createChannelSchema.parse(req.body);

    // For DMs, check if one already exists
    if (validated.type === "DM" && validated.members && validated.members.length === 1) {
      const otherUserId = validated.members[0];

      // Find existing DM between these two users
      const existingDm = await prisma.channel.findFirst({
        where: {
          tenantId,
          type: "DM",
          members: {
            every: {
              userId: { in: [userId, otherUserId] }
            }
          },
          AND: [
            { members: { some: { userId: userId } } },
            { members: { some: { userId: otherUserId } } }
          ]
        }
      });

      if (existingDm) {
        return res.status(200).json({
          success: true,
          data: existingDm,
          message: "DM already exists"
        });
      }
    }

    const channel = await prisma.channel.create({
      data: {
        tenantId,
        name: validated.name,
        description: validated.description,
        type: validated.type,
        createdById: userId,
        members: {
          create: [
            { userId, role: "owner" },
            ...(validated.members || []).map((mid) => ({
              userId: mid,
              role: "member",
            })),
          ],
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                workEmail: true,
              }
            }
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: channel,
    });
  } catch (error) {
    console.error("Error creating channel:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create channel",
    });
  }
};

export const getChannels = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req as any;
    const userId = (req as any).user.id;

    const channels = await prisma.channel.findMany({
      where: {
        tenantId,
        members: {
          some: {
            userId,
          },
        },
        isArchived: false,
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                workEmail: true, // Useful for DMs to show name
              }
            }
          }
        },
      },
      orderBy: [
        { lastMessageAt: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    res.status(200).json({
      success: true,
      data: channels,
    });
  } catch (error) {
    console.error("Error fetching channels:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch channels",
    });
  }
};

export const getChannelById = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req as any;
    const { id } = req.params;
    const userId = (req as any).user.id;

    const channel = await prisma.channel.findFirst({
      where: {
        id,
        tenantId,
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                workEmail: true,
              }
            }
          }
        },
      },
    });

    if (!channel) {
      return res.status(404).json({
        success: false,
        error: "Channel not found",
      });
    }

    res.status(200).json({
      success: true,
      data: channel,
    });
  } catch (error) {
    console.error("Error fetching channel:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch channel",
    });
  }
};

// Get all public channels in tenant (for discovery)
export const getPublicChannels = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req as any;
    const userId = (req as any).user.id;

    const channels = await prisma.channel.findMany({
      where: {
        tenantId,
        type: "CHANNEL", // Only public channels
        isArchived: false,
      },
      include: {
        members: {
          select: {
            userId: true,
          }
        },
        _count: {
          select: { members: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Mark if user is already a member
    const channelsWithMembership = channels.map(channel => ({
      ...channel,
      isMember: channel.members.some(m => m.userId === userId),
      memberCount: channel._count.members
    }));

    res.status(200).json({
      success: true,
      data: channelsWithMembership,
    });
  } catch (error) {
    console.error("Error fetching public channels:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch public channels",
    });
  }
};

// Join a public channel
export const joinChannel = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req as any;
    const userId = (req as any).user.id;
    const { id } = req.params;

    // Check if channel exists and is public
    const channel = await prisma.channel.findFirst({
      where: {
        id,
        tenantId,
        type: "CHANNEL",
        isArchived: false,
      }
    });

    if (!channel) {
      return res.status(404).json({
        success: false,
        error: "Channel not found or not joinable",
      });
    }

    // Check if already a member
    const existingMember = await prisma.channelMember.findUnique({
      where: {
        channelId_userId: { channelId: id, userId }
      }
    });

    if (existingMember) {
      return res.status(200).json({
        success: true,
        message: "Already a member",
      });
    }

    // Add as member
    await prisma.channelMember.create({
      data: {
        channelId: id,
        userId,
        role: "member"
      }
    });

    // Fetch updated channel with members
    const updatedChannel = await prisma.channel.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, workEmail: true }
            }
          }
        }
      }
    });

    res.status(200).json({
      success: true,
      data: updatedChannel,
      message: "Successfully joined channel",
    });
  } catch (error) {
    console.error("Error joining channel:", error);
    res.status(500).json({
      success: false,
      error: "Failed to join channel",
    });
  }
};

// Add members to a channel (owner/admin only)
export const addMembersToChannel = async (req: Request, res: Response) => {
  try {
    const { tenantId } = req as any;
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { memberIds } = req.body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "memberIds array is required",
      });
    }

    // Check if user is member of channel
    const membership = await prisma.channelMember.findUnique({
      where: {
        channelId_userId: { channelId: id, userId }
      }
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: "You must be a member of the channel to add others",
      });
    }

    // Check channel type
    const channel = await prisma.channel.findUnique({
      where: { id },
      select: { type: true }
    });

    if (!channel) {
      return res.status(404).json({
        success: false,
        error: "Channel not found",
      });
    }

    // If channel is private (GROUP/DM), restrict to owner/admin
    if (channel.type !== "CHANNEL" && !["owner", "admin"].includes(membership.role)) {
      return res.status(403).json({
        success: false,
        error: "Only channel owners or admins can add members to private channels",
      });
    }

    // Add new members
    const newMembers = memberIds.map((mid: string) => ({
      channelId: id,
      userId: mid,
      role: "member"
    }));

    await prisma.channelMember.createMany({
      data: newMembers,
      skipDuplicates: true // Ignore if already member
    });

    // Fetch updated channel
    const updatedChannel = await prisma.channel.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, workEmail: true }
            }
          }
        }
      }
    });

    res.status(200).json({
      success: true,
      data: updatedChannel,
      message: `Added ${memberIds.length} member(s)`,
    });
  } catch (error) {
    console.error("Error adding members:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add members",
    });
  }
};
