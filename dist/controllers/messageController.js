"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMessages = exports.createMessage = void 0;
const database_1 = require("@/config/database");
const zod_1 = require("zod");
const createMessageSchema = zod_1.z.object({
    content: zod_1.z.string().min(1),
    type: zod_1.z.enum(["text", "system", "file"]).default("text"),
    attachments: zod_1.z.any().optional(), // JSON
});
const createMessage = async (req, res) => {
    try {
        const { tenantId } = req;
        const { channelId } = req.params;
        const userId = req.user.id;
        const validated = createMessageSchema.parse(req.body);
        // Verify channel membership
        const membership = await database_1.prisma.channelMember.findUnique({
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
        const message = await database_1.prisma.channelMessage.create({
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
        await database_1.prisma.channel.update({
            where: { id: channelId },
            data: { lastMessageAt: new Date() },
        });
        // Trigger global notification
        try {
            // Get all channel members except sender
            const members = await database_1.prisma.channelMember.findMany({
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
                            senderName: req.user.name,
                            senderId: userId,
                            createdAt: message.createdAt
                        }
                    })
                }).catch(err => console.error('Failed to send notification:', err));
            }
        }
        catch (err) {
            console.error('Error triggering notification:', err);
            // Don't fail the request if notification fails
        }
        res.status(201).json({
            success: true,
            data: message,
        });
    }
    catch (error) {
        console.error("Error creating message:", error);
        res.status(500).json({
            success: false,
            error: "Failed to create message",
        });
    }
};
exports.createMessage = createMessage;
const getMessages = async (req, res) => {
    try {
        const { tenantId } = req;
        const { channelId } = req.params;
        const userId = req.user.id;
        const { cursor, limit = 50 } = req.query;
        // Verify channel membership
        const membership = await database_1.prisma.channelMember.findUnique({
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
        const messages = await database_1.prisma.channelMessage.findMany({
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
    }
    catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch messages",
        });
    }
};
exports.getMessages = getMessages;
//# sourceMappingURL=messageController.js.map