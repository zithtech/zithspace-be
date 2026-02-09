"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepositoryController = void 0;
const database_1 = require("@/config/database");
class RepositoryController {
    /**
     * Get all repositories for the current tenant
     */
    static async getRepositories(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context required" });
                return;
            }
            const repositories = await database_1.prisma.repository.findMany({
                where: {
                    tenantId: req.tenantId,
                    isActive: true
                },
                orderBy: { name: "asc" },
            });
            res.status(200).json({
                success: true,
                data: repositories,
            });
        }
        catch (error) {
            console.error("Get repositories error:", error);
            res.status(500).json({ success: false, error: "Failed to fetch repositories" });
        }
    }
    /**
     * Create a new repository
     */
    static async createRepository(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context required" });
                return;
            }
            const { name, url, description } = req.body;
            if (!name || !url) {
                res.status(400).json({ success: false, error: "Name and URL are required" });
                return;
            }
            // Check for duplicate name
            const existing = await database_1.prisma.repository.findUnique({
                where: {
                    tenantId_name: {
                        tenantId: req.tenantId,
                        name,
                    },
                },
            });
            if (existing) {
                res.status(400).json({ success: false, error: "Repository with this name already exists" });
                return;
            }
            const repository = await database_1.prisma.repository.create({
                data: {
                    tenantId: req.tenantId,
                    name,
                    url,
                    description,
                },
            });
            res.status(201).json({
                success: true,
                data: repository,
                message: "Repository created successfully",
            });
        }
        catch (error) {
            console.error("Create repository error:", error);
            res.status(500).json({ success: false, error: "Failed to create repository" });
        }
    }
}
exports.RepositoryController = RepositoryController;
//# sourceMappingURL=repositoryController.js.map