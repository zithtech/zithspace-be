// import { Response } from "express";
// import { prisma } from "@/config/database";
// import { AuthRequest, ApiResponse } from "@/types";
// import { uploadCandidateDocumentToR2 } from "@/utils/r2Client";

// /**
//  * Create a new candidate
//  */
// export const createCandidate = async (req: AuthRequest, res: Response): Promise<void> => {
//   try {
//     const tenantId = req.tenantId || req.user?.tenantId;
//     const createdById = req.user?.id;

//     if (!tenantId || !createdById) {
//       res.status(401).json({ success: false, error: "Unauthorized or missing tenant context." } as ApiResponse);
//       return;
//     }

//     const {
//       fullName,
//       email,
//       phone,
//       location,
//       totalExperience,
//       skills = [],
//       currentCompany,
//       currentSalary,
//       expectedSalary,
//       noticePeriod,
//       resume, // { base64, fileName }
//       linkedinUrl,
//       githubUrl,
//       portfolioUrl,
//       status,
//     } = req.body;

//     // Create candidate record first
//     const candidate = await prisma.generalCandidates.create({
//       data: {
//         tenantId,
//         fullName,
//         email,
//         phone,
//         location,
//         totalExperience: totalExperience ? Number(totalExperience) : null,
//         skills,
//         currentCompany,
//         currentSalary: currentSalary ? Number(currentSalary) : null,
//         expectedSalary: expectedSalary ? Number(expectedSalary) : null,
//         noticePeriod,
//         linkedinUrl,
//         githubUrl,
//         portfolioUrl,
//         status: status || "APPLIED",
//         createdBy: createdById,
//       },
//     });

//     // If resume is provided, upload to R2 and update record
//     if (resume?.base64 && resume?.fileName) {
//       try {
//         const resumeUrl = await uploadCandidateDocumentToR2(
//           resume.base64,
//           resume.fileName,
//           tenantId,
//           candidate.id,
//           "resume"
//         );

//         await prisma.generalCandidates.update({
//           where: { id: candidate.id },
//           data: { resumeUrl },
//         });
        
//         candidate.resumeUrl = resumeUrl;
//       } catch (uploadError: any) {
//         console.error("Resume upload failed:", uploadError);
//         // We still keep the candidate record but record the upload failure if needed
//       }
//     }

//     res.status(201).json({ success: true, data: candidate } as ApiResponse);
//   } catch (error: any) {
//     console.error("Create candidate error:", error);
//     res.status(500).json({ success: false, error: error.message } as ApiResponse);
//   }
// };

// /**
//  * Get all candidates for the tenant
//  */
// export const getCandidates = async (req: AuthRequest, res: Response): Promise<void> => {
//   try {
//     const tenantId = req.tenantId || req.user?.tenantId;

//     if (!tenantId) {
//       res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
//       return;
//     }

//     const candidates = await prisma.generalCandidates.findMany({
//       where: { tenantId },
//       orderBy: { createdAt: "desc" },
//     });

//     res.status(200).json({ success: true, data: candidates } as ApiResponse);
//   } catch (error: any) {
//     res.status(500).json({ success: false, error: error.message } as ApiResponse);
//   }
// };

// /**
//  * Get a candidate by ID
//  */
// export const getCandidateById = async (req: AuthRequest, res: Response): Promise<void> => {
//   try {
//     const tenantId = req.tenantId || req.user?.tenantId;
//     const { id } = req.params;

//     if (!tenantId) {
//       res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
//       return;
//     }

//     const candidate = await prisma.generalCandidates.findFirst({
//       where: { id, tenantId },
//     });

//     if (!candidate) {
//       res.status(404).json({ success: false, error: "Candidate not found" } as ApiResponse);
//       return;
//     }

//     res.status(200).json({ success: true, data: candidate } as ApiResponse);
//   } catch (error: any) {
//     res.status(500).json({ success: false, error: error.message } as ApiResponse);
//   }
// };

// /**
//  * Update a candidate
//  */
// export const updateCandidate = async (req: AuthRequest, res: Response): Promise<void> => {
//   try {
//     const tenantId = req.tenantId || req.user?.tenantId;
//     const updatedById = req.user?.id;
//     const { id } = req.params;

//     if (!tenantId || !updatedById) {
//       res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
//       return;
//     }

//     const {
//       fullName,
//       email,
//       phone,
//       location,
//       totalExperience,
//       skills,
//       currentCompany,
//       currentSalary,
//       expectedSalary,
//       noticePeriod,
//       resume, // { base64, fileName }
//       linkedinUrl,
//       githubUrl,
//       portfolioUrl,
//       status,
//     } = req.body;

//     // Verify ownership
//     const existing = await prisma.generalCandidates.findFirst({ where: { id, tenantId } });
//     if (!existing) {
//       res.status(404).json({ success: false, error: "Candidate not found" } as ApiResponse);
//       return;
//     }

//     const updateData: any = {
//       fullName,
//       email,
//       phone,
//       location,
//       totalExperience: totalExperience !== undefined ? Number(totalExperience) : undefined,
//       skills,
//       currentCompany,
//       currentSalary: currentSalary !== undefined ? Number(currentSalary) : undefined,
//       expectedSalary: expectedSalary !== undefined ? Number(expectedSalary) : undefined,
//       noticePeriod,
//       linkedinUrl,
//       githubUrl,
//       portfolioUrl,
//       status,
//       updatedBy: updatedById,
//     };

//     // If new resume is provided, upload to R2
//     if (resume?.base64 && resume?.fileName) {
//       try {
//         const resumeUrl = await uploadCandidateDocumentToR2(
//           resume.base64,
//           resume.fileName,
//           tenantId,
//           id,
//           "resume"
//         );
//         updateData.resumeUrl = resumeUrl;
//       } catch (uploadError: any) {
//         console.error("Resume upload failed during update:", uploadError);
//       }
//     }

//     const updatedCandidate = await prisma.generalCandidates.update({
//       where: { id },
//       data: updateData,
//     });

//     res.status(200).json({ success: true, data: updatedCandidate } as ApiResponse);
//   } catch (error: any) {
//     console.error("Update candidate error:", error);
//     res.status(500).json({ success: false, error: error.message } as ApiResponse);
//   }
// };

// /**
//  * Delete a candidate
//  */
// export const deleteCandidate = async (req: AuthRequest, res: Response): Promise<void> => {
//   try {
//     const tenantId = req.tenantId || req.user?.tenantId;
//     const { id } = req.params;

//     if (!tenantId) {
//       res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
//       return;
//     }

//     const deleted = await prisma.generalCandidates.deleteMany({
//       where: { id, tenantId },
//     });

//     if (deleted.count === 0) {
//       res.status(404).json({ success: false, error: "Candidate not found" } as ApiResponse);
//       return;
//     }

//     res.status(200).json({ success: true, message: "Candidate deleted successfully" } as ApiResponse);
//   } catch (error: any) {
//     res.status(500).json({ success: false, error: error.message } as ApiResponse);
//   }
// };
