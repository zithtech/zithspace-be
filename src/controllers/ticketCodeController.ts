
import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class TicketCodeController {
    /**
     * Get all code metadata (branches, PRs) for a ticket
     */
    static async getTicketCodeMetadata(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context required" } as ApiResponse);
                return;
            }

            const { id } = req.params;

            const branches = await prisma.ticketBranch.findMany({
                where: { ticketId: id },
                include: { repository: true },
                orderBy: { createdAt: "desc" },
            });

            const pullRequests = await prisma.ticketPullRequest.findMany({
                where: { ticketId: id },
                include: { repository: true },
                orderBy: { createdAt: "desc" },
            });

            res.status(200).json({
                success: true,
                data: {
                    branches,
                    pullRequests,
                },
            } as ApiResponse);
        } catch (error) {
            console.error("Get ticket code metadata error:", error);
            res.status(500).json({ success: false, error: "Failed to fetch code metadata" } as ApiResponse);
        }
    }

    /**
     * Add a branch to a ticket
     */
    static async addBranch(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Authentication required" } as ApiResponse);
                return;
            }

            const { id } = req.params;
            const { repositoryId, name, url } = req.body;

            if (!repositoryId || !name) {
                res.status(400).json({ success: false, error: "Repository and Branch Name are required" } as ApiResponse);
                return;
            }

            const branch = await prisma.ticketBranch.create({
                data: {
                    ticketId: id,
                    repositoryId,
                    name,
                    url,
                },
                include: { repository: true },
            });

            // Log activity
            await prisma.ticketActivityLog.create({
                data: {
                    tenantId: req.tenantId,
                    ticketId: id,
                    performedById: req.user.id,
                    action: "updated",
                    details: {
                        field: "code_branch",
                        message: `Added branch: ${name}`,
                    },
                },
            });

            res.status(201).json({
                success: true,
                data: branch,
                message: "Branch linked successfully",
            } as ApiResponse);
        } catch (error) {
            console.error("Add branch error:", error);
            res.status(500).json({ success: false, error: "Failed to link branch" } as ApiResponse);
        }
    }

    /**
     * Remove a branch from a ticket
     */
    static async removeBranch(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Authentication required" } as ApiResponse);
                return;
            }

            const { id, branchId } = req.params;

            const branch = await prisma.ticketBranch.findUnique({
                where: { id: branchId },
            });

            if (!branch) {
                res.status(404).json({ success: false, error: "Branch not found" } as ApiResponse);
                return;
            }

            await prisma.ticketBranch.delete({
                where: { id: branchId },
            });

            // Log activity
            await prisma.ticketActivityLog.create({
                data: {
                    tenantId: req.tenantId,
                    ticketId: id,
                    performedById: req.user.id,
                    action: "updated",
                    details: {
                        field: "code_branch",
                        message: `Removed branch: ${branch.name}`,
                    },
                },
            });

            res.status(200).json({
                success: true,
                message: "Branch removed successfully",
            } as ApiResponse);
        } catch (error) {
            console.error("Remove branch error:", error);
            res.status(500).json({ success: false, error: "Failed to remove branch" } as ApiResponse);
        }
    }

    /**
     * Add a Pull Request to a ticket
     */
    static async addPullRequest(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Authentication required" } as ApiResponse);
                return;
            }

            const { id } = req.params;
            const { repositoryId, url, title, number, state, branchName, branchUrl } = req.body;

            if (!repositoryId || !url) {
                res.status(400).json({ success: false, error: "Repository and URL are required" } as ApiResponse);
                return;
            }

            const pr = await prisma.ticketPullRequest.create({
                data: {
                    ticketId: id,
                    repositoryId,
                    url,
                    title,
                    branchName,
                    branchUrl,
                    number: number ? parseInt(number) : undefined,
                    state: state || "open",
                },
                include: { repository: true },
            });

            // Log activity
            await prisma.ticketActivityLog.create({
                data: {
                    tenantId: req.tenantId,
                    ticketId: id,
                    performedById: req.user.id,
                    action: "updated",
                    details: {
                        field: "code_pr",
                        message: `Linked PR: ${url}`,
                    },
                },
            });

            res.status(201).json({
                success: true,
                data: pr,
                message: "PR linked successfully",
            } as ApiResponse);
        } catch (error) {
            console.error("Add PR error:", error);
            res.status(500).json({ success: false, error: "Failed to link PR" } as ApiResponse);
        }
    }

    /**
     * Remove a Pull Request from a ticket
     */
    static async removePullRequest(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Authentication required" } as ApiResponse);
                return;
            }

            const { id, prId } = req.params;

            const pr = await prisma.ticketPullRequest.findUnique({ where: { id: prId } });

            if (!pr) {
                res.status(404).json({ success: false, error: "PR not found" } as ApiResponse);
                return;
            }

            await prisma.ticketPullRequest.delete({
                where: { id: prId },
            });

            // Log activity
            await prisma.ticketActivityLog.create({
                data: {
                    tenantId: req.tenantId,
                    ticketId: id,
                    performedById: req.user.id,
                    action: "updated",
                    details: {
                        field: "code_pr",
                        message: `Removed PR: ${pr.url}`,
                    },
                },
            });

            res.status(200).json({
                success: true,
                message: "PR removed successfully",
            } as ApiResponse);
        } catch (error) {
            console.error("Remove PR error:", error);
            res.status(500).json({ success: false, error: "Failed to remove PR" } as ApiResponse);
        }
    }
}
