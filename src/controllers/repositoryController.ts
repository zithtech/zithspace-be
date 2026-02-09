
import { Request, Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class RepositoryController {
    /**
     * Get all repositories for the current tenant
     */
    static async getRepositories(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context required" } as ApiResponse);
                return;
            }

            const repositories = await prisma.repository.findMany({
                where: {
                    tenantId: req.tenantId,
                    isActive: true
                },
                orderBy: { name: "asc" },
            });

            res.status(200).json({
                success: true,
                data: repositories,
            } as ApiResponse);
        } catch (error) {
            console.error("Get repositories error:", error);
            res.status(500).json({ success: false, error: "Failed to fetch repositories" } as ApiResponse);
        }
    }

    /**
     * Create a new repository
     */
    static async createRepository(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context required" } as ApiResponse);
                return;
            }

            const { name, url, description } = req.body;

            if (!name || !url) {
                res.status(400).json({ success: false, error: "Name and URL are required" } as ApiResponse);
                return;
            }

            // Check for duplicate name
            const existing = await prisma.repository.findUnique({
                where: {
                    tenantId_name: {
                        tenantId: req.tenantId,
                        name,
                    },
                },
            });

            if (existing) {
                res.status(400).json({ success: false, error: "Repository with this name already exists" } as ApiResponse);
                return;
            }

            const repository = await prisma.repository.create({
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
            } as ApiResponse);
        } catch (error) {
            console.error("Create repository error:", error);
            res.status(500).json({ success: false, error: "Failed to create repository" } as ApiResponse);
        }
    }
}
