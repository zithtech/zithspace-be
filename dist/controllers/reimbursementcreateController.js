"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReimbursementController = void 0;
const archiver_1 = __importDefault(require("archiver"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const database_1 = require("@/config/database");
const types_1 = require("@/types");
const r2Client_1 = require("@/utils/r2Client"); // Using existing function
class ReimbursementController {
    /* =====================================================
       CREATE - ONLY R2 UPLOAD PATTERN CHANGED
    ===================================================== */
    // static async create(req: AuthRequest, res: Response): Promise<void> {
    //   try {
    //     // 1. Validate tenant and user context
    //     if (!req.user || !req.tenantId) {
    //       throw new ValidationError("Tenant context required");
    //     }
    //     // 2. Get data from request
    //     const { status } = req.body;  // ❌ Don't destructure items here
    //     const files = req.files as Express.Multer.File[];
    //     // 3. Check if items exists in req.body
    //     if (!req.body.items) {
    //       console.error("❌ No items field in body:", req.body);
    //       throw new ValidationError("Items required");
    //     }
    //     // 4. Parse items FIRST (before any array checks)
    //     let itemsArray: any[];
    //     try {
    //       itemsArray = typeof req.body.items === "string" 
    //         ? JSON.parse(req.body.items) 
    //         : req.body.items;
    //       console.log("✅ Parsed items:", itemsArray);
    //     } catch (err) {
    //       console.error("❌ Parse error:", err);
    //       throw new ValidationError("Items must be a valid JSON array");
    //     }
    //     // 5. NOW check if itemsArray is valid array
    //     if (!itemsArray || !Array.isArray(itemsArray) || itemsArray.length === 0) {
    //       throw new ValidationError("Items array cannot be empty");
    //     }
    //     // 6. Check files
    //     if (!files || files.length === 0) {
    //       throw new ValidationError("At least one file is required");
    //     }
    //     /* ---------- ZIP CREATION ---------- */
    //     const zipId = uuid();
    //     const zipName = `${zipId}.zip`;
    //     const zipPath = path.join("uploads", zipName);
    //     // Ensure uploads directory exists
    //     if (!fs.existsSync("uploads")) {
    //       fs.mkdirSync("uploads", { recursive: true });
    //     }
    //     const output = fs.createWriteStream(zipPath);
    //     const archive = archiver("zip", { zlib: { level: 9 } });
    //     // Handle archive errors
    //     archive.on("error", (err) => {
    //       throw new Error(`Archive creation failed: ${err.message}`);
    //     });
    //     archive.pipe(output);
    //     // Add all files to zip
    //     for (const file of files) {
    //       if (fs.existsSync(file.path)) {
    //         archive.file(file.path, { name: file.originalname });
    //       } else {
    //         console.warn(`⚠️ File not found: ${file.path}`);
    //       }
    //     }
    //     await archive.finalize();
    //     // Wait for zip to complete
    //   await new Promise<void>((resolve, reject) => {
    //   output.on("close", () => resolve());  // ✅ No arguments
    //   output.on("error", (err) => reject(err));
    // });
    //     /* ---------- UPLOAD TO R2 ---------- */
    //     const fileBuffer = fs.readFileSync(zipPath);
    //     const base64File = `data:application/zip;base64,${fileBuffer.toString("base64")}`;
    //     const r2Url = await uploadEmployeeDocumentToR2(
    //       base64File,
    //       zipName,
    //       req.tenantId!,
    //       req.user!.employeeId,
    //       `reimbursement_${zipId}`,
    //     );
    //     // Calculate total amount from parsed itemsArray
    //     const totalAmount = itemsArray.reduce(
    //       (sum: number, item: any) => sum + Number(item.amount || 0),
    //       0,
    //     );
    //     /* ---------- DATABASE TRANSACTION ---------- */
    //     const result = await prisma.$transaction(async (tx) => {
    //       // Create reimbursement
    //       const reimbursement = await tx.reimbursement.create({
    //         data: {
    //           tenantId: req.tenantId!,
    //           employeeId: req.user!.employeeId,
    //           status: status || "DRAFT",
    //           totalAmount,
    //         },
    //       });
    //       // Create items and attachments
    //       for (const item of itemsArray) {  // ✅ Use itemsArray here
    //         const reimbursementItem = await tx.reimbursementItem.create({
    //           data: {
    //             reimbursementId: reimbursement.id,
    //             category: item.category,
    //             date: new Date(item.date),
    //             billNo: item.billNo,
    //             amount: Number(item.amount),
    //             description: item.description,
    //           },
    //         });
    //         await tx.attachment.create({
    //           data: {
    //             reimbursementItemId: reimbursementItem.id,
    //             fileName: zipName,
    //             fileUrl: r2Url,
    //             fileSize: fs.statSync(zipPath).size,
    //             fileType: "application/zip",
    //             uploadedBy: req.user!.id,
    //           },
    //         });
    //       }
    //       // Return created reimbursement with items
    //       return await tx.reimbursement.findUnique({
    //         where: { id: reimbursement.id },
    //         include: {
    //           items: {
    //             include: {
    //               attachments: true,
    //             },
    //           },
    //         },
    //       });
    //     });
    //     // Clean up temp files
    //     try {
    //       fs.unlinkSync(zipPath);
    //       // Also clean up original uploaded files
    //       for (const file of files) {
    //         if (fs.existsSync(file.path)) {
    //           fs.unlinkSync(file.path);
    //         }
    //       }
    //     } catch (cleanupError) {
    //       console.warn("⚠️ Cleanup warning:", cleanupError);
    //     }
    //     res.status(201).json({ 
    //       success: true, 
    //       data: result,
    //       message: "Reimbursement created successfully" 
    //     } as ApiResponse);
    //   } catch (error: any) {
    //     console.error("❌ Create reimbursement error:", error);
    //     // Send appropriate error response
    //     if (error instanceof ValidationError) {
    //       res.status(400).json({ 
    //         success: false, 
    //         error: error.message 
    //       });
    //     } else {
    //       res.status(500).json({ 
    //         success: false, 
    //         error: error.message || "Failed to create reimbursement" 
    //       });
    //     }
    //   }
    // }
    static async create(req, res) {
        try {
            // 1. Validate tenant and user context
            if (!req.user || !req.tenantId) {
                throw new types_1.ValidationError("Tenant context required");
            }
            // 2. Get data from request
            const { status } = req.body;
            const files = req.files;
            // 3. Check if items exists in req.body
            if (!req.body.items) {
                console.error("❌ No items field in body:", req.body);
                throw new types_1.ValidationError("Items required");
            }
            // 4. Parse items FIRST (before any array checks)
            let itemsArray;
            try {
                itemsArray = typeof req.body.items === "string"
                    ? JSON.parse(req.body.items)
                    : req.body.items;
                console.log("✅ Parsed items:", itemsArray);
            }
            catch (err) {
                console.error("❌ Parse error:", err);
                throw new types_1.ValidationError("Items must be a valid JSON array");
            }
            // 5. NOW check if itemsArray is valid array
            if (!itemsArray || !Array.isArray(itemsArray) || itemsArray.length === 0) {
                throw new types_1.ValidationError("Items array cannot be empty");
            }
            // 6. Check files
            if (!files || files.length === 0) {
                throw new types_1.ValidationError("At least one file is required");
            }
            /* ---------- ZIP CREATION ---------- */
            const zipId = (0, uuid_1.v4)();
            const zipName = `${zipId}.zip`;
            const zipPath = path_1.default.join("uploads", zipName);
            // Ensure uploads directory exists
            if (!fs_1.default.existsSync("uploads")) {
                fs_1.default.mkdirSync("uploads", { recursive: true });
            }
            const output = fs_1.default.createWriteStream(zipPath);
            const archive = (0, archiver_1.default)("zip", { zlib: { level: 9 } });
            // Handle archive errors
            archive.on("error", (err) => {
                throw new Error(`Archive creation failed: ${err.message}`);
            });
            archive.pipe(output);
            // Add all files to zip
            for (const file of files) {
                if (fs_1.default.existsSync(file.path)) {
                    archive.file(file.path, { name: file.originalname });
                }
                else {
                    console.warn(`⚠️ File not found: ${file.path}`);
                }
            }
            await archive.finalize();
            // Wait for zip to complete
            await new Promise((resolve, reject) => {
                output.on("close", () => resolve());
                output.on("error", (err) => reject(err));
            });
            /* ---------- UPLOAD TO R2 ---------- */
            const fileBuffer = fs_1.default.readFileSync(zipPath);
            const base64File = `data:application/zip;base64,${fileBuffer.toString("base64")}`;
            const r2Url = await (0, r2Client_1.uploadEmployeeDocumentToR2)(base64File, zipName, req.tenantId, req.user.employeeId, `reimbursement_${zipId}`);
            // Calculate total amount from parsed itemsArray
            const totalAmount = itemsArray.reduce((sum, item) => sum + Number(item.amount || 0), 0);
            /* ---------- DATABASE TRANSACTION ---------- */
            const result = await database_1.prisma.$transaction(async (tx) => {
                // Create reimbursement - USING createdById INSTEAD OF employeeId
                const reimbursement = await tx.reimbursement.create({
                    data: {
                        tenantId: req.tenantId,
                        createdById: req.user.id, // ✅ Using createdById (not employeeId)
                        status: status || "DRAFT",
                        totalAmount,
                    },
                });
                // Create items and attachments
                for (const item of itemsArray) {
                    const reimbursementItem = await tx.reimbursementItem.create({
                        data: {
                            reimbursementId: reimbursement.id,
                            category: item.category,
                            date: new Date(item.date),
                            billNo: item.billNo,
                            amount: Number(item.amount),
                            description: item.description,
                        },
                    });
                    await tx.attachment.create({
                        data: {
                            reimbursementItemId: reimbursementItem.id,
                            fileName: zipName,
                            fileUrl: r2Url,
                            fileSize: fs_1.default.statSync(zipPath).size,
                            fileType: "application/zip",
                            uploadedBy: req.user.id,
                        },
                    });
                }
                // Return created reimbursement with items
                return await tx.reimbursement.findUnique({
                    where: { id: reimbursement.id },
                    include: {
                        items: {
                            include: {
                                attachments: true,
                            },
                        },
                    },
                });
            });
            // Clean up temp files
            try {
                fs_1.default.unlinkSync(zipPath);
                // Also clean up original uploaded files
                for (const file of files) {
                    if (fs_1.default.existsSync(file.path)) {
                        fs_1.default.unlinkSync(file.path);
                    }
                }
            }
            catch (cleanupError) {
                console.warn("⚠️ Cleanup warning:", cleanupError);
            }
            res.status(201).json({
                success: true,
                data: result,
                message: "Reimbursement created successfully"
            });
        }
        catch (error) {
            console.error("❌ Create reimbursement error:", error);
            // Send appropriate error response
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
            else {
                res.status(500).json({
                    success: false,
                    error: error.message || "Failed to create reimbursement"
                });
            }
        }
    }
    /* =====================================================
       GET ALL - UNCHANGED
    ===================================================== */
    static async getAll(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context required");
            const data = await database_1.prisma.reimbursement.findMany({
                where: { tenantId: req.tenantId },
                include: {
                    items: {
                        include: {
                            attachments: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
            });
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    /* =====================================================
       GET BY ID - UNCHANGED
    ===================================================== */
    static async getById(req, res) {
        try {
            const { id } = req.params;
            const reimbursement = await database_1.prisma.reimbursement.findFirst({
                where: { id, tenantId: req.tenantId },
                include: {
                    items: {
                        include: { attachments: true },
                    },
                },
            });
            if (!reimbursement)
                throw new types_1.NotFoundError("Reimbursement not found");
            res.status(200).json({ success: true, data: reimbursement });
        }
        catch (error) {
            res.status(error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }
    /* =====================================================
       UPDATE - UNCHANGED
    ===================================================== */
    static async update(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const existing = await database_1.prisma.reimbursement.findUnique({
                where: { id },
            });
            if (!existing)
                throw new types_1.NotFoundError("Reimbursement not found");
            const updated = await database_1.prisma.reimbursement.update({
                where: { id },
                data: {
                    status,
                    submittedAt: status === "SUBMITTED" ? new Date() : existing.submittedAt,
                    submittedBy: status === "SUBMITTED" ? req.user?.id : existing.submittedBy,
                },
            });
            res.status(200).json({
                success: true,
                data: updated,
                message: "Updated successfully",
            });
        }
        catch (error) {
            res.status(error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }
    /* =====================================================
       DELETE - UNCHANGED
    ===================================================== */
    static async delete(req, res) {
        try {
            const { id } = req.params;
            const existing = await database_1.prisma.reimbursement.findUnique({
                where: { id },
            });
            if (!existing)
                throw new types_1.NotFoundError("Reimbursement not found");
            await database_1.prisma.reimbursement.delete({ where: { id } });
            res.status(200).json({
                success: true,
                message: "Deleted successfully",
            });
        }
        catch (error) {
            res.status(error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }
}
exports.ReimbursementController = ReimbursementController;
// import archiver from "archiver";
// import fs from "fs";
// import path from "path";
// import { v4 as uuid } from "uuid";
// import { prisma } from "@/config/database";
// import { Response } from "express";
// import {
//   AuthRequest,
//   ValidationError,
//   NotFoundError,
//   ApiResponse,
// } from "@/types";
// import { uploadEmployeeDocumentToR2 } from "@/utils/r2Client";
// export class ReimbursementController {
//   /* =====================================================
//      CREATE - WITH JSON PARSING FIX
//   ===================================================== */
// // static async create(req: AuthRequest, res: Response): Promise<void> {
// //   try {
// //     if (!req.user || !req.tenantId)
// //       throw new ValidationError("Tenant context required");
// //     console.log("🔍 REQUEST BODY:", req.body);
// //     const files = req.files as Express.Multer.File[];
// //     // ✅ FIX: req.body itself is the array of items
// //     const itemsArray = req.body;
// //     if (!itemsArray || !Array.isArray(itemsArray) || itemsArray.length === 0) {
// //       throw new ValidationError("Items required");
// //     }
// //     if (!files || files.length === 0)
// //       throw new ValidationError("Files required");
// //     /* ---------- ZIP CREATION ---------- */
// //     const zipId = uuid();
// //     const zipName = `${zipId}.zip`;
// //     const zipPath = path.join("uploads", zipName);
// //     const output = fs.createWriteStream(zipPath);
// //     const archive = archiver("zip", { zlib: { level: 9 } });
// //     archive.pipe(output);
// //     for (const file of files) {
// //       archive.file(file.path, { name: file.originalname });
// //     }
// //     await archive.finalize();
// //     // Upload to R2
// //     const fileBuffer = fs.readFileSync(zipPath);
// //     const fileExt = path.extname(zipName).toLowerCase();
// //     const mimeType = fileExt === '.pdf' ? 'application/pdf' :
// //                     fileExt === '.zip' ? 'application/zip' :
// //                     'application/octet-stream';
// //     const base64File = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
// //     const r2Url = await uploadEmployeeDocumentToR2(
// //       base64File,
// //       zipName,
// //       req.tenantId!,
// //       req.user!.id,
// //       `reimbursement_${zipId}`
// //     );
// //     const totalAmount = itemsArray.reduce(
// //       (sum: number, item: any) => sum + Number(item.amount),
// //       0
// //     );
// //     const result = await prisma.$transaction(async (tx) => {
// //       const reimbursement = await tx.reimbursement.create({
// //         data: {
// //           tenantId: req.tenantId!,
// //           employeeId: req.user!.id,
// //           status: "DRAFT", // Default status
// //           totalAmount,
// //         },
// //       });
// //       for (const item of itemsArray) {
// //         const reimbursementItem = await tx.reimbursementItem.create({
// //           data: {
// //             reimbursementId: reimbursement.id,
// //             category: item.category,
// //             date: new Date(item.date),
// //             billNo: item.billNo,
// //             amount: item.amount,
// //             description: item.description,
// //           },
// //         });
// //         await tx.attachment.create({
// //           data: {
// //             reimbursementItemId: reimbursementItem.id,
// //             fileName: zipName,
// //             fileUrl: r2Url,
// //             fileSize: fs.statSync(zipPath).size,
// //             fileType: "application/zip",
// //             uploadedBy: req.user!.id,
// //           },
// //         });
// //       }
// //       return reimbursement;
// //     });
// //     // Clean up temp file
// //     fs.unlinkSync(zipPath);
// //     res.status(201).json({ success: true, data: result });
// //   } catch (error: any) {
// //     console.error("Reimbursement creation error:", error);
// //     res.status(500).json({ success: false, error: error.message });
// //   }
// // }
// // controllers/reimbursementcreateController.ts - COMPLETE SOLUTION
// static async create(req: AuthRequest, res: Response): Promise<void> {
//   try {
//     if (!req.user || !req.tenantId)
//       throw new ValidationError("Tenant context required");
//     console.log("🔍 REQUEST BODY:", req.body);
//     // ✅ Frontend sends: { items: [...], files: [{ name, type, content: base64 }] }
//     const { items, files } = req.body;
//     // if (!items || !Array.isArray(items) || items.length === 0) {
//     //   throw new ValidationError("Items required");
//     // }
//     // if (!files || files.length === 0)
//     //   throw new ValidationError("Files required");
//     /* ---------- PROCESS EACH FILE & UPLOAD TO R2 ---------- */
//     const attachmentUrls = [];
//     for (const file of files) {
//       // 1. Base64 file received from frontend
//       const { name: fileName, type: fileType, content: base64Content } = file;
//       console.log(`📎 Processing file: ${fileName}`);
//       // 2. Upload directly to R2 (no zip needed since backend changed)
//       const r2Url = await uploadEmployeeDocumentToR2(
//         base64Content,  // Direct base64 from frontend
//         fileName,
//         req.tenantId!,
//         req.user!.id,
//         `reimbursement_${uuid()}`
//       );
//       attachmentUrls.push({
//         fileName,
//         fileUrl: r2Url,
//         fileType
//       });
//     }
//     /* ---------- CALCULATE TOTAL AMOUNT ---------- */
//     const totalAmount = items.reduce(
//       (sum: number, item: any) => sum + Number(item.amount),
//       0
//     );
//     /* ---------- SAVE TO DATABASE ---------- */
//     const result = await prisma.$transaction(async (tx) => {
//       // Create main reimbursement
//       const reimbursement = await tx.reimbursement.create({
//         data: {
//           tenantId: req.tenantId!,
//           employeeId: req.user!.id,
//           status: "DRAFT",
//           totalAmount,
//         },
//       });
//       // Create items and attachments
//       for (let i = 0; i < items.length; i++) {
//         const item = items[i];
//         const reimbursementItem = await tx.reimbursementItem.create({
//           data: {
//             reimbursementId: reimbursement.id,
//             category: item.category,
//             date: new Date(item.date),
//             billNo: item.billNo,
//             amount: item.amount,
//             description: item.description,
//           },
//         });
//         // For each item, create attachment record with R2 URL
//         // Note: If you want to link specific files to specific items,
//         // you need to send that mapping from frontend
//         // For now, linking all files to first item or all items?
//         // Let's link all files to each item (if same files for all)
//         for (const url of attachmentUrls) {
//           await tx.attachment.create({
//             data: {
//               reimbursementItemId: reimbursementItem.id,
//               fileName: url.fileName,
//               fileUrl: url.fileUrl,
//               fileSize: 0, // You can get size from base64 if needed
//               fileType: url.fileType,
//               uploadedBy: req.user!.id,
//             },
//           });
//         }
//       }
//       return reimbursement;
//     });
//     res.status(201).json({
//       success: true,
//       data: result,
//       message: "Reimbursement created with R2 files"
//     });
//   } catch (error: any) {
//     console.error("Reimbursement creation error:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// }
//   /* =====================================================
//      GET ALL - UNCHANGED
//   ===================================================== */
//   static async getAll(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.user || !req.tenantId)
//         throw new ValidationError("Tenant context required");
//       const data = await prisma.reimbursement.findMany({
//         where: { tenantId: req.tenantId },
//         include: {
//           items: {
//             include: {
//               attachments: true,
//             },
//           },
//         },
//         orderBy: { createdAt: "desc" },
//       });
//       res.status(200).json({ success: true, data });
//     } catch (error: any) {
//       res.status(500).json({ success: false, error: error.message });
//     }
//   }
//   /* =====================================================
//      GET BY ID - UNCHANGED
//   ===================================================== */
//   static async getById(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       const { id } = req.params;
//       const reimbursement = await prisma.reimbursement.findFirst({
//         where: { id, tenantId: req.tenantId },
//         include: {
//           items: {
//             include: { attachments: true },
//           },
//         },
//       });
//       if (!reimbursement)
//         throw new NotFoundError("Reimbursement not found");
//       res.status(200).json({ success: true, data: reimbursement });
//     } catch (error: any) {
//       res.status(error instanceof NotFoundError ? 404 : 500).json({
//         success: false,
//         error: error.message,
//       });
//     }
//   }
//   /* =====================================================
//      UPDATE - UNCHANGED
//   ===================================================== */
// //   static async update(req: AuthRequest, res: Response): Promise<void> {
// //     try {
// //       const { id } = req.params;
// //       const { status } = req.body;
// //       const existing = await prisma.reimbursement.findUnique({
// //         where: { id },
// //       });
// //       if (!existing)
// //         throw new NotFoundError("Reimbursement not found");
// //       const updated = await prisma.reimbursement.update({
// //         where: { id },
// //         data: {
// //           status,
// //           submittedAt:
// //             status === "SUBMITTED" ? new Date() : existing.submittedAt,
// //           submittedBy:
// //             status === "SUBMITTED" ? req.user?.id : existing.submittedBy,
// //         },
// //       });
// //       res.status(200).json({
// //         success: true,
// //         data: updated,
// //         message: "Updated successfully",
// //       });
// //     } catch (error: any) {
// //       res.status(error instanceof NotFoundError ? 404 : 500).json({
// //         success: false,
// //         error: error.message,
// //       });
// //     }
// //   }
// static async update(req: AuthRequest, res: Response): Promise<void> {
//   try {
//     const { id } = req.params;
//     const { status, items } = req.body; // Receive items array too
//     const files = req.files as Express.Multer.File[]; // Receive new files if any
//     const existing = await prisma.reimbursement.findUnique({
//       where: { id },
//       include: { items: { include: { attachments: true } } },
//     });
//     if (!existing) throw new NotFoundError("Reimbursement not found");
//     // Start a transaction
//     const updatedReimbursement = await prisma.$transaction(async (tx) => {
//       // Update main reimbursement (status, etc.)
//       const updated = await tx.reimbursement.update({
//         where: { id },
//         data: {
//           status,
//           totalAmount: items
//             ? items.reduce((sum: number, item: any) => sum + Number(item.amount), 0)
//             : existing.totalAmount,
//           submittedAt: status === "SUBMITTED" ? new Date() : existing.submittedAt,
//           submittedBy: status === "SUBMITTED" ? req.user?.id : existing.submittedBy,
//         },
//       });
//       if (items && Array.isArray(items)) {
//         // Delete old items and attachments (optional)
//         for (const oldItem of existing.items) {
//           await tx.attachment.deleteMany({
//             where: { reimbursementItemId: oldItem.id },
//           });
//         }
//         await tx.reimbursementItem.deleteMany({
//           where: { reimbursementId: id },
//         });
//         // Re-create items with attachments
//         for (const item of items) {
//           const reimbursementItem = await tx.reimbursementItem.create({
//             data: {
//               reimbursementId: id,
//               category: item.category,
//               date: new Date(item.date),
//               billNo: item.billNo,
//               amount: item.amount,
//               description: item.description,
//             },
//           });
//           if (files && files.length > 0) {
//             // If files uploaded, zip & upload like in create
//             const zipId = uuid();
//             const zipName = `${zipId}.zip`;
//             const zipPath = path.join("uploads", zipName);
//             const output = fs.createWriteStream(zipPath);
//             const archive = archiver("zip", { zlib: { level: 9 } });
//             archive.pipe(output);
//             for (const file of files) {
//               archive.file(file.path, { name: file.originalname });
//             }
//             await archive.finalize();
//             const fileBuffer = fs.readFileSync(zipPath);
//             const base64File = `data:application/zip;base64,${fileBuffer.toString(
//               "base64"
//             )}`;
//             const r2Url = await uploadEmployeeDocumentToR2(
//               base64File,
//               zipName,
//               req.tenantId!,
//               req.user!.id,
//               `reimbursement_${zipId}`
//             );
//             await tx.attachment.create({
//               data: {
//                 reimbursementItemId: reimbursementItem.id,
//                 fileName: zipName,
//                 fileUrl: r2Url,
//                 fileSize: fs.statSync(zipPath).size,
//                 fileType: "application/zip",
//                 uploadedBy: req.user!.id,
//               },
//             });
//             // Remove temp zip
//             fs.unlinkSync(zipPath);
//           }
//         }
//       }
//       return updated;
//     });
//     res.status(200).json({
//       success: true,
//       data: updatedReimbursement,
//       message: "Reimbursement updated successfully",
//     });
//   } catch (error: any) {
//     res
//       .status(error instanceof NotFoundError ? 404 : 500)
//       .json({ success: false, error: error.message });
//   }
// }
//   /* =====================================================
//      DELETE - UNCHANGED
//   ===================================================== */
//   static async delete(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       const { id } = req.params;
//       const existing = await prisma.reimbursement.findUnique({
//         where: { id },
//       });
//       if (!existing)
//         throw new NotFoundError("Reimbursement not found");
//       await prisma.reimbursement.delete({ where: { id } });
//       res.status(200).json({
//         success: true,
//         message: "Deleted successfully",
//       });
//     } catch (error: any) {
//       res.status(error instanceof NotFoundError ? 404 : 500).json({
//         success: false,
//         error: error.message,
//       });
//     }
//   }
// }
// import archiver from "archiver";
// import fs from "fs";
// import path from "path";
// import { v4 as uuid } from "uuid";
// import { prisma } from "@/config/database";
// import { Response } from "express";
// import {
//   AuthRequest,
//   ValidationError,
//   NotFoundError,
//   ApiResponse,
// } from "@/types";
// import { uploadEmployeeDocumentToR2 } from "@/utils/r2Client";
// export class ReimbursementController {
//   /* =====================================================
//      CREATE - MATCHING EMPLOYEE HISTORY PATTERN
//   ===================================================== */
//   static async create(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.user || !req.tenantId)
//         throw new ValidationError("Tenant context required");
//       console.log("🔍 REQUEST BODY:", JSON.stringify(req.body, null, 2));
//       // ✅ Employee History pattern - req.body contains { items, files, status }
//       const { items, files, status } = req.body;
//       if (!items || !Array.isArray(items) || items.length === 0) {
//         throw new ValidationError("Items required");
//       }
//       // Files are optional - but if present, process them
//       const totalAmount = items.reduce(
//         (sum: number, item: any) => sum + Number(item.amount),
//         0
//       );
//       /* ---------- PROCESS FILES & SAVE TO DATABASE ---------- */
//       const result = await prisma.$transaction(async (tx) => {
//         // 1. Create main reimbursement
//         const reimbursement = await tx.reimbursement.create({
//           data: {
//             tenantId: req.tenantId!,
//             employeeId: req.user!.id,
//             status: status || "DRAFT",
//             totalAmount,
//           },
//         });
//         // 2. Process each item with its attachments
//         for (const item of items) {
//           // Create reimbursement item
//           const reimbursementItem = await tx.reimbursementItem.create({
//             data: {
//               reimbursementId: reimbursement.id,
//               category: item.category,
//               date: new Date(item.date),
//               billNo: item.billNo,
//               amount: item.amount,
//               description: item.description,
//             },
//           });
//           // 3. Process attachments for this item (if any)
//           if (item.attachments && Array.isArray(item.attachments)) {
//             for (const file of item.attachments) {
//               if (file.base64) {
//                 console.log(`📎 Uploading file: ${file.fileName}`);
//                 // Upload to R2 - exactly like Employee History
//                 const url = await uploadEmployeeDocumentToR2(
//                   file.base64,
//                   file.fileName,
//                   req.tenantId!,
//                   req.user!.id,
//                   `reimbursement_${reimbursement.id}`
//                 );
//                 // Store in database
//                 await tx.attachment.create({
//                   data: {
//                     reimbursementItemId: reimbursementItem.id,
//                     fileName: file.fileName,
//                     fileUrl: url,
//                     fileSize: file.fileSize || 0,
//                     fileType: file.fileType || "unknown",
//                     uploadedBy: req.user!.id,
//                   },
//                 });
//               }
//             }
//           }
//         }
//         // Return reimbursement with all relations
//         return await tx.reimbursement.findUnique({
//           where: { id: reimbursement.id },
//           include: {
//             items: {
//               include: {
//                 attachments: true,
//               },
//             },
//           },
//         });
//       });
//       res.status(201).json({
//         success: true,
//         data: result,
//         message: "Reimbursement created successfully"
//       });
//     } catch (error: any) {
//       console.error("❌ Reimbursement creation error:", error);
//       res.status(500).json({ success: false, error: error.message });
//     }
//   }
//   /* =====================================================
//      GET ALL
//   ===================================================== */
//   static async getAll(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.user || !req.tenantId)
//         throw new ValidationError("Tenant context required");
//       const data = await prisma.reimbursement.findMany({
//         where: { tenantId: req.tenantId },
//         include: {
//           items: {
//             include: {
//               attachments: true,
//             },
//           },
//         },
//         orderBy: { createdAt: "desc" },
//       });
//       res.status(200).json({ success: true, data });
//     } catch (error: any) {
//       console.error("❌ Get all error:", error);
//       res.status(500).json({ success: false, error: error.message });
//     }
//   }
//   /* =====================================================
//      GET BY ID
//   ===================================================== */
//   static async getById(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       const { id } = req.params;
//       const reimbursement = await prisma.reimbursement.findFirst({
//         where: { id, tenantId: req.tenantId },
//         include: {
//           items: {
//             include: { attachments: true },
//           },
//         },
//       });
//       if (!reimbursement)
//         throw new NotFoundError("Reimbursement not found");
//       res.status(200).json({ success: true, data: reimbursement });
//     } catch (error: any) {
//       console.error("❌ Get by ID error:", error);
//       res.status(error instanceof NotFoundError ? 404 : 500).json({
//         success: false,
//         error: error.message,
//       });
//     }
//   }
//   /* =====================================================
//      UPDATE - MATCHING EMPLOYEE HISTORY PATTERN
//   ===================================================== */
//   static async update(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       const { id } = req.params;
//       const { status, items } = req.body;
//       const existing = await prisma.reimbursement.findUnique({
//         where: { id },
//         include: {
//           items: {
//             include: { attachments: true }
//           }
//         },
//       });
//       if (!existing) throw new NotFoundError("Reimbursement not found");
//       // Start a transaction
//       const updatedReimbursement = await prisma.$transaction(async (tx) => {
//         // Update main reimbursement
//         const updated = await tx.reimbursement.update({
//           where: { id },
//           data: {
//             status: status || existing.status,
//             totalAmount: items
//               ? items.reduce((sum: number, item: any) => sum + Number(item.amount), 0)
//               : existing.totalAmount,
//             submittedAt: status === "SUBMITTED" ? new Date() : existing.submittedAt,
//             submittedBy: status === "SUBMITTED" ? req.user?.id : existing.submittedBy,
//           },
//         });
//         // If items are provided, update them
//         if (items && Array.isArray(items)) {
//           // Delete old items and attachments
//           for (const oldItem of existing.items) {
//             await tx.attachment.deleteMany({
//               where: { reimbursementItemId: oldItem.id },
//             });
//           }
//           await tx.reimbursementItem.deleteMany({
//             where: { reimbursementId: id },
//           });
//           // Create new items with attachments
//           for (const item of items) {
//             const reimbursementItem = await tx.reimbursementItem.create({
//               data: {
//                 reimbursementId: id,
//                 category: item.category,
//                 date: new Date(item.date),
//                 billNo: item.billNo,
//                 amount: item.amount,
//                 description: item.description,
//               },
//             });
//             // Process attachments for this item
//             if (item.attachments && Array.isArray(item.attachments)) {
//               for (const file of item.attachments) {
//                 if (file.base64) {
//                   // Upload new file to R2
//                   const url = await uploadEmployeeDocumentToR2(
//                     file.base64,
//                     file.fileName,
//                     req.tenantId!,
//                     req.user!.id,
//                     `reimbursement_${id}`
//                   );
//                   await tx.attachment.create({
//                     data: {
//                       reimbursementItemId: reimbursementItem.id,
//                       fileName: file.fileName,
//                       fileUrl: url,
//                       fileSize: file.fileSize || 0,
//                       fileType: file.fileType || "unknown",
//                       uploadedBy: req.user!.id,
//                     },
//                   });
//                 } else if (file.url) {
//                   // Keep existing file (only URL provided)
//                   await tx.attachment.create({
//                     data: {
//                       reimbursementItemId: reimbursementItem.id,
//                       fileName: file.fileName,
//                       fileUrl: file.url,
//                       fileSize: file.fileSize || 0,
//                       fileType: file.fileType || "unknown",
//                       uploadedBy: req.user!.id,
//                     },
//                   });
//                 }
//               }
//             }
//           }
//         }
//         return updated;
//       });
//       res.status(200).json({
//         success: true,
//         data: updatedReimbursement,
//         message: "Reimbursement updated successfully",
//       });
//     } catch (error: any) {
//       console.error("❌ Update error:", error);
//       res
//         .status(error instanceof NotFoundError ? 404 : 500)
//         .json({ success: false, error: error.message });
//     }
//   }
//   /* =====================================================
//      DELETE
//   ===================================================== */
//   static async delete(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       const { id } = req.params;
//       const existing = await prisma.reimbursement.findUnique({
//         where: { id },
//       });
//       if (!existing)
//         throw new NotFoundError("Reimbursement not found");
//       // Delete in transaction to handle relations
//       await prisma.$transaction(async (tx) => {
//         // Get all items to delete their attachments
//         const items = await tx.reimbursementItem.findMany({
//           where: { reimbursementId: id },
//         });
//         // Delete attachments for each item
//         for (const item of items) {
//           await tx.attachment.deleteMany({
//             where: { reimbursementItemId: item.id },
//           });
//         }
//         // Delete items
//         await tx.reimbursementItem.deleteMany({
//           where: { reimbursementId: id },
//         });
//         // Delete reimbursement
//         await tx.reimbursement.delete({
//           where: { id },
//         });
//       });
//       res.status(200).json({
//         success: true,
//         message: "Reimbursement deleted successfully",
//       });
//     } catch (error: any) {
//       console.error("❌ Delete error:", error);
//       res.status(error instanceof NotFoundError ? 404 : 500).json({
//         success: false,
//         error: error.message,
//       });
//     }
//   }
// }
//# sourceMappingURL=reimbursementcreateController.js.map