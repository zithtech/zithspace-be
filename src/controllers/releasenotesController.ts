// import { Response } from "express";
// import { prisma } from "@/config/database";
// import {
//   AuthRequest,
//   ApiResponse,
//   NotFoundError,
//   ValidationError,
// } from "@/types";
// import { Environment, Visibility, ReleaseStatus } from "@prisma/client";

// // Simple interfaces if Create/Update types missing
// interface CreateReleaseNoteData {
//   title: string;
//   version: string;
//   projectId: string;
//   releaseDate?: string | Date;
//   environment?: string;
//   summary?: Record<string, any>;
//   keyInsights?: Record<string, any>;
//   newFeatures?: Record<string, any>;
//   improvements?: Record<string, any>;
//   bugFixes?: Record<string, any>;
//   breakingChanges?: Record<string, any>;
//   apiChanges?: Record<string, any>;
//   databaseChanges?: Record<string, any>;
//   knownIssues?: Record<string, any>;
//   linkedTickets?: string[];
//   repositories?: string[];
//   pullRequests?: string[];
//   visibility?: string[];
//   status?: string;
// }

// interface UpdateReleaseNoteData extends Partial<CreateReleaseNoteData> {}

// export class ReleaseNotesController {
//   /** GET all release notes (tenant-aware, paginated, filterable) */
//   static async getReleaseNotes(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({
//           success: false,
//           error: "Tenant context required",
//         } as ApiResponse);
//         return;
//       }

//       const {
//         page = "1",
//         limit = "20",
//         projectId,
//         version,
//         status,
//         search,
//         sortBy = "releaseDate",
//         sortOrder = "desc",
//       } = req.query;

//       const where: any = { tenantId: req.tenantId };

//       if (projectId) where.projectId = projectId;
//       if (version) where.version = version;
//       if (status) where.status = status;

//       if (search) {
//         where.OR = [
//           { title: { contains: search as string, mode: "insensitive" } },
//           { version: { contains: search as string, mode: "insensitive" } },
//         ];
//       }

//       const orderBy: any = {
//         [sortBy as string]: sortOrder === "desc" ? "desc" : "asc",
//       };
//       const skip = (Number(page) - 1) * Number(limit);

//       const [releaseNotes, total] = await Promise.all([
//         prisma.releaseNote.findMany({
//           where,
//           include: { project: true },
//           orderBy,
//           skip,
//           take: Number(limit),
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

//   /** GET release note by ID */
//   static async getReleaseNoteById(
//     req: AuthRequest,
//     res: Response,
//   ): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({
//           success: false,
//           error: "Tenant context required",
//         } as ApiResponse);
//         return;
//       }

//       const { id } = req.params;

//       const releaseNote = await prisma.releaseNote.findFirst({
//         where: { id, tenantId: req.tenantId },
//         include: { project: true },
//       });

//       if (!releaseNote) {
//         res.status(404).json({
//           success: false,
//           error: "Release note not found",
//         } as ApiResponse);
//         return;
//       }

//       res.status(200).json({ success: true, data: releaseNote } as ApiResponse);
//     } catch (error) {
//       console.error("Get release note by ID error:", error);
//       res.status(500).json({
//         success: false,
//         error: "Failed to fetch release note",
//       } as ApiResponse);
//     }
//   }

//   /** CREATE release note */
//   static async createReleaseNote(
//     req: AuthRequest,
//     res: Response,
//   ): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({
//           success: false,
//           error: "Tenant context required",
//         } as ApiResponse);
//         return;
//       }

//       const data: CreateReleaseNoteData = req.body;

//       if (!data.title || !data.version || !data.projectId) {
//         res.status(400).json({
//           success: false,
//           error: "Title, version, and projectId are required",
//         } as ApiResponse);
//         return;
//       }

//       const project = await prisma.project.findFirst({
//         where: { id: data.projectId, tenantId: req.tenantId },
//       });

//       if (!project) {
//         res.status(400).json({
//           success: false,
//           error: "Project not found in this tenant",
//         } as ApiResponse);
//         return;
//       }
//       const env: Environment =
//         (data.environment as Environment) || Environment.DEV;

//       const vis: Visibility[] = (data.visibility || ["INTERNAL"]).map(
//         (v) => Visibility[v as keyof typeof Visibility],
//       );

//       // const status: ReleaseStatus = data.status
//       //   ? ReleaseStatus[data.status as keyof typeof ReleaseStatus]
//       //   : ReleaseStatus.DRAFT;
//       let status: ReleaseStatus = ReleaseStatus.DRAFT; // default
    
//     if (data.status === "RELEASED") {
//       status = ReleaseStatus.RELEASED;
//     } else if (data.status === "DRAFT") {
//       status = ReleaseStatus.DRAFT;
//     }

//       const releaseNote = await prisma.releaseNote.create({
//         data: {
//           tenantId: req.tenantId,
//           projectId: data.projectId,
//           version: data.version,
//           title: data.title,
//           releaseDate: data.releaseDate
//             ? new Date(data.releaseDate)
//             : new Date(),
//           environment: env,
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
//           visibility: vis,
//           status: status,
//           createdBy: req.user.id,
//         },
//         include: { project: true },
//       });

//       res.status(201).json({
//         success: true,
//         data: releaseNote,
//         message: "Release note created successfully",
//       } as ApiResponse);
//     } catch (error: any) {
//       console.error("Create release note error:", error);

//       // send the real error message in response
//       res.status(500).json({
//         success: false,
//         error: error.message || "Failed to create release note",
//       } as ApiResponse);
//     }
//   }

//   /** UPDATE release note */
//   //   static async updateReleaseNote(
//   //     req: AuthRequest,
//   //     res: Response,
//   //   ): Promise<void> {
//   //     try {
//   //       if (!req.tenantId || !req.user) {
//   //         res.status(400).json({
//   //           success: false,
//   //           error: "Tenant context required",
//   //         } as ApiResponse);
//   //         return;
//   //       }

//   //       const { id } = req.params;
//   //       const updates: UpdateReleaseNoteData = req.body;

//   //       const existing = await prisma.releaseNote.findFirst({
//   //         where: { id, tenantId: req.tenantId },
//   //       });

//   //       if (!existing) {
//   //         res.status(404).json({
//   //           success: false,
//   //           error: "Release note not found in this tenant",
//   //         } as ApiResponse);
//   //         return;
//   //       }

//   //       const updated = await prisma.releaseNote.update({
//   //         where: { id },
//   //         data: { ...updates, updatedAt: new Date(), updatedBy: req.user.id },
//   //         include: { project: true },
//   //       });

//   //       res.status(200).json({
//   //         success: true,
//   //         data: updated,
//   //         message: "Release note updated successfully",
//   //       } as ApiResponse);
//   //     } catch (error: any) {
//   //       console.error("Update release note error:", error);
//   //       res.status(500).json({
//   //         success: false,
//   //         error: "Failed to update release note",
//   //       } as ApiResponse);
//   //     }
//   //   }
//   static async updateReleaseNote(
//     req: AuthRequest,
//     res: Response,
//   ): Promise<void> {
//     try {
//       // 1️⃣ Check tenant and user context
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({
//           success: false,
//           error: "Tenant context required",
//         } as ApiResponse);
//         return;
//       }

//       const { id } = req.params;
//       const updates: any = req.body; // We'll safely type cast below

//       // 2️⃣ Check if release note exists for this tenant
//       const existing = await prisma.releaseNote.findFirst({
//         where: { id, tenantId: req.tenantId },
//       });

//       if (!existing) {
//         res.status(404).json({
//           success: false,
//           error: "Release note not found in this tenant",
//         } as ApiResponse);
//         return;
//       }

//       // 3️⃣ Prepare update data
//       const updatesData: any = { ...updates };

//       // ✅ Handle enums safely
//       if (updates.environment)
//         updatesData.environment = updates.environment as Environment;
//       if (updates.status) updatesData.status = updates.status as ReleaseStatus;
//       if (updates.visibility) {
//         updatesData.visibility = (updates.visibility as string[]).map(
//           (v) => Visibility[v as keyof typeof Visibility],
//         );
//       }

//       // ✅ Include mandatory fields
//       updatesData.updatedAt = new Date();
//       updatesData.updatedBy = req.user.id;

//       // 4️⃣ Handle projectId update if provided
//       if (updates.projectId) {
//         const project = await prisma.project.findFirst({
//           where: { id: updates.projectId, tenantId: req.tenantId },
//         });
//         if (!project) {
//           throw new ValidationError("Project does not exist in this tenant");
//         }
//         updatesData.projectId = updates.projectId;
//       }

//       // 5️⃣ Remove fields that should not be updated directly
//       delete updatesData.tenantId;
//       delete updatesData.createdAt;
//       delete updatesData.createdBy;

//       // 6️⃣ Perform update
//       const updated = await prisma.releaseNote.update({
//         where: { id },
//         data: updatesData,
//         include: { project: true },
//       });

//       res.status(200).json({
//         success: true,
//         data: updated,
//         message: "Release note updated successfully",
//       } as ApiResponse);
//     } catch (error: any) {
//       console.error("Update release note error:", error);

//       //   if (error instanceof ValidationError) {
//       //     return res.status(400).json({
//       //       success: false,
//       //       error: error.message,
//       //     } as ApiResponse);
//       //   }
//       if (error instanceof ValidationError) {
//         res.status(400).json({
//           success: false,
//           error: error.message,
//         } as ApiResponse);
//         return; // just return nothing, to stop execution
//       }

//       res.status(500).json({
//         success: false,
//         error: "Failed to update release note",
//       } as ApiResponse);
//     }
//   }

 
// static async deleteReleaseNote(
//   req: AuthRequest,
//   res: Response,
// ): Promise<void> {
//   try {
//     if (!req.tenantId || !req.user) {
//       res.status(400).json({
//         success: false,
//         error: "Tenant context required",
//       } as ApiResponse);
//       return;
//     }

//     const { id } = req.params;

//     // Check if the release note exists in this tenant
//     const existing = await prisma.releaseNote.findFirst({
//       where: { id, tenantId: req.tenantId },
//     });

//     if (!existing) {
//       res.status(404).json({
//         success: false,
//         error: "Release note not found in this tenant",
//       } as ApiResponse);
//       return;
//     }

//     // HARD DELETE
//     await prisma.releaseNote.delete({
//       where: { id },
//     });

//     res.status(200).json({
//       success: true,
//       message: "Release note permanently deleted",
//     } as ApiResponse);
//   } catch (error: any) {
//     console.error("Delete release note error:", error);
//     res.status(500).json({
//       success: false,
//       error: "Failed to delete release note",
//     } as ApiResponse);
//   }
// }

// }

// export default ReleaseNotesController;
import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";
import { Visibility, ReleaseStatus } from "@prisma/client";

// Simple interfaces if Create/Update types missing
interface CreateReleaseNoteData {
  title: string;
  version: string;
  projectId: string;
  releaseDate?: string | Date;
  environment?: string;
  summary?: Record<string, any>;
  keyInsights?: Record<string, any>;
  newFeatures?: Record<string, any>;
  improvements?: Record<string, any>;
  bugFixes?: Record<string, any>;
  breakingChanges?: Record<string, any>;
  apiChanges?: Record<string, any>;
  databaseChanges?: Record<string, any>;
  knownIssues?: Record<string, any>;
  linkedTickets?: string[];
  repositories?: string[];
  pullRequests?: string[];
  visibility?: string[];
  status?: string;
}

interface UpdateReleaseNoteData extends Partial<CreateReleaseNoteData> {}

export class ReleaseNotesController {
  /** GET all release notes (tenant-aware, paginated, filterable) */
  static async getReleaseNotes(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }

      const {
        page = "1",
        limit = "20",
        projectId,
        version,
        status,
        search,
        sortBy = "releaseDate",
        sortOrder = "desc",
      } = req.query;

      const where: any = { tenantId: req.tenantId };

      if (projectId) where.projectId = projectId;
      if (version) where.version = version;
      if (status) where.status = status;

      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: "insensitive" } },
          { version: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const orderBy: any = {
        [sortBy as string]: sortOrder === "desc" ? "desc" : "asc",
      };
      const skip = (Number(page) - 1) * Number(limit);

      const [releaseNotes, total] = await Promise.all([
        prisma.releaseNote.findMany({
          where,
          include: { project: true },
          orderBy,
          skip,
          take: Number(limit),
        }),
        prisma.releaseNote.count({ where }),
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
      } as ApiResponse);
    } catch (error) {
      console.error("Get release notes error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch release notes",
      } as ApiResponse);
    }
  }

  /** GET release note by ID */
  static async getReleaseNoteById(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const releaseNote = await prisma.releaseNote.findFirst({
        where: { id, tenantId: req.tenantId },
        include: { project: true },
      });

      if (!releaseNote) {
        res.status(404).json({
          success: false,
          error: "Release note not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: releaseNote } as ApiResponse);
    } catch (error) {
      console.error("Get release note by ID error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch release note",
      } as ApiResponse);
    }
  }

  /** CREATE release note */
  static async createReleaseNote(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }

      const data: CreateReleaseNoteData = req.body;

      if (!data.title || !data.version || !data.projectId) {
        res.status(400).json({
          success: false,
          error: "Title, version, and projectId are required",
        } as ApiResponse);
        return;
      }

      const project = await prisma.project.findFirst({
        where: { id: data.projectId, tenantId: req.tenantId },
      });

      if (!project) {
        res.status(400).json({
          success: false,
          error: "Project not found in this tenant",
        } as ApiResponse);
        return;
      }

      const vis: Visibility[] = (data.visibility || ["INTERNAL"]).map(
        (v) => Visibility[v as keyof typeof Visibility],
      );

      // const status: ReleaseStatus = data.status
      //   ? ReleaseStatus[data.status as keyof typeof ReleaseStatus]
      //   : ReleaseStatus.DRAFT;
      let status: ReleaseStatus = ReleaseStatus.DRAFT; // default
    
    if (data.status === "RELEASED") {
      status = ReleaseStatus.RELEASED;
    } else if (data.status === "DRAFT") {
      status = ReleaseStatus.DRAFT;
    }

      const releaseNote = await prisma.releaseNote.create({
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Create release note error:", error);

      // send the real error message in response
      res.status(500).json({
        success: false,
        error: error.message || "Failed to create release note",
      } as ApiResponse);
    }
  }

  /** UPDATE release note */
  //   static async updateReleaseNote(
  //     req: AuthRequest,
  //     res: Response,
  //   ): Promise<void> {
  //     try {
  //       if (!req.tenantId || !req.user) {
  //         res.status(400).json({
  //           success: false,
  //           error: "Tenant context required",
  //         } as ApiResponse);
  //         return;
  //       }

  //       const { id } = req.params;
  //       const updates: UpdateReleaseNoteData = req.body;

  //       const existing = await prisma.releaseNote.findFirst({
  //         where: { id, tenantId: req.tenantId },
  //       });

  //       if (!existing) {
  //         res.status(404).json({
  //           success: false,
  //           error: "Release note not found in this tenant",
  //         } as ApiResponse);
  //         return;
  //       }

  //       const updated = await prisma.releaseNote.update({
  //         where: { id },
  //         data: { ...updates, updatedAt: new Date(), updatedBy: req.user.id },
  //         include: { project: true },
  //       });

  //       res.status(200).json({
  //         success: true,
  //         data: updated,
  //         message: "Release note updated successfully",
  //       } as ApiResponse);
  //     } catch (error: any) {
  //       console.error("Update release note error:", error);
  //       res.status(500).json({
  //         success: false,
  //         error: "Failed to update release note",
  //       } as ApiResponse);
  //     }
  //   }
  static async updateReleaseNote(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      // 1️⃣ Check tenant and user context
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const updates: any = req.body; // We'll safely type cast below

      // 2️⃣ Check if release note exists for this tenant
      const existing = await prisma.releaseNote.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Release note not found in this tenant",
        } as ApiResponse);
        return;
      }

      // 3️⃣ Prepare update data
      const updatesData: any = { ...updates };
      if (updates.status) updatesData.status = updates.status as ReleaseStatus;
      if (updates.visibility) {
        updatesData.visibility = (updates.visibility as string[]).map(
          (v) => Visibility[v as keyof typeof Visibility],
        );
      }

      // ✅ Include mandatory fields
      updatesData.updatedAt = new Date();
      updatesData.updatedBy = req.user.id;

      // 4️⃣ Handle projectId update if provided
      if (updates.projectId) {
        const project = await prisma.project.findFirst({
          where: { id: updates.projectId, tenantId: req.tenantId },
        });
        if (!project) {
          throw new ValidationError("Project does not exist in this tenant");
        }
        updatesData.projectId = updates.projectId;
      }

      // 5️⃣ Remove fields that should not be updated directly
      delete updatesData.tenantId;
      delete updatesData.createdAt;
      delete updatesData.createdBy;

      // 6️⃣ Perform update
      const updated = await prisma.releaseNote.update({
        where: { id },
        data: updatesData,
        include: { project: true },
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: "Release note updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update release note error:", error);

      //   if (error instanceof ValidationError) {
      //     return res.status(400).json({
      //       success: false,
      //       error: error.message,
      //     } as ApiResponse);
      //   }
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return; // just return nothing, to stop execution
      }

      res.status(500).json({
        success: false,
        error: "Failed to update release note",
      } as ApiResponse);
    }
  }

 
static async deleteReleaseNote(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    if (!req.tenantId || !req.user) {
      res.status(400).json({
        success: false,
        error: "Tenant context required",
      } as ApiResponse);
      return;
    }

    const { id } = req.params;

    // Check if the release note exists in this tenant
    const existing = await prisma.releaseNote.findFirst({
      where: { id, tenantId: req.tenantId },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        error: "Release note not found in this tenant",
      } as ApiResponse);
      return;
    }

    // HARD DELETE
    await prisma.releaseNote.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Release note permanently deleted",
    } as ApiResponse);
  } catch (error: any) {
    console.error("Delete release note error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete release note",
    } as ApiResponse);
  }
}

}

export default ReleaseNotesController;

