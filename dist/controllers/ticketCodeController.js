"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketCodeController = void 0;
const database_1 = require("@/config/database");
class TicketCodeController {
    /**
     * Get all code metadata (branches, PRs) for a ticket
     */
    static async getTicketCodeMetadata(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context required" });
                return;
            }
            const { id } = req.params;
            const branches = await database_1.prisma.ticketBranch.findMany({
                where: { ticketId: id },
                include: { repository: true },
                orderBy: { createdAt: "desc" },
            });
            const pullRequests = await database_1.prisma.ticketPullRequest.findMany({
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
            });
        }
        catch (error) {
            console.error("Get ticket code metadata error:", error);
            res.status(500).json({ success: false, error: "Failed to fetch code metadata" });
        }
    }
    /**
     * Add a branch to a ticket
     */
    static async addBranch(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Authentication required" });
                return;
            }
            const { id } = req.params;
            const { repositoryId, name, url } = req.body;
            if (!repositoryId || !name) {
                res.status(400).json({ success: false, error: "Repository and Branch Name are required" });
                return;
            }
            const branch = await database_1.prisma.ticketBranch.create({
                data: {
                    ticketId: id,
                    repositoryId,
                    name,
                    url,
                },
                include: { repository: true },
            });
            // Log activity
            await database_1.prisma.ticketActivityLog.create({
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
            });
        }
        catch (error) {
            console.error("Add branch error:", error);
            res.status(500).json({ success: false, error: "Failed to link branch" });
        }
    }
    /**
     * Remove a branch from a ticket
     */
    static async removeBranch(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Authentication required" });
                return;
            }
            const { id, branchId } = req.params;
            const branch = await database_1.prisma.ticketBranch.findUnique({
                where: { id: branchId },
            });
            if (!branch) {
                res.status(404).json({ success: false, error: "Branch not found" });
                return;
            }
            await database_1.prisma.ticketBranch.delete({
                where: { id: branchId },
            });
            // Log activity
            await database_1.prisma.ticketActivityLog.create({
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
            });
        }
        catch (error) {
            console.error("Remove branch error:", error);
            res.status(500).json({ success: false, error: "Failed to remove branch" });
        }
    }
    /**
     * Add a Pull Request to a ticket
     */
    static async addPullRequest(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Authentication required" });
                return;
            }
            const { id } = req.params;
            const { repositoryId, url, title, number, state, branchName, branchUrl } = req.body;
            if (!repositoryId || !url) {
                res.status(400).json({ success: false, error: "Repository and URL are required" });
                return;
            }
            const pr = await database_1.prisma.ticketPullRequest.create({
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
            await database_1.prisma.ticketActivityLog.create({
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
            });
        }
        catch (error) {
            console.error("Add PR error:", error);
            res.status(500).json({ success: false, error: "Failed to link PR" });
        }
    }
    /**
     * Remove a Pull Request from a ticket
     */
    static async removePullRequest(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Authentication required" });
                return;
            }
            const { id, prId } = req.params;
            const pr = await database_1.prisma.ticketPullRequest.findUnique({ where: { id: prId } });
            if (!pr) {
                res.status(404).json({ success: false, error: "PR not found" });
                return;
            }
            await database_1.prisma.ticketPullRequest.delete({
                where: { id: prId },
            });
            // Log activity
            await database_1.prisma.ticketActivityLog.create({
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
            });
        }
        catch (error) {
            console.error("Remove PR error:", error);
            res.status(500).json({ success: false, error: "Failed to remove PR" });
        }
    }
}
exports.TicketCodeController = TicketCodeController;
//# sourceMappingURL=ticketCodeController.js.map