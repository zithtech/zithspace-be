"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addMembersToChannel = exports.joinChannel = exports.getPublicChannels = exports.getChannelById = exports.getChannels = exports.createChannel = void 0;
const database_1 = require("@/config/database");
const zod_1 = require("zod");
// Validation schemas
const createChannelSchema = zod_1.z.object({
    name: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    type: zod_1.z.enum(["CHANNEL", "DM", "GROUP"]).default("CHANNEL"),
    members: zod_1.z.array(zod_1.z.string()).optional(), // Array of user IDs to add
});
const createChannel = async (req, res) => {
    try {
        const { tenantId } = req;
        const userId = req.user.id;
        const validated = createChannelSchema.parse(req.body);
        // For DMs, check if one already exists
        if (validated.type === "DM" && validated.members && validated.members.length === 1) {
            const otherUserId = validated.members[0];
            // Find existing DM between these two users
            const existingDm = await database_1.prisma.channel.findFirst({
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
        const channel = await database_1.prisma.channel.create({
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
    }
    catch (error) {
        console.error("Error creating channel:", error);
        res.status(500).json({
            success: false,
            error: "Failed to create channel",
        });
    }
};
exports.createChannel = createChannel;
const getChannels = async (req, res) => {
    try {
        const { tenantId } = req;
        const userId = req.user.id;
        const channels = await database_1.prisma.channel.findMany({
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
    }
    catch (error) {
        console.error("Error fetching channels:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch channels",
        });
    }
};
exports.getChannels = getChannels;
const getChannelById = async (req, res) => {
    try {
        const { tenantId } = req;
        const { id } = req.params;
        const userId = req.user.id;
        const channel = await database_1.prisma.channel.findFirst({
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
    }
    catch (error) {
        console.error("Error fetching channel:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch channel",
        });
    }
};
exports.getChannelById = getChannelById;
// Get all public channels in tenant (for discovery)
const getPublicChannels = async (req, res) => {
    try {
        const { tenantId } = req;
        const userId = req.user.id;
        const channels = await database_1.prisma.channel.findMany({
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
    }
    catch (error) {
        console.error("Error fetching public channels:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch public channels",
        });
    }
};
exports.getPublicChannels = getPublicChannels;
// Join a public channel
const joinChannel = async (req, res) => {
    try {
        const { tenantId } = req;
        const userId = req.user.id;
        const { id } = req.params;
        // Check if channel exists and is public
        const channel = await database_1.prisma.channel.findFirst({
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
        const existingMember = await database_1.prisma.channelMember.findUnique({
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
        await database_1.prisma.channelMember.create({
            data: {
                channelId: id,
                userId,
                role: "member"
            }
        });
        // Fetch updated channel with members
        const updatedChannel = await database_1.prisma.channel.findUnique({
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
    }
    catch (error) {
        console.error("Error joining channel:", error);
        res.status(500).json({
            success: false,
            error: "Failed to join channel",
        });
    }
};
exports.joinChannel = joinChannel;
// Add members to a channel (owner/admin only)
const addMembersToChannel = async (req, res) => {
    try {
        const { tenantId } = req;
        const userId = req.user.id;
        const { id } = req.params;
        const { memberIds } = req.body;
        if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: "memberIds array is required",
            });
        }
        // Check if user is member of channel
        const membership = await database_1.prisma.channelMember.findUnique({
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
        const channel = await database_1.prisma.channel.findUnique({
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
        const newMembers = memberIds.map((mid) => ({
            channelId: id,
            userId: mid,
            role: "member"
        }));
        await database_1.prisma.channelMember.createMany({
            data: newMembers,
            skipDuplicates: true // Ignore if already member
        });
        // Fetch updated channel
        const updatedChannel = await database_1.prisma.channel.findUnique({
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
    }
    catch (error) {
        console.error("Error adding members:", error);
        res.status(500).json({
            success: false,
            error: "Failed to add members",
        });
    }
};
exports.addMembersToChannel = addMembersToChannel;
//# sourceMappingURL=channelController.js.map