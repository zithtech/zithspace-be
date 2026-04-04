import fs from "fs";
import path from "path";
import { randomUUID as uuid } from "crypto";
import { prisma } from "@/config/database";
import { Response } from "express";
import {
  AuthRequest,
  ValidationError,
  NotFoundError,
  ApiResponse,
} from "@/types";
import { uploadEmployeeDocumentToR2 } from "@/utils/r2Client";

export class ReimbursementController {
  /* =====================================================
     CREATE - Store files separately (NO ZIP)
  ===================================================== */

  static async create(req: AuthRequest, res: Response): Promise<void> {
    console.log("🔥 Controller hit");
    try {
      // 1. Validate tenant and user context
      if (!req.user || !req.tenantId) {
        throw new ValidationError("Tenant context required");
      }

      // 2. Get data from request
      const { status } = req.body;
      const files = req.files as Express.Multer.File[];

      // 3. Parse items
      if (!req.body.items) {
        console.error("❌ No items field in body:", req.body);
        throw new ValidationError("Items required");
      }

      let itemsArray: any[];
      try {
        itemsArray = typeof req.body.items === "string"
          ? JSON.parse(req.body.items)
          : req.body.items;

        console.log("✅ Parsed items:", itemsArray);
      } catch (err) {
        console.error("❌ Parse error:", err);
        throw new ValidationError("Items must be a valid JSON array");
      }

      if (!itemsArray || !Array.isArray(itemsArray) || itemsArray.length === 0) {
        throw new ValidationError("Items array cannot be empty");
      }

      // 4. Upload files to R2
      const uploadedFiles: {
        originalName: string;
        fileName: string;
        fileUrl: string;
        fileSize: number;
        fileType: string;
        path: string;
        index: number; // ⭐ Add index to track original file position
      }[] = [];

      if (!fs.existsSync("uploads")) {
        fs.mkdirSync("uploads", { recursive: true });
      }

      // Upload each file and keep track of its index
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const fileBuffer = fs.readFileSync(file.path);
          const base64File = `data:${file.mimetype};base64,${fileBuffer.toString("base64")}`;

          const fileId = uuid();
          const fileName = `${fileId}_${file.originalname}`;

          const fileUrl = await uploadEmployeeDocumentToR2(
            base64File,
            fileName,
            req.tenantId!,
            req.user!.id,
            `reimbursement_${fileId}`,
          );

          uploadedFiles.push({
            originalName: file.originalname,
            fileName: fileName,
            fileUrl: fileUrl,
            fileSize: file.size,
            fileType: file.mimetype,
            path: file.path,
            index: i // ⭐ Store the original index
          });

          console.log(`✅ Uploaded: ${file.originalname} -> ${fileUrl}`);
        } catch (uploadError) {
          console.error(`❌ Failed to upload file ${file.originalname}:`, uploadError);
          throw new Error(`Failed to upload file: ${file.originalname}`);
        }
      }

      // Calculate total amount
      const totalAmount = itemsArray.reduce(
        (sum: number, item: any) => sum + Number(item.amount || 0),
        0,
      );

      /* ---------- DATABASE TRANSACTION ---------- */
      const result = await prisma.$transaction(async (tx) => {
        // Create reimbursement
        const reimbursement = await tx.reimbursement.create({
          data: {
            tenantId: req.tenantId!,
            createdById: req.user!.id,
            status: status || "DRAFT",
            totalAmount,
          },
        });

        // Create items and their specific attachments
        for (let itemIndex = 0; itemIndex < itemsArray.length; itemIndex++) {
          const item = itemsArray[itemIndex];

          // Create reimbursement item
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

          // 🔴 FIX: Only attach files that belong to this item
          const itemAttachmentIndexes = item.attachments || []; // This comes from frontend

          console.log(`Item ${itemIndex} attachments indexes:`, itemAttachmentIndexes);

          for (const fileIndex of itemAttachmentIndexes) {
            const file = uploadedFiles[fileIndex];
            if (file) {
              await tx.attachment.create({
                data: {
                  reimbursementItemId: reimbursementItem.id,
                  fileName: file.originalName,
                  fileUrl: file.fileUrl,
                  fileSize: file.fileSize,
                  fileType: file.fileType,
                  uploadedBy: req.user!.id,
                },
              });
              console.log(`📎 Attached ${file.originalName} to item ${itemIndex}`);
            }
          }

          // 🔴 Rest of your approver logic remains the same
          console.log("========== 🔍 APPROVER DEBUG START ==========");
          console.log("1️⃣ Looking for rule with:", {
            categoryId: item.category,
            tenantId: req.tenantId,
          });

          const rule = await tx.reimbursementPolicyRule.findFirst({
            where: {
              categoryId: item.category,
              tenantId: req.tenantId!,
            },
          });

          console.log("2️⃣ Rule found:", rule ? {
            id: rule.id,
            categoryId: rule.categoryId,
            maxAmount: rule.maxAmount,
            policyId: rule.policyId
          } : "❌ NO RULE FOUND");

          if (!rule) {
            throw new Error(`No policy rule found for category: ${item.category}`);
          }

          // Get approvers for this specific rule
          const policyApprovers = await tx.reimbursementPolicyApprover.findMany({
            where: {
              policyRuleId: rule.id,
            },
            orderBy: { level: "asc" },
          });

          console.log("Policy approvers found:", policyApprovers.length);

          // Create item approvers
          if (policyApprovers.length > 0) {
            for (const a of policyApprovers) {
              try {
                const r = await tx.reimbursementItemApprover.create({
                  data: {
                    tenantId: req.tenantId!,
                    reimbursementItemId: reimbursementItem.id,
                    level: a.level,
                    approverId: a.approverId,
                    approverType: a.approverType,
                    status: "PENDING",
                  },
                });
                console.log("Inserted approver:", r);
              } catch (err) {
                console.error("Failed to insert approver:", err);
              }
            }

            // Verify they were created
            const created = await tx.reimbursementItemApprover.findMany({
              where: {
                reimbursementItemId: reimbursementItem.id
              }
            });
            console.log(`Verification - Found ${created.length} approvers for item`);
          } else {
            console.log("⚠️ No policy approvers found - NOT creating any item approvers");
          }

          console.log("========== 🔍 APPROVER DEBUG END ==========");
        }

        // Return created reimbursement with items and attachments
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
      }, {
        timeout: 30000
      });

      // Clean up temp files
      try {
        for (const file of files) {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log(`🧹 Cleaned up temp file: ${file.path}`);
          }
        }
      } catch (cleanupError) {
        console.warn("⚠️ Cleanup warning:", cleanupError);
      }

      res.status(201).json({
        success: true,
        data: result,
        message: "Reimbursement created successfully with separate files"
      } as ApiResponse);

    } catch (error: any) {
      console.error("❌ Create reimbursement error:", error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: error.message || "Failed to create reimbursement"
        });
      }
    }
  }
  /* =====================================================
     UPDATE - Store files separately (NO ZIP)
  ===================================================== */





  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status, items } = req.body;

      console.log("📦 req.body:", req.body);
      console.log("📦 req.files:", req.files);

      // Handle files from req.files.files (multer fields format)
      let uploadedFiles: Express.Multer.File[] = [];

      if (req.files && typeof req.files === 'object') {
        const filesObj = req.files as { [fieldname: string]: Express.Multer.File[] };

        if (filesObj.files && Array.isArray(filesObj.files)) {
          uploadedFiles = filesObj.files;
          console.log(`📎 Files found in req.files.files: ${uploadedFiles.length}`);
        }
      }

      console.log(`📎 Total files to process: ${uploadedFiles.length}`);

      // 1. Check if reimbursement exists
      const existing = await prisma.reimbursement.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              attachments: true,
            },
          },
        },
      });

      if (!existing) throw new NotFoundError("Reimbursement not found");

      // 2. Parse items if provided
      let itemsArray: any[] = [];
      if (items) {
        try {
          itemsArray = typeof items === "string" ? JSON.parse(items) : items;
          console.log("✅ Parsed items for update:", JSON.stringify(itemsArray, null, 2));
        } catch (err) {
          console.error("❌ Parse error:", err);
          throw new ValidationError("Items must be a valid JSON array");
        }
      }

      // 3. Handle file uploads if new files are provided
      const uploadedFileData: {
        originalName: string;
        fileName: string;
        fileUrl: string;
        fileSize: number;
        fileType: string;
        index: number; // ⭐ Add index to track original position
      }[] = [];

      if (uploadedFiles.length > 0) {
        console.log("📎 Processing new file uploads...");

        // Ensure uploads directory exists
        if (!fs.existsSync("uploads")) {
          fs.mkdirSync("uploads", { recursive: true });
        }

        // Upload each file individually and store with index
        for (let i = 0; i < uploadedFiles.length; i++) {
          const file = uploadedFiles[i];
          if (fs.existsSync(file.path)) {
            // Read file
            const fileBuffer = fs.readFileSync(file.path);
            const base64File = `data:${file.mimetype};base64,${fileBuffer.toString("base64")}`;

            // Generate unique filename
            const fileId = uuid();
            const fileName = `${fileId}_${file.originalname}`;

            // Upload to R2
            const fileUrl = await uploadEmployeeDocumentToR2(
              base64File,
              fileName,
              req.tenantId!,
              req.user!.id,
              `reimbursement_${fileId}`
            );

            uploadedFileData.push({
              originalName: file.originalname,
              fileName: fileName,
              fileUrl: fileUrl,
              fileSize: file.size,
              fileType: file.mimetype,
              index: i // ⭐ Store the original index
            });

            console.log(`✅ Uploaded file ${i}: ${file.originalname} -> ${fileUrl}`);
          } else {
            console.warn(`⚠️ File not found: ${file.path}`);
          }
        }
      }

      // 4. Calculate new total amount
      let totalAmount = existing.totalAmount;
      if (itemsArray.length > 0) {
        totalAmount = itemsArray.reduce(
          (sum: number, item: any) => sum + Number(item.amount || 0),
          0
        );
      }

      // 5. Perform update in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Update reimbursement header
        const updated = await tx.reimbursement.update({
          where: { id },
          data: {
            status: status || existing.status,
            totalAmount,
            submittedAt:
              status === "SUBMITTED" && !existing.submittedAt
                ? new Date()
                : existing.submittedAt,
            submittedBy:
              status === "SUBMITTED" && !existing.submittedBy
                ? req.user?.id
                : existing.submittedBy,
          },
        });

        // CASE 1: New items are provided (complete replacement)
        if (itemsArray.length > 0) {
          console.log("🔄 Replacing all items with new ones");

          // Delete all existing items and their attachments
          await tx.reimbursementItem.deleteMany({
            where: { reimbursementId: id },
          });

          // Create new items with their specific attachments
          for (let itemIndex = 0; itemIndex < itemsArray.length; itemIndex++) {
            const item = itemsArray[itemIndex];

            console.log(`Creating item ${itemIndex}:`, item);

            const reimbursementItem = await tx.reimbursementItem.create({
              data: {
                reimbursementId: id,
                category: item.category,
                date: new Date(item.date),
                billNo: item.billNo,
                amount: Number(item.amount),
                description: item.description,
              },
            });

            // 🔴 FIX: Only attach files that belong to this specific item
            const itemAttachmentIndexes = item.attachments || [];
            console.log(`Item ${itemIndex} attachment indexes:`, itemAttachmentIndexes);

            // If there are new uploaded files for this item
            if (uploadedFileData.length > 0 && itemAttachmentIndexes.length > 0) {
              for (const fileIndex of itemAttachmentIndexes) {
                const file = uploadedFileData[fileIndex];
                if (file) {
                  await tx.attachment.create({
                    data: {
                      reimbursementItemId: reimbursementItem.id,
                      fileName: file.originalName,
                      fileUrl: file.fileUrl,
                      fileSize: file.fileSize,
                      fileType: file.fileType,
                      uploadedBy: req.user!.id,
                    },
                  });
                  console.log(`📎 Attached new file ${file.originalName} to item ${itemIndex}`);
                }
              }
            }
            // If there are existing files referenced (from previous attachments)
            else if (item.existingAttachments && item.existingAttachments.length > 0) {
              // Handle existing attachments that were kept
              for (const existingAtt of item.existingAttachments) {
                await tx.attachment.create({
                  data: {
                    reimbursementItemId: reimbursementItem.id,
                    fileName: existingAtt.fileName,
                    fileUrl: existingAtt.fileUrl,
                    fileSize: existingAtt.fileSize,
                    fileType: existingAtt.fileType,
                    uploadedBy: existingAtt.uploadedBy || req.user!.id,
                  },
                });
                console.log(`📎 Kept existing attachment ${existingAtt.fileName} for item ${itemIndex}`);
              }
            }
          }
        }
        // CASE 2: Only new files uploaded, items unchanged
        else if (uploadedFileData.length > 0) {
          console.log("🔄 Only updating attachments for existing items");

          // For each existing item, check if it has new attachments
          // This assumes the frontend sends which files go to which item
          // You might need to modify this based on your frontend logic

          // Example: If itemsArray is empty but you have uploadedFileData,
          // you need to know which item gets which file.
          // This depends on your frontend implementation.

          // One approach: The frontend could send updated items with 
          // attachment indexes even if other fields are unchanged

          console.warn("⚠️ No items array provided with file uploads - cannot determine which items get which files");

          // Alternative: If you want to replace all attachments for all items with new files
          // (Use this only if that's your intended behavior)
          /*
          for (const item of existing.items) {
            // Delete old attachments
            await tx.attachment.deleteMany({
              where: { reimbursementItemId: item.id },
            });

            // Add all new files to this item
            for (const file of uploadedFileData) {
              await tx.attachment.create({
                data: {
                  reimbursementItemId: item.id,
                  fileName: file.originalName,
                  fileUrl: file.fileUrl,
                  fileSize: file.fileSize,
                  fileType: file.fileType,
                  uploadedBy: req.user!.id,
                },
              });
            }
          }
          */
        }

        // Return updated reimbursement with all relations
        return await tx.reimbursement.findUnique({
          where: { id },
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
      if (uploadedFiles.length > 0) {
        try {
          for (const file of uploadedFiles) {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
              console.log(`🧹 Cleaned up temp file: ${file.path}`);
            }
          }
        } catch (cleanupError) {
          console.warn("⚠️ Cleanup warning:", cleanupError);
        }
      }

      console.log("✅ Update successful, returning full data with attachments");

      res.status(200).json({
        success: true,
        data: result,
        message: "Updated successfully",
      });

    } catch (error: any) {
      console.error("❌ Update reimbursement error:", error);
      res.status(error instanceof NotFoundError ? 404 : 500).json({
        success: false,
        error: error.message,
      });
    }
  }
  /* =====================================================
     GET ALL - Include attachments
  ===================================================== */
  static async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context required");

      const data = await prisma.reimbursement.findMany({
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
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /* =====================================================
     GET BY ID - Include attachments
  ===================================================== */
  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const reimbursement = await prisma.reimbursement.findFirst({
        where: { id, tenantId: req.tenantId },
        include: {
          items: {
            include: { attachments: true },
          },
        },
      });

      if (!reimbursement) throw new NotFoundError("Reimbursement not found");

      res.status(200).json({ success: true, data: reimbursement });
    } catch (error: any) {
      res.status(error instanceof NotFoundError ? 404 : 500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /* =====================================================
     DELETE - Delete reimbursement and all related data
  ===================================================== */
  static async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const existing = await prisma.reimbursement.findUnique({
        where: { id },
      });

      if (!existing) throw new NotFoundError("Reimbursement not found");

      await prisma.reimbursement.delete({ where: { id } });

      res.status(200).json({
        success: true,
        message: "Deleted successfully",
      });
    } catch (error: any) {
      res.status(error instanceof NotFoundError ? 404 : 500).json({
        success: false,
        error: error.message,
      });
    }
  }















  static async getApprovalList(req: AuthRequest, res: Response): Promise<void> {
    try {

      if (!req.user || !req.tenantId) {
        res.status(401).json({
          success: false,
          error: "Authentication required"
        });
        return;
      }

      const userId = req.user.id;
      const tenantId = req.tenantId;
      console.log("Current Approver User ID:", userId);





      // Disable cache
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      // STEP 1️⃣ & 2️⃣ Find subordinate User IDs (Those reporting to current user)
      const subordinates = await prisma.user.findMany({
        where: {
          employee: {
            projectMappings: {
              some: { reportingManager: userId }
            }
          }
        },
        select: { id: true }
      });

      const subordinateUserIds = subordinates.map(u => u.id);

      // STEP 3️⃣ Fetch reimbursements with item-level filtering
      const reimbursements = await prisma.reimbursement.findMany({
        where: {
          tenantId,
          OR: [
            // Case A: I am a Reporting Manager for the creator
            { createdById: { in: subordinateUserIds } },
            // Case B: I am an explicit Approver for at least one item
            {
              items: {
                some: {
                  approvers: { some: { approverId: userId } }
                }
              }
            }
          ]
        },
        include: {
          createdBy: {
            include: {
              employee: {
                select: {
                  employee_code: true,
                  first_name: true,
                  last_name: true
                }
              }
            }
          },
          items: {
            where: {
              OR: [
                // Filter 1: I am the Manager (can see all items for this creator)
                { reimbursement: { createdById: { in: subordinateUserIds } } },
                // Filter 2: I am an explicitly assigned Approver for this individual row/item
                { approvers: { some: { approverId: userId } } }
              ]
            },
            include: {
              attachments: true,
              approvers: {
                where: {
                  OR: [
                    { approverId: userId },
                    { level: 1 } 
                  ]
                },
                select: {
                  status: true,
                  remarks: true,
                  actedAt: true
                }
              }
            }
          }
        },
        orderBy: { submittedAt: "desc" }
      });

      // STEP 4️⃣ Format response
      const formattedData = reimbursements.map(reb => ({

        id: reb.id,

        employeeName:
          reb.createdBy?.name ||
          `${reb.createdBy?.employee?.first_name || ""} ${reb.createdBy?.employee?.last_name || ""
            }`.trim(),

        employeeCode:
          reb.createdBy?.employee?.employee_code || "N/A",

        employeeEmail:
          reb.createdBy?.workEmail || "",

        totalAmount: reb.totalAmount,

        status: reb.status,

        submittedAt: reb.submittedAt,
        createdAt: reb.createdAt,

        items: reb.items.map(item => ({

          id: item.id,

          category: item.category,

          date: item.date,

          billNo: item.billNo,

          amount: item.amount,

          description: item.description,

          // reimbursement item status
          reimbursementItemStatus: item.status,

          attachments: item.attachments.map(att => ({
            id: att.id,
            fileName: att.fileName,
            fileUrl: att.fileUrl,
            fileSize: att.fileSize,
            fileType: att.fileType
          })),

          // approver status
          approverStatus:
            item.approvers?.[0]?.status || "PENDING",

          approverDetails:
            item.approvers?.[0] || null

        }))

      }));


      // Debug log
      console.log(
        `📤 [${new Date().toISOString()}] Sending approval data`,
        formattedData.flatMap(d =>
          d.items.map(i => ({
            itemId: i.id,
            reimbursementItemStatus: i.reimbursementItemStatus,
            approverStatus: i.approverStatus
          }))
        )
      );

      res.status(200).json({
        success: true,
        data: formattedData
      });

    } catch (error: any) {

      console.error("❌ Error in getApprovalList:", error);

      res.status(500).json({
        success: false,
        error: error.message,
        data: []
      });

    }
  }
























































  /* =====================================================
     GET USER REIMBURSEMENT LIMITS
  ===================================================== */
  static async getUserReimbursementLimits(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId) {
        res.status(401).json({
          success: false,
          error: "Authentication required"
        });
        return;
      }

      const userId = req.user.id;
      const tenantId = req.tenantId;

      // Get user details (including positionId and employeeId)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          positionId: true,
          employeeId: true,
        }
      });

      if (!user) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }

      let positionId = user.positionId;

      // Fallback: If no positionId on User, try to get it from linked Employee users
      if (!positionId && user.employeeId) {
        const employee = await prisma.employee.findUnique({
          where: { id: user.employeeId },
          select: {
            users: {
              where: { positionId: { not: null } },
              select: { positionId: true },
              take: 1
            }
          }
        });
        positionId = employee?.users[0]?.positionId || null;
      }

      let position: any = null;
      if (positionId) {
        position = await prisma.position.findUnique({
          where: { id: positionId },
          select: {
            id: true,
            gradeId: true,
            departmentId: true,
            subDepartmentId: true,
          }
        });
      }

      // Collect all origin IDs
      // Priority 1: User ID (allows user-specific policies)
      // Priority 2: Position-related IDs
      const originIds = [
        user.id,
        position?.id,
        position?.gradeId,
        position?.departmentId,
        position?.subDepartmentId
      ].filter((id): id is string => id !== null && id !== undefined);

      if (originIds.length === 0) {
        res.status(200).json({ success: true, data: [] });
        return;
      }

      // Find policies
      const policies = await prisma.reimbursementPolicy.findMany({
        where: {
          originId: { in: originIds },
          isActive: true,
          tenantId: tenantId
        },
        select: { id: true }
      });

      const policyIds = policies.map(p => p.id);

      if (policyIds.length === 0) {
        res.status(200).json({ success: true, data: [] });
        return;
      }

      // Get policy rules
      const policyRules = await prisma.reimbursementPolicyRule.findMany({
        where: {
          policyId: { in: policyIds },
          isActive: true
        },
        select: {
          categoryId: true,
          maxAmount: true,
          periodType: true
        }
      });

      // Format response
      const result = policyRules.map(rule => ({
        categoryId: rule.categoryId,
        maxAmount: rule.maxAmount,
        periodType: rule.periodType
      }));

      // Remove duplicates
      const uniqueResults = Array.from(
        result.reduce((map, item) => {
          const existing = map.get(item.categoryId);
          if (!existing || Number(item.maxAmount) < Number(existing.maxAmount)) {
            map.set(item.categoryId, item);
          }
          return map;
        }, new Map()).values()
      );

      res.status(200).json({
        success: true,
        data: uniqueResults
      });

    } catch (error: any) {
      console.error("❌ Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch reimbursement limits",
        data: []
      });
    }
  }




  private static async updateReimbursementStatus(
    reimbursementId: string,
    userId: string
  ) {

    const items = await prisma.reimbursementItem.findMany({
      where: { reimbursementId },
      select: { status: true }
    });
    console.log("ITEM STATUSES:", items);

    const total = items.length;

    const approved = items.filter(i => i.status === "APPROVED").length;
    const paid = items.filter(i => i.status === "PAID").length;
    const rejected = items.filter(i => i.status === "REJECTED").length;

    let newStatus: any = null;

    if (paid === total) {
      newStatus = "PAID";
    }
    else if (paid > 0) {
      newStatus = "PARTIALLY_PAID";
    }
    else if (approved === total) {
      newStatus = "APPROVED";
    }
    else if (approved > 0) {
      newStatus = "PARTIALLY_APPROVED";
    }
    else if (rejected === total) {
      newStatus = "REJECTED";
    }

    if (newStatus) {
      await prisma.reimbursement.update({
        where: { id: reimbursementId },
        data: {
          status: newStatus,
          updatedById: userId
        }
      });
    }
  }




  static async approve(req: AuthRequest, res: Response) {
    try {
      const { reimbursementItemId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      console.log("🔍 APPROVE DEBUG START");
      console.log("User ID trying to approve:", userId);
      console.log("Item ID:", reimbursementItemId);

      // 1️⃣ Get reimbursement item
      const item = await prisma.reimbursementItem.findUnique({
        where: { id: reimbursementItemId },
        include: {
          reimbursement: {
            include: {
              createdBy: {
                include: {
                  employee: true
                }
              }
            }
          }
        }
      });

      if (!item) {
        throw new Error("Reimbursement item not found");
      }

      console.log("Item found:", {
        itemId: item.id,
        status: item.status,
        employeeId: item.reimbursement.createdBy.employee?.id
      });

      // 2️⃣ Check if user is reporting manager
      let isManager = false;

      if (item.reimbursement.createdBy.employee) {
        const managerCheck = await prisma.employeeProjectMapping.findFirst({
          where: {
            employeeId: item.reimbursement.createdBy.employee.id,
            reportingManager: userId
          }
        });

        isManager = !!managerCheck;
      }

      console.log("Is manager:", isManager);

      // 3️⃣ Find approver record
      let approval;

      if (isManager) {
        approval = await prisma.reimbursementItemApprover.findFirst({
          where: {
            reimbursementItemId,
            status: "PENDING"
          }
        });

        console.log("Manager approval record:", approval);

      } else {

        approval = await prisma.reimbursementItemApprover.findFirst({
          where: {
            reimbursementItemId,
            approverId: userId,
            status: "PENDING"
          }
        });

        console.log("Assigned approver record:", approval);
      }

      if (!approval) {
        throw new Error("No pending approval found for this user");
      }

      // 4️⃣ Level order check (existing logic kept)
      if (!isManager) {
        const previousPending = await prisma.reimbursementItemApprover.findFirst({
          where: {
            reimbursementItemId,
            level: { lt: approval.level },
            status: { not: "APPROVED" }
          }
        });

        if (previousPending) {
          throw new Error("Previous level not approved yet");
        }
      }

      // 5️⃣ Mark approver as approved
      const updatedApprover = await prisma.reimbursementItemApprover.update({
        where: { id: approval.id },
        data: {
          status: "APPROVED",
          actedAt: new Date()
        }
      });

      console.log("✅ Approver updated:", updatedApprover);

      // 6️⃣ Count total approvers for this item
      const totalApprovers = await prisma.reimbursementItemApprover.count({
        where: { reimbursementItemId }
      });

      // 7️⃣ Count remaining pending
      const remaining = await prisma.reimbursementItemApprover.count({
        where: {
          reimbursementItemId,
          status: "PENDING"
        }
      });

      console.log("Total approvers:", totalApprovers);
      console.log("Remaining approvers:", remaining);

      let itemStatus = item.status;

      // 8️⃣ IMPORTANT FIX
      if (totalApprovers > 1) {
        // Item has multiple approvers → ANY approval approves item
        const updatedItem = await prisma.reimbursementItem.update({
          where: { id: reimbursementItemId },
          data: { status: "APPROVED" }
        });

        itemStatus = updatedItem.status;

        console.log("✅ Item approved because it has multiple approvers");

      } else if (remaining === 0) {

        // Old logic for single approver item
        const updatedItem = await prisma.reimbursementItem.update({
          where: { id: reimbursementItemId },
          data: { status: "APPROVED" }
        });

        itemStatus = updatedItem.status;

        console.log("✅ Item approved (single approver)");
      }

      // 9️⃣ Update reimbursement status
      await ReimbursementController.updateReimbursementStatus(
        item.reimbursementId,
        userId
      );

      // 🔟 Verification
      const verifyApprover = await prisma.reimbursementItemApprover.findUnique({
        where: { id: approval.id }
      });

      console.log("🔍 Verification:", verifyApprover);

      return res.json({
        success: true,
        message: "Approved successfully",
        data: {
          approverStatus: updatedApprover.status,
          remainingApprovers: remaining,
          itemStatus
        }
      });

    } catch (error: any) {

      console.error("❌ Approve error:", error);

      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }












  static async reject(req: AuthRequest, res: Response) {
    try {

      const { reimbursementItemId, remarks } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      console.log("🔍 REJECT DEBUG START");
      console.log("User ID trying to reject:", userId);
      console.log("Item ID:", reimbursementItemId);

      // 1️⃣ Get item details
      const item = await prisma.reimbursementItem.findUnique({
        where: { id: reimbursementItemId },
        include: {
          reimbursement: {
            include: {
              createdBy: {
                include: {
                  employee: true
                }
              }
            }
          }
        }
      });

      if (!item) {
        throw new Error("Reimbursement item not found");
      }

      // 2️⃣ Check reporting manager
      let isManager = false;

      if (item.reimbursement.createdBy.employee) {
        const managerCheck = await prisma.employeeProjectMapping.findFirst({
          where: {
            employeeId: item.reimbursement.createdBy.employee.id,
            reportingManager: userId
          }
        });

        isManager = !!managerCheck;
      }

      console.log("Is manager:", isManager);

      // 3️⃣ Find approver record
      let approval;

      if (isManager) {

        approval = await prisma.reimbursementItemApprover.findFirst({
          where: {
            reimbursementItemId,
            status: "PENDING"
          }
        });

        console.log("Manager reject record:", approval);

      } else {

        approval = await prisma.reimbursementItemApprover.findFirst({
          where: {
            reimbursementItemId,
            approverId: userId,
            status: "PENDING"
          }
        });

        console.log("Assigned approver reject record:", approval);
      }

      if (!approval) {
        throw new Error("No pending approval found for this user");
      }

      // 4️⃣ Check previous level approvals (keep same logic as approve)
      if (!isManager) {

        const previousPending = await prisma.reimbursementItemApprover.findFirst({
          where: {
            reimbursementItemId,
            level: { lt: approval.level },
            status: { not: "APPROVED" }
          }
        });

        if (previousPending) {
          throw new Error("Previous level not approved yet");
        }

      }

      // 5️⃣ Mark this approver as REJECTED
      const updatedApprover = await prisma.reimbursementItemApprover.update({
        where: { id: approval.id },
        data: {
          status: "REJECTED",
          actedAt: new Date(),
          remarks: remarks || "Rejected"
        }
      });

      console.log("✅ Approver marked REJECTED:", updatedApprover);

      // 6️⃣ Immediately mark item as REJECTED
      const updatedItem = await prisma.reimbursementItem.update({
        where: { id: reimbursementItemId },
        data: { status: "REJECTED" }
      });

      console.log("✅ Item marked REJECTED:", updatedItem);

      // 7️⃣ Update reimbursement status
      await ReimbursementController.updateReimbursementStatus(
        item.reimbursementId,
        userId
      );

      // 8️⃣ Verify
      const verify = await prisma.reimbursementItemApprover.findUnique({
        where: { id: approval.id }
      });

      console.log("🔍 Verification:", verify);

      return res.json({
        success: true,
        message: "Rejected successfully",
        data: {
          approverStatus: updatedApprover.status,
          itemStatus: updatedItem.status
        }
      });

    } catch (error: any) {

      console.error("❌ Reject error:", error);

      return res.status(400).json({
        success: false,
        message: error.message
      });

    }
  }

















  static async markAsPaid(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params; // reimbursementItem ID

      if (!id) throw new Error("Reimbursement item ID is required");
      if (!req.user) throw new Error("User not authenticated");

      // 1️⃣ Find the reimbursement item
      const item = await prisma.reimbursementItem.findUnique({
        where: { id },
        select: { id: true, status: true, reimbursementId: true },
      });

      if (!item) throw new Error("Reimbursement item not found");

      // 2️⃣ Only APPROVED items can be marked PAID
      if (item.status !== "APPROVED") {
        throw new Error("Only approved items can be marked as PAID");
      }

      // 3️⃣ Update approvers: APPROVED → PAID
      await prisma.reimbursementItemApprover.updateMany({
        where: {
          reimbursementItemId: id,
          status: "APPROVED",
        },
        data: { status: "PAID", actedAt: new Date() },
      });

      // 4️⃣ Update the reimbursement item itself
      await prisma.reimbursementItem.update({
        where: { id },
        data: { status: "PAID" },
      });

      // 5️⃣ Update parent reimbursement if all items are PAID
      const remaining = await prisma.reimbursementItem.count({
        where: {
          reimbursementId: item.reimbursementId,
          status: { not: "PAID" },
        },
      });

      // if (remaining === 0) {
      //   await prisma.reimbursement.update({
      //     where: { id: item.reimbursementId },
      //     data: { status: "PAID", updatedById: req.user.id },
      //   });
      // }
      await ReimbursementController.updateReimbursementStatus(
        item.reimbursementId,
        req.user.id
      );

      return res.json({
        success: true,
        message: "Reimbursement item and approvers marked as PAID successfully",
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }




  static async getFinanceItems(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        throw new Error("User not authenticated");
      }

      const items = await prisma.reimbursementItem.findMany({
        where: {
          reimbursement: {
            tenantId: req.user.tenantId
          },
          status: {
            in: ["APPROVED", "PAID"] // Show both APPROVED and PAID
          }
        },
        include: {
          reimbursement: {
            include: {
              createdBy: {
                include: {
                  employee: {
                    select: {
                      employee_code: true,
                      first_name: true,
                      last_name: true
                    }
                  }
                }
              }
            }
          },
          attachments: true
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      return res.json({
        success: true,
        data: items
      });

    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }


}

export default ReimbursementController;




