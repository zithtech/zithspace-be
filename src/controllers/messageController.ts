import { Request, Response } from "express";
import { recordTransaction, Section, Module, Page, Action, EntityType } from "@/utils/transactionHistory";
import { prisma } from "@/config/database";
import { z } from "zod";

const createMessageSchema = z.object({
    content: z.string().min(1),
    type: z.enum(["text", "system", "file"]).default("text"),
    attachments: z.any().optional(), // JSON
});

export const createMessage = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req as any;
        const { channelId } = req.params;
        const userId = (req as any).user.id;

        const validated = createMessageSchema.parse(req.body);

        // Verify channel membership
        const membership = await prisma.channelMember.findUnique({
            where: {
                channelId_userId: {
                    channelId,
                    userId,
                },
            },
        });

        if (!membership) {
            return res.status(403).json({
                success: false,
                error: "You are not a member of this channel",
            });
        }

        const message = await prisma.channelMessage.create({
            data: {
                channelId,
                userId,
                content: validated.content,
                type: validated.type,
                attachments: validated.attachments || [],
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        workEmail: true, // avatar?
                    },
                },
            },
        });

        // Update channel lastMessageAt
        await prisma.channel.update({
            where: { id: channelId },
            data: { lastMessageAt: new Date() },
        });

        // Trigger global notification
        try {
            // Get all channel members except sender
            const members = await prisma.channelMember.findMany({
                where: {
                    channelId,
                    userId: { not: userId }
                },
                select: { userId: true }
            });

            const recipientIds = members.map(m => m.userId);

            if (recipientIds.length > 0) {
                const streamUrl = process.env.STREAM_URL || 'https://zithspace-stream.partners-58b.workers.dev';

                // Fire and forget notification
                fetch(`${streamUrl}/notify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userIds: recipientIds,
                        payload: {
                            type: 'CHAT_MESSAGE',
                            channelId,
                            content: validated.content,
                            senderName: (req as any).user.name,
                            senderId: userId,
                            createdAt: message.createdAt
                        }
                    })
                }).catch(err => console.error('Failed to send notification:', err));
            }
        } catch (err) {
            console.error('Error triggering notification:', err);
            // Don't fail the request if notification fails
        }

        res.status(201).json({
            success: true,
            data: message,
        });
    } catch (error) {
        console.error("Error creating message:", error);
        res.status(500).json({
            success: false,
            error: "Failed to create message",
        });
    }
};

export const getMessages = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req as any;
        const { channelId } = req.params;
        const userId = (req as any).user.id;
        const { cursor, limit = 50 } = req.query;

        // Verify channel membership
        const membership = await prisma.channelMember.findUnique({
            where: {
                channelId_userId: {
                    channelId,
                    userId,
                },
            },
        });

        if (!membership) {
            return res.status(403).json({
                success: false,
                error: "You are not a member of this channel",
            });
        }

        const messages = await prisma.channelMessage.findMany({
            where: {
                channelId,
                isDeleted: false,
            },
            take: Number(limit),
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: String(cursor) } : undefined,
            orderBy: {
                createdAt: "desc",
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        workEmail: true,
                    },
                },
            },
        });

        res.status(200).json({
            success: true,
            data: messages.reverse(), // Return in chronological order
            nextCursor: messages.length === Number(limit) ? messages[0].id : undefined,
        });
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch messages",
        });
    }
};
