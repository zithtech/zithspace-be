"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReleaseNotesController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
const client_1 = require("@prisma/client");
class ReleaseNotesController {
    /** GET all release notes (tenant-aware, paginated, filterable) */
    static async getReleaseNotes(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context required",
                });
                return;
            }
            const { page = "1", limit = "20", projectId, version, status, search, sortBy = "releaseDate", sortOrder = "desc", } = req.query;
            const where = { tenantId: req.tenantId };
            if (projectId)
                where.projectId = projectId;
            if (version)
                where.version = version;
            if (status)
                where.status = status;
            if (search) {
                where.OR = [
                    { title: { contains: search, mode: "insensitive" } },
                    { version: { contains: search, mode: "insensitive" } },
                ];
            }
            const orderBy = {
                [sortBy]: sortOrder === "desc" ? "desc" : "asc",
            };
            const skip = (Number(page) - 1) * Number(limit);
            const [releaseNotes, total] = await Promise.all([
                database_1.prisma.releaseNote.findMany({
                    where,
                    include: { project: true },
                    orderBy,
                    skip,
                    take: Number(limit),
                }),
                database_1.prisma.releaseNote.count({ where }),
            ]);
            const totalPages = Math.ceil(total / Number(limit));
            res.status(200).json({
                success: true,
                data: releaseNotes,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: totalPages,
                    hasNext: Number(page) < totalPages,
                    hasPrev: Number(page) > 1,
                },
            });
        }
        catch (error) {
            console.error("Get release notes error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch release notes",
            });
        }
    }
    /** GET release note by ID */
    static async getReleaseNoteById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context required",
                });
                return;
            }
            const { id } = req.params;
            const releaseNote = await database_1.prisma.releaseNote.findFirst({
                where: { id, tenantId: req.tenantId },
                include: { project: true },
            });
            if (!releaseNote) {
                res.status(404).json({
                    success: false,
                    error: "Release note not found",
                });
                return;
            }
            res.status(200).json({ success: true, data: releaseNote });
        }
        catch (error) {
            console.error("Get release note by ID error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch release note",
            });
        }
    }
    /** CREATE release note */
    static async createReleaseNote(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context required",
                });
                return;
            }
            const data = req.body;
            if (!data.title || !data.version || !data.projectId) {
                res.status(400).json({
                    success: false,
                    error: "Title, version, and projectId are required",
                });
                return;
            }
            const project = await database_1.prisma.project.findFirst({
                where: { id: data.projectId, tenantId: req.tenantId },
            });
            if (!project) {
                res.status(400).json({
                    success: false,
                    error: "Project not found in this tenant",
                });
                return;
            }
            const vis = (data.visibility || ["INTERNAL"]).map((v) => client_1.Visibility[v]);
            // const status: ReleaseStatus = data.status
            //   ? ReleaseStatus[data.status as keyof typeof ReleaseStatus]
            //   : ReleaseStatus.DRAFT;
            let status = client_1.ReleaseStatus.DRAFT; // default
            if (data.status === "RELEASED") {
                status = client_1.ReleaseStatus.RELEASED;
            }
            else if (data.status === "DRAFT") {
                status = client_1.ReleaseStatus.DRAFT;
            }
            const releaseNote = await database_1.prisma.releaseNote.create({
                data: {
                    tenantId: req.tenantId,
                    projectId: data.projectId,
                    version: data.version,
                    title: data.title,
                    releaseDate: data.releaseDate
                        ? new Date(data.releaseDate)
                        : new Date(),
                    environment: data.environment,
                    summary: data.summary || {},
                    keyInsights: data.keyInsights || {},
                    newFeatures: data.newFeatures || {},
                    improvements: data.improvements || {},
                    bugFixes: data.bugFixes || {},
                    breakingChanges: data.breakingChanges || {},
                    apiChanges: data.apiChanges || {},
                    databaseChanges: data.databaseChanges || {},
                    knownIssues: data.knownIssues || {},
                    linkedTickets: data.linkedTickets || [],
                    repositories: data.repositories || [],
                    pullRequests: data.pullRequests || [],
                    visibility: vis,
                    status: status,
                    createdBy: req.user.id,
                },
                include: { project: true },
            });
            res.status(201).json({
                success: true,
                data: releaseNote,
                message: "Release note created successfully",
            });
        }
        catch (error) {
            console.error("Create release note error:", error);
            // send the real error message in response
            res.status(500).json({
                success: false,
                error: error.message || "Failed to create release note",
            });
        }
    }
    static async updateReleaseNote(req, res) {
        try {
            // 1️⃣ Check tenant and user context
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context required",
                });
                return;
            }
            const { id } = req.params;
            const updates = req.body; // We'll safely type cast below
            // 2️⃣ Check if release note exists for this tenant
            const existing = await database_1.prisma.releaseNote.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Release note not found in this tenant",
                });
                return;
            }
            // 3️⃣ Prepare update data
            const updatesData = { ...updates };
            if (updates.status)
                updatesData.status = updates.status;
            if (updates.visibility) {
                updatesData.visibility = updates.visibility.map((v) => client_1.Visibility[v]);
            }
            // ✅ Include mandatory fields
            updatesData.updatedAt = new Date();
            updatesData.updatedBy = req.user.id;
            // 4️⃣ Handle projectId update if provided
            if (updates.projectId) {
                const project = await database_1.prisma.project.findFirst({
                    where: { id: updates.projectId, tenantId: req.tenantId },
                });
                if (!project) {
                    throw new types_1.ValidationError("Project does not exist in this tenant");
                }
                updatesData.projectId = updates.projectId;
            }
            // 5️⃣ Remove fields that should not be updated directly
            delete updatesData.tenantId;
            delete updatesData.createdAt;
            delete updatesData.createdBy;
            // 6️⃣ Perform update
            const updated = await database_1.prisma.releaseNote.update({
                where: { id },
                data: updatesData,
                include: { project: true },
            });
            res.status(200).json({
                success: true,
                data: updated,
                message: "Release note updated successfully",
            });
        }
        catch (error) {
            console.error("Update release note error:", error);
            //   if (error instanceof ValidationError) {
            //     return res.status(400).json({
            //       success: false,
            //       error: error.message,
            //     } as ApiResponse);
            //   }
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message,
                });
                return; // just return nothing, to stop execution
            }
            res.status(500).json({
                success: false,
                error: "Failed to update release note",
            });
        }
    }
    static async deleteReleaseNote(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context required",
                });
                return;
            }
            const { id } = req.params;
            // Check if the release note exists in this tenant
            const existing = await database_1.prisma.releaseNote.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Release note not found in this tenant",
                });
                return;
            }
            // HARD DELETE
            await database_1.prisma.releaseNote.delete({
                where: { id },
            });
            res.status(200).json({
                success: true,
                message: "Release note permanently deleted",
            });
        }
        catch (error) {
            console.error("Delete release note error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete release note",
            });
        }
    }
}
exports.ReleaseNotesController = ReleaseNotesController;
exports.default = ReleaseNotesController;
//# sourceMappingURL=releasenotesController.js.map