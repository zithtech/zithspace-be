// import { Response } from "express";
// import { prisma } from "@/config/database";
// import {
//   AuthRequest,
//   ApiResponse,
//   NotFoundError,
//   ValidationError,
// } from "@/types";

// export class ReleaseNotesController {

//   /**
//    * Get all release notes (tenant-aware with pagination)
//    */
//   static async getReleaseNotes(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({
//           success: false,
//           error: "Tenant context and authentication required",
//         } as ApiResponse);
//         return;
//       }

//       const {
//         page = 1,
//         limit = 20,
//         status,
//         search,
//         sortBy = "releaseDate",
//         sortOrder = "desc",
//       } = req.query;

//       const where: any = {
//         tenantId: req.tenantId,
//       };

//       if (status) where.status = status;

//       if (search) {
//         where.OR = [
//           { title: { contains: search as string, mode: "insensitive" } },
//           { version: { contains: search as string, mode: "insensitive" } },
//           { project: { contains: search as string, mode: "insensitive" } },
//         ];
//       }

//       const orderBy: any = {};
//       orderBy[sortBy as string] = sortOrder === "asc" ? "asc" : "desc";

//       const skip = (Number(page) - 1) * Number(limit);

//       const [releaseNotes, total] = await Promise.all([
//         prisma.releaseNote.findMany({
//           where,
//           orderBy,
//           skip,
//           take: Number(limit),
//           select: {
//             id: true,
//             title: true,
//             version: true,
//             project: true,
//             releaseDate: true,
//             environment: true,
//             status: true,
//             createdAt: true,
//           },
//         }),
//         prisma.releaseNote.count({ where }),
//       ]);

//       const totalPages = Math.ceil(total / Number(limit));

//       res.status(200).json({
//         success: true,
//         data: releaseNotes,
//         pagination: {
//           page: Number(page),
//           limit: Number(limit),
//           total,
//           pages: totalPages,
//           hasNext: Number(page) < totalPages,
//           hasPrev: Number(page) > 1,
//         },
//       } as ApiResponse);

//     } catch (error) {
//       console.error("Get release notes error:", error);
//       res.status(500).json({
//         success: false,
//         error: "Failed to fetch release notes",
//       } as ApiResponse);
//     }
//   }

//   /**
//    * Get release note by ID
//    */
//   static async getReleaseNoteById(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({
//           success: false,
//           error: "Tenant context and authentication required",
//         } as ApiResponse);
//         return;
//       }

//       const { id } = req.params;

//       const releaseNote = await prisma.releaseNote.findFirst({
//         where: {
//           id,
//           tenantId: req.tenantId,
//         },
//       });

//       if (!releaseNote) {
//         throw new NotFoundError("Release note not found in this tenant");
//       }

//       res.status(200).json({
//         success: true,
//         data: releaseNote,
//       } as ApiResponse);

//     } catch (error: any) {
//       console.error("Get release note by ID error:", error);

//       if (error instanceof NotFoundError) {
//         res.status(404).json({
//           success: false,
//           error: error.message,
//         } as ApiResponse);
//         return;
//       }

//       res.status(500).json({
//         success: false,
//         error: "Failed to fetch release note",
//       } as ApiResponse);
//     }
//   }

//   /**
//    * Create release note
//    */
//   static async createReleaseNote(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({
//           success: false,
//           error: "Tenant context and authentication required",
//         } as ApiResponse);
//         return;
//       }

//       const data = req.body;

//       if (!data.title || !data.version || !data.project || !data.releaseDate) {
//         throw new ValidationError(
//           "Title, Version, Project and Release Date are required"
//         );
//       }

//       const newRelease = await prisma.releaseNote.create({
//         data: {
//           tenantId: req.tenantId,
//           project: data.project,
//           version: data.version,
//           title: data.title,
//           releaseDate: new Date(data.releaseDate),
//           environment: data.environment,
//           summary: data.summary || {},
//           keyInsights: data.keyInsights || {},
//           newFeatures: data.newFeatures || {},
//           improvements: data.improvements || {},
//           bugFixes: data.bugFixes || {},
//           breakingChanges: data.breakingChanges || {},
//           apiChanges: data.apiChanges || {},
//           databaseChanges: data.databaseChanges || {},
//           knownIssues: data.knownIssues || {},
//           linkedTickets: data.linkedTickets || [],
//           repositories: data.repositories || [],
//           pullRequests: data.pullRequests || [],
//           visibility: data.visibility || [],
//           status: data.status || "DRAFT",
//         },
//       });

//       res.status(201).json({
//         success: true,
//         data: newRelease,
//         message: "Release note created successfully",
//       } as ApiResponse);

//     } catch (error: any) {
//       console.error("Create release note error:", error);

//       if (error instanceof ValidationError) {
//         res.status(400).json({
//           success: false,
//           error: error.message,
//         } as ApiResponse);
//         return;
//       }

//       res.status(500).json({
//         success: false,
//         error: "Failed to create release note",
//       } as ApiResponse);
//     }
//   }

//   /**
//    * Update release note
//    */
//   static async updateReleaseNote(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({
//           success: false,
//           error: "Tenant context and authentication required",
//         } as ApiResponse);
//         return;
//       }

//       const { id } = req.params;
//       const updates = req.body;

//       const existing = await prisma.releaseNote.findFirst({
//         where: {
//           id,
//           tenantId: req.tenantId,
//         },
//       });

//       if (!existing) {
//         throw new NotFoundError("Release note not found in this tenant");
//       }

//       if (updates.releaseDate) {
//         updates.releaseDate = new Date(updates.releaseDate);
//       }

//       const updated = await prisma.releaseNote.update({
//         where: { id },
//         data: {
//           ...updates,
//           updatedAt: new Date(),
//         },
//       });

//       res.status(200).json({
//         success: true,
//         data: updated,
//         message: "Release note updated successfully",
//       } as ApiResponse);

//     } catch (error: any) {
//       console.error("Update release note error:", error);

//       if (error instanceof NotFoundError) {
//         res.status(404).json({
//           success: false,
//           error: error.message,
//         } as ApiResponse);
//         return;
//       }

//       res.status(500).json({
//         success: false,
//         error: "Failed to update release note",
//       } as ApiResponse);
//     }
//   }

//   /**
//    * Soft delete release note
//    */
//   static async deleteReleaseNote(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({
//           success: false,
//           error: "Tenant context and authentication required",
//         } as ApiResponse);
//         return;
//       }

//       const { id } = req.params;

//       const existing = await prisma.releaseNote.findFirst({
//         where: {
//           id,
//           tenantId: req.tenantId,
//         },
//       });

//       if (!existing) {
//         throw new NotFoundError("Release note not found in this tenant");
//       }

//       await prisma.releaseNote.delete({
//         where: { id },
//       });

//       res.status(200).json({
//         success: true,
//         message: "Release note deleted successfully",
//       } as ApiResponse);

//     } catch (error: any) {
//       console.error("Delete release note error:", error);

//       if (error instanceof NotFoundError) {
//         res.status(404).json({
//           success: false,
//           error: error.message,
//         } as ApiResponse);
//         return;
//       }

//       res.status(500).json({
//         success: false,
//         error: "Failed to delete release note",
//       } as ApiResponse);
//     }
//   }
// }

// export default ReleaseNotesController;
