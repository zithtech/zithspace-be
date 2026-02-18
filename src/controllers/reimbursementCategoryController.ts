// import { AuthRequest, ApiResponse, ValidationError, NotFoundError } from "@/types";
// import { Response } from "express";
// import { prisma, tenantAwarePrisma } from "@/config/database";
// import { Prisma } from "@prisma/client";
// import { uploadFileToR2, deleteFileFromR2 } from "@/utils/r2Client";

// class ReimbursementCategoryController {
//   // ==============================
//   // CREATE CATEGORY
//   // ==============================
// async createCategory(req: AuthRequest, res: Response): Promise<void> {
//   try {
//     const tenantId = req.tenantId!;
//     const userId = req.user!.id;

//     const {
//       name,
//       maxRequestsPerMonth,
//       monthlyLimit,
//       yearlyLimit,
//       eligibleRoles,
//       approvalRoles,
//       acceptRoles,
//       attachmentRequired,
//       isActive,
//     } = req.body;

//     if (!name) {
//       res.status(400).json({
//         success: false,
//         error: "Category name is required",
//       });
//       return;
//     }

//     const category = await prisma.reimbursementCategory.create({
//       data: {
//         tenantId,
//         name,
//         // ❌ No description field
//         maxRequestsPerMonth: maxRequestsPerMonth ? new Prisma.Decimal(maxRequestsPerMonth) : null,
//         monthlyLimit: monthlyLimit ? new Prisma.Decimal(monthlyLimit) : null,
//         yearlyLimit: yearlyLimit ? new Prisma.Decimal(yearlyLimit) : null,
//         eligibleRoles: eligibleRoles || [],
//         approvalRoles: approvalRoles || [],
//         acceptRoles: acceptRoles || [],
//         attachmentRequired: attachmentRequired ?? false,
//         isActive: isActive ?? true,
//         createdBy: userId,
//         updatedBy: userId,
//       },
//     });

//     res.status(201).json({
//       success: true,
//       message: "Reimbursement category created successfully",
//       data: category,
//     });
//   } catch (error: any) {
//     console.error("Create reimbursement category error:", error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// }

//   // ==============================
//   // GET ALL CATEGORIES
//   // ==============================
//   async getCategories(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       const tenantId = req.tenantId!;

//       const categories = await prisma.reimbursementCategory.findMany({
//         where: {
//           tenantId,
//           isActive: true,
//         },
//         orderBy: {
//           createdAt: "desc",
//         },
//       });

//       res.status(200).json({
//         success: true,
//         data: categories,
//       });
//     } catch (error: any) {
//       console.error("Get reimbursement categories error:", error);
//       res.status(500).json({
//         success: false,
//         error: error.message,
//       });
//     }
//   }

//   // ==============================
//   // GET CATEGORY BY ID
//   // ==============================
//   async getCategoryById(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       const tenantId = req.tenantId!;
//       const { id } = req.params;

//       const category = await prisma.reimbursementCategory.findFirst({
//         where: {
//           id,
//           tenantId,
//         },
//       });

//       if (!category) {
//         res.status(404).json({
//           success: false,
//           error: "Category not found",
//         });
//         return;
//       }
      
//       res.status(200).json({
//         success: true,
//         data: category,
//       });
//     } catch (error: any) {
//       console.error("Get category by ID error:", error);
//       res.status(500).json({
//         success: false,
//         error: error.message,
//       });
//     }
//   }

//   // ==============================
//   // UPDATE CATEGORY
//   // ==============================
//   async updateCategory(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       const tenantId = req.tenantId!;
//       const userId = req.user!.id;
//       const { id } = req.params;
//       const updates = req.body;

//       // Remove immutable fields
//       delete updates.id;
//       delete updates.tenantId;
//       delete updates.createdAt;
//       delete updates.createdBy;

//       const existing = await prisma.reimbursementCategory.findFirst({
//         where: { id, tenantId },
//       });

//       if (!existing) {
//         res.status(404).json({
//           success: false,
//           error: "Category not found",
//         });
//         return;
//       }

//       // Prepare data with proper Decimal conversion
//       const data: any = { ...updates, updatedBy: userId };
      
//       if (updates.maxRequestsPerMonth !== undefined) {
//         data.maxRequestsPerMonth = updates.maxRequestsPerMonth ? new Prisma.Decimal(updates.maxRequestsPerMonth) : null;
//       }
//       if (updates.monthlyLimit !== undefined) {
//         data.monthlyLimit = updates.monthlyLimit ? new Prisma.Decimal(updates.monthlyLimit) : null;
//       }
//       if (updates.yearlyLimit !== undefined) {
//         data.yearlyLimit = updates.yearlyLimit ? new Prisma.Decimal(updates.yearlyLimit) : null;
//       }

//       const updated = await prisma.reimbursementCategory.update({
//         where: { id },
//         data,
//       });

//       res.status(200).json({
//         success: true,
//         message: "Category updated successfully",
//         data: updated,
//       });
//     } catch (error: any) {
//       console.error("Update reimbursement category error:", error);
//       res.status(500).json({
//         success: false,
//         error: error.message,
//       });
//     }
//   }

//   // ==============================
//   // DELETE CATEGORY (SOFT DELETE)
//   // ==============================
//   async deleteCategory(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       const tenantId = req.tenantId!;
//       const userId = req.user!.id;
//       const { id } = req.params;

//       const existing = await prisma.reimbursementCategory.findFirst({
//         where: { id, tenantId },
//       });

//       if (!existing) {
//         res.status(404).json({
//           success: false,
//           error: "Category not found",
//         });
//         return;
//       }

//       await prisma.reimbursementCategory.update({
//         where: { id },
//         data: {
//           isActive: false,
//           updatedBy: userId,
//         },
//       });

//       res.status(200).json({
//         success: true,
//         message: "Category deactivated successfully",
//       });
//     } catch (error: any) {
//       console.error("Delete reimbursement category error:", error);
//       res.status(500).json({
//         success: false,
//         error: error.message,
//       });
//     }
//   }

//   // ==============================
//   // UPLOAD FILE
//   // ==============================
//   async uploadFile(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId) {
//         throw new ValidationError('Tenant context required');
//       }

//       const file = (req as any).file;
//       if (!file) {
//         throw new ValidationError('No file uploaded');
//       }

//       const fs = require('fs');
//       const filePath = file.path;

//       const fileBuffer = fs.readFileSync(filePath);
//       const base64Data = fileBuffer.toString('base64');
//       const mimeType = file.mimetype;
//       const dataUri = `data:${mimeType};base64,${base64Data}`;

//       const { fileUrl, fileSize, fileType } = await uploadFileToR2(
//         dataUri,
//         file.originalname,
//         req.tenantId
//       );

//       try {
//         fs.unlinkSync(filePath);
//       } catch (err) {
//         console.error('Error deleting temp file:', err);
//       }

//       res.status(200).json({
//         success: true,
//         filename: file.originalname,
//         url: fileUrl,
//         fileSize,
//         fileType,
//       });
//     } catch (error: any) {
//       console.error('Upload file error:', error);
//       if (error instanceof ValidationError) {
//         res.status(400).json({ success: false, error: error.message });
//         return;
//       }
//       res.status(500).json({ success: false, error: error.message || 'Failed to upload file' });
//     }
//   }
// }

// export default new ReimbursementCategoryController();

// // ==========================================
// // REIMBURSEMENT REQUEST CONTROLLER
// // ==========================================
// export class ReimbursementRequestController {
  
//   // ==============================
//   // CREATE REQUEST
//   // ==============================
//   static async createRequest(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({ success: false, error: 'Tenant context required' });
//         return;
//       }

//       const { category, amount, items, policy, status, department } = req.body;
//       const tenantId = req.tenantId;

//       if (!category || amount === undefined || !items || !Array.isArray(items)) {
//         throw new ValidationError('Category, amount, and items are required');
//       }

//       await tenantAwarePrisma.withTenant(tenantId, async (client) => {
//         const activityLog = [{
//           action: 'CREATED',
//           date: new Date().toISOString(),
//           user: req.user!.name || 'User',
//           note: 'Request created'
//         }];

//         // Process items to handle attachments
//         const processedItems = await Promise.all(items.map(async (item: any) => {
//           const attachments = item.attachments || item.files || [];
//           const processedAttachments = attachments.map((f: any) => {
//             let url = "";
//             let name = "attachment";

//             if (typeof f === 'string') {
//               url = f;
//             } else {
//               url = f.url || f.fileUrl || "";
//               name = f.name || f.fileName || "attachment";
//             }

//             return { 
//               url, 
//               name, 
//               size: f.size || f.fileSize || 0, 
//               type: f.type || f.fileType || 'unknown' 
//             };
//           });

//           const validAttachments = processedAttachments.filter((a: any) => a && a.url);

//           return {
//             ...item,
//             processedAttachments: validAttachments,
//           };
//         }));

//         // Generate Request ID
//         const lastRequest = await client.reimbursementRequest.findFirst({
//           where: { tenantId },
//           orderBy: { requestId: 'desc' },
//           select: { requestId: true }
//         });

//         let nextNum = 1;
//         if (lastRequest && lastRequest.requestId.startsWith('EXP-')) {
//           const lastNumStr = lastRequest.requestId.split('-')[1];
//           if (!isNaN(parseInt(lastNumStr))) {
//             nextNum = parseInt(lastNumStr) + 1;
//           }
//         }
//         const requestId = `EXP-${String(nextNum).padStart(5, '0')}`;

//         // Create Request and Items
//         const request = await client.reimbursementRequest.create({
//           data: {
//             tenantId,
//             requestId,
//             userId: req.user!.id,
//             category,
//             department,
//             policy,
//             amount: new Prisma.Decimal(Number(amount)),
//             status: status || 'DRAFT',
//             submittedAt: status === 'PENDING_APPROVAL' ? new Date() : null,
//             activityLog,
//             items: {
//               create: processedItems.map((item: any) => ({
//                 tenantId,
//                 title: item.title || "Expense Item",
//                 date: item.date ? new Date(item.date) : new Date(),
//                 amount: new Prisma.Decimal(Number(item.amount) || 0),
//                 billNo: item.billNo,
//                 description: item.description
//               }))
//             }
//           },
//           include: {
//             items: true
//           }
//         });

//         // Create Attachments
//         const attachmentPromises: any[] = [];

//         processedItems.forEach((processedItem, index) => {
//           const createdItem = request.items[index];
//           if (createdItem && processedItem.processedAttachments) {
//             processedItem.processedAttachments.forEach((att: any) => {
//               attachmentPromises.push(
//                 client.reimbursementAttachment.create({
//                   data: {
//                     tenantId,
//                     fileName: att.name || 'attachment',
//                     fileUrl: att.url,
//                     fileSize: att.size || 0,
//                     fileType: att.type || 'unknown',
//                     uploadedById: req.user!.id,
//                     reimbursementRequestId: request.id,
//                     reimbursementItemId: createdItem.id
//                   }
//                 })
//               );
//             });
//           }
//         });

//         if (attachmentPromises.length > 0) {
//           await Promise.all(attachmentPromises);
//         }

//         // Fetch final request
//         const finalRequest = await client.reimbursementRequest.findUnique({
//           where: { id: request.id },
//           include: {
//             items: {
//               include: { reimbursementAttachments: true }
//             }
//           }
//         });

//         res.status(201).json({
//           success: true,
//           data: finalRequest,
//           message: 'Reimbursement request created successfully'
//         });
//       });
//     } catch (error: any) {
//       console.error('Create request error:', error);
//       if (error instanceof ValidationError) {
//         res.status(400).json({ success: false, error: error.message });
//         return;
//       }
//       res.status(500).json({
//         success: false,
//         error: error.message || 'Failed to create request',
//       });
//     }
//   }

//   // ==============================
//   // GET REQUESTS
//   // ==============================
//   static async getRequests(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({ success: false, error: 'Tenant context required' });
//         return;
//       }

//       const { view, status, page = 1, limit = 20, search } = req.query;
//       const where: any = { tenantId: req.tenantId };

//       if (view === 'manager') {
//         where.status = { in: ['PENDING_APPROVAL', 'CLARIFY', 'APPROVED', 'REJECTED'] };
//       } else if (view === 'finance') {
//         if (status) {
//           where.status = status;
//         } else {
//           where.OR = [
//             { status: 'APPROVED' },
//             { financeStatus: { not: null } }
//           ];
//         }
//       } else {
//         where.userId = req.user.id;
//         if (status && status !== 'all') where.status = status;
//       }

//       if (search) {
//         where.OR = [
//           { requestId: { contains: search as string, mode: 'insensitive' } },
//           { category: { contains: search as string, mode: 'insensitive' } }
//         ];
//       }

//       const skip = (Number(page) - 1) * Number(limit);

//       const [requests, total] = await Promise.all([
//         tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
//           return await client.reimbursementRequest.findMany({
//             where,
//             include: {
//               user: { select: { id: true, name: true, workEmail: true, department: true } },
//               items: {
//                 include: {
//                   reimbursementAttachments: true
//                 }
//               }
//             },
//             orderBy: { createdAt: 'desc' },
//             skip,
//             take: Number(limit)
//           });
//         }),
//         tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
//           return await client.reimbursementRequest.count({ where });
//         })
//       ]);

//       const transformed = requests.map(r => ({
//         ...r,
//         employee: r.user,
//         expenseItems: r.items,
//         submitted: r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : null,
//         created: new Date(r.createdAt).toLocaleDateString()
//       }));

//       res.status(200).json({
//         success: true,
//         data: transformed,
//         pagination: {
//           page: Number(page),
//           limit: Number(limit),
//           total,
//           pages: Math.ceil(total / Number(limit))
//         }
//       });
//     } catch (error) {
//       console.error('Get requests error:', error);
//       res.status(500).json({ success: false, error: 'Failed to fetch requests' });
//     }
//   }

//   // ==============================
//   // GET REQUEST BY ID
//   // ==============================
//   static async getRequestById(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId) {
//         res.status(400).json({ success: false, error: 'Tenant context required' });
//         return;
//       }

//       const { id } = req.params;

//       const request = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
//         return await client.reimbursementRequest.findFirst({
//           where: { id, tenantId: req.tenantId },
//           include: {
//             user: { select: { id: true, name: true, workEmail: true, department: true } },
//             items: {
//               include: {
//                 reimbursementAttachments: true
//               }
//             },
//             approvals: {
//               include: { approver: { select: { name: true } } },
//               orderBy: { createdAt: 'desc' }
//             }
//           }
//         });
//       });

//       if (!request) {
//         res.status(404).json({
//           success: false,
//           error: "Request not found",
//         });
//         return;
//       }

//       res.status(200).json({
//         success: true,
//         data: request,
//       });
//     } catch (error: any) {
//       console.error("Get request by ID error:", error);
//       res.status(500).json({
//         success: false,
//         error: error.message,
//       });
//     }
//   }

//   // ==============================
//   // UPDATE REQUEST
//   // ==============================
//   static async updateRequest(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({ success: false, error: 'Tenant context required' });
//         return;
//       }

//       const { id } = req.params;
//       const { category, amount, items, status, department } = req.body;
//       const tenantId = req.tenantId;

//       await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
//         const existing = await client.reimbursementRequest.findFirst({
//           where: { id, tenantId: req.tenantId }
//         });

//         if (!existing) throw new NotFoundError('Request not found');
        
//         if (existing.status !== 'DRAFT' && existing.status !== 'CLARIFY' && existing.status !== 'PENDING_APPROVAL') {
//           throw new ValidationError('Cannot edit request in current status');
//         }

//         const activityLog = (existing.activityLog as any[]) || [];
//         activityLog.push({
//           action: 'UPDATED',
//           date: new Date().toISOString(),
//           user: req.user!.name,
//           note: 'Request updated'
//         });

//         // Process items
//         const processedItems = await Promise.all(items.map(async (item: any) => {
//           const attachments = item.attachments || item.files || [];
//           const processedAttachments = attachments.map((f: any) => ({
//             url: f.url || f.fileUrl || "",
//             name: f.name || f.fileName || "attachment",
//             size: f.size || f.fileSize || 0,
//             type: f.type || f.fileType || 'unknown'
//           }));

//           return {
//             ...item,
//             processedAttachments: processedAttachments.filter((a: any) => a && a.url)
//           };
//         }));

//         // Transaction to update
//         const updated = await client.$transaction(async (tx) => {
//           // Delete old items
//           await tx.reimbursementItem.deleteMany({ where: { reimbursementRequestId: id } });

//           // Update request and create new items
//           const request = await tx.reimbursementRequest.update({
//             where: { id },
//             data: {
//               category,
//               department,
//               amount: new Prisma.Decimal(Number(amount)),
//               status: status || existing.status,
//               submittedAt: status === 'PENDING_APPROVAL' ? new Date() : existing.submittedAt,
//               activityLog,
//               items: {
//                 create: processedItems.map((item: any) => ({
//                   tenantId,
//                   title: item.title,
//                   date: item.date ? new Date(item.date) : new Date(),
//                   amount: new Prisma.Decimal(Number(item.amount) || 0),
//                   billNo: item.billNo,
//                   description: item.description
//                 }))
//               }
//             },
//             include: {
//               items: true
//             }
//           });

//           // Create new attachments
//           const attachmentPromises: any[] = [];
//           processedItems.forEach((processedItem, index) => {
//             const createdItem = request.items[index];
//             if (createdItem && processedItem.processedAttachments) {
//               processedItem.processedAttachments.forEach((att: any) => {
//                 attachmentPromises.push(
//                   tx.reimbursementAttachment.create({
//                     data: {
//                       tenantId,
//                       fileName: att.name || 'attachment',
//                       fileUrl: att.url,
//                       fileSize: att.size || 0,
//                       fileType: att.type || 'unknown',
//                       uploadedById: req.user!.id,
//                       reimbursementRequestId: id,
//                       reimbursementItemId: createdItem.id
//                     }
//                   })
//                 );
//               });
//             }
//           });

//           if (attachmentPromises.length > 0) {
//             await Promise.all(attachmentPromises);
//           }

//           return await tx.reimbursementRequest.findUnique({
//             where: { id },
//             include: {
//               items: {
//                 include: { reimbursementAttachments: true }
//               }
//             }
//           });
//         });

//         res.status(200).json({
//           success: true,
//           data: updated,
//           message: 'Request updated successfully'
//         });
//       });
//     } catch (error: any) {
//       console.error('Update request error:', error);
//       if (error instanceof NotFoundError) {
//         res.status(404).json({ success: false, error: error.message });
//         return;
//       }
//       if (error instanceof ValidationError) {
//         res.status(400).json({ success: false, error: error.message });
//         return;
//       }
//       res.status(500).json({ success: false, error: 'Failed to update request' });
//     }
//   }

//   // ==============================
//   // DELETE REQUEST
//   // ==============================
//   static async deleteRequest(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({ success: false, error: 'Tenant context required' });
//         return;
//       }

//       const { id } = req.params;

//       await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
//         const existing = await client.reimbursementRequest.findFirst({
//           where: { id, tenantId: req.tenantId }
//         });

//         if (!existing) throw new NotFoundError('Request not found');
        
//         if (existing.status !== 'DRAFT' && existing.status !== 'PENDING_APPROVAL') {
//           throw new ValidationError('Only DRAFT or PENDING requests can be deleted');
//         }

//         await client.reimbursementRequest.delete({ where: { id } });
//       });

//       res.status(200).json({
//         success: true,
//         message: 'Request deleted successfully'
//       });
//     } catch (error: any) {
//       console.error('Delete request error:', error);
//       if (error instanceof NotFoundError) {
//         res.status(404).json({ success: false, error: error.message });
//         return;
//       }
//       if (error instanceof ValidationError) {
//         res.status(400).json({ success: false, error: error.message });
//         return;
//       }
//       res.status(500).json({ success: false, error: 'Failed to delete request' });
//     }
//   }

//   // ==============================
//   // MANAGER ACTION
//   // ==============================
//   static async managerAction(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({ success: false, error: 'Tenant context required' });
//         return;
//       }

//       const { id } = req.params;
//       const { action, comments } = req.body;
//       const tenantId = req.tenantId!;
//       const userId = req.user!.id;
//       const userName = req.user!.name;

//       if (!['APPROVE', 'REJECT', 'CLARIFY'].includes(action)) {
//         throw new ValidationError('Invalid action');
//       }

//       await tenantAwarePrisma.withTenant(tenantId, async (client) => {
//         const request = await client.reimbursementRequest.findFirst({
//           where: { id, tenantId },
//           include: { user: true }
//         });

//         if (!request) throw new NotFoundError('Request not found');

//         let newStatus = request.status;
//         if (action === 'APPROVE') newStatus = 'APPROVED';
//         else if (action === 'REJECT') newStatus = 'REJECTED';
//         else if (action === 'CLARIFY') newStatus = 'CLARIFY';

//         const activityLog = (request.activityLog as any[]) || [];
//         activityLog.push({
//           action: `MANAGER_${action}`,
//           date: new Date().toISOString(),
//           user: userName,
//           note: comments
//         });

//         const updated = await client.$transaction(async (tx) => {
//           await tx.reimbursementApproval.create({
//             data: {
//               tenantId,
//               reimbursementRequestId: id,
//               approverId: userId,
//               role: 'MANAGER',
//               status: action,
//               comments: comments || ''
//             }
//           });

//           return await tx.reimbursementRequest.update({
//             where: { id },
//             data: {
//               status: newStatus,
//               activityLog
//             }
//           });
//         });

//         res.status(200).json({
//           success: true,
//           data: updated,
//           message: `Request ${action.toLowerCase()}ed successfully`
//         });
//       });
//     } catch (error: any) {
//       console.error('Manager action error:', error);
//       if (error instanceof ValidationError) {
//         res.status(400).json({ success: false, error: error.message });
//         return;
//       }
//       res.status(500).json({ success: false, error: 'Failed to process manager action' });
//     }
//   }

//   // ==============================
//   // FINANCE ACTION
//   // ==============================
//   static async financeAction(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({ success: false, error: 'Tenant context required' });
//         return;
//       }

//       const { id } = req.params;
//       const { action, comments } = req.body;
//       const tenantId = req.tenantId!;
//       const userId = req.user!.id;
//       const userName = req.user!.name;

//       if (!['PAID', 'REJECT', 'ON_HOLD'].includes(action)) {
//         throw new ValidationError('Invalid action');
//       }

//       await tenantAwarePrisma.withTenant(tenantId, async (client) => {
//         const request = await client.reimbursementRequest.findFirst({
//           where: { id, tenantId }
//         });

//         if (!request) throw new NotFoundError('Request not found');

//         let newStatus = request.status;
//         let financeStatus = request.financeStatus;

//         if (action === 'PAID') {
//           newStatus = 'PAID';
//           financeStatus = 'PAID';
//         } else if (action === 'REJECT') {
//           newStatus = 'REJECTED';
//           financeStatus = 'REJECTED';
//         } else if (action === 'ON_HOLD') {
//           financeStatus = 'ON_HOLD';
//           newStatus = 'ON_HOLD';
//         }

//         const activityLog = (request.activityLog as any[]) || [];
//         activityLog.push({
//           action: `FINANCE_${action}`,
//           date: new Date().toISOString(),
//           user: userName,
//           note: comments
//         });

//         const updated = await client.$transaction(async (tx) => {
//           await tx.reimbursementApproval.create({
//             data: {
//               tenantId,
//               reimbursementRequestId: id,
//               approverId: userId,
//               role: 'FINANCE',
//               status: action,
//               comments: comments || ''
//             }
//           });

//           return await tx.reimbursementRequest.update({
//             where: { id },
//             data: {
//               status: newStatus,
//               financeStatus,
//               activityLog
//             }
//           });
//         });

//         res.status(200).json({
//           success: true,
//           data: updated,
//           message: `Request marked as ${action.toLowerCase()}`
//         });
//       });
//     } catch (error: any) {
//       console.error('Finance action error:', error);
//       res.status(500).json({ success: false, error: 'Failed to process finance action' });
//     }
//   }
// }

// // ==========================================
// // REIMBURSEMENT ITEM CONTROLLER
// // ==========================================
// export class ReimbursementItemController {
//   static async addItem(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({ success: false, error: 'Tenant context required' });
//         return;
//       }

//       const { requestId } = req.params;
//       const { title, date, amount, billNo, description } = req.body;

//       if (!title || !date || !amount) {
//         throw new ValidationError('Title, date, and amount are required');
//       }

//       await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
//         const request = await client.reimbursementRequest.findFirst({
//           where: { id: requestId, tenantId: req.tenantId }
//         });

//         if (!request) throw new NotFoundError('Request not found');
        
//         if (request.status !== 'DRAFT' && request.status !== 'CLARIFY' && request.status !== 'PENDING_APPROVAL') {
//           throw new ValidationError('Cannot add items to this request');
//         }

//         const result = await client.$transaction(async (tx) => {
//           const item = await tx.reimbursementItem.create({
//             data: {
//               tenantId: req.tenantId!,
//               reimbursementRequestId: requestId,
//               title,
//               date: new Date(date),
//               amount: new Prisma.Decimal(Number(amount)),
//               billNo,
//               description
//             }
//           });

//           const aggregations = await tx.reimbursementItem.aggregate({
//             where: { tenantId: req.tenantId, reimbursementRequestId: requestId },
//             _sum: { amount: true }
//           });

//           await tx.reimbursementRequest.update({
//             where: { id: requestId },
//             data: { amount: aggregations._sum.amount || 0 }
//           });

//           return item;
//         });

//         res.status(201).json({
//           success: true,
//           data: result,
//           message: 'Item added successfully'
//         });
//       });
//     } catch (error: any) {
//       console.error('Add item error:', error);
//       if (error instanceof ValidationError) {
//         res.status(400).json({ success: false, error: error.message });
//         return;
//       }
//       res.status(500).json({ success: false, error: 'Failed to add item' });
//     }
//   }

//   static async updateItem(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId) {
//         res.status(400).json({ success: false, error: 'Tenant context required' });
//         return;
//       }

//       const { requestId, itemId } = req.params;
//       const updates = req.body;

//       await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
//         const request = await client.reimbursementRequest.findFirst({
//           where: { id: requestId, tenantId: req.tenantId }
//         });

//         if (!request) throw new NotFoundError('Request not found');
        
//         if (request.status !== 'DRAFT' && request.status !== 'CLARIFY' && request.status !== 'PENDING_APPROVAL') {
//           throw new ValidationError('Cannot update items in this request');
//         }

//         const result = await client.$transaction(async (tx) => {
//           const item = await tx.reimbursementItem.update({
//             where: { id: itemId },
//             data: {
//               ...updates,
//               date: updates.date ? new Date(updates.date) : undefined
//             }
//           });

//           const aggregations = await tx.reimbursementItem.aggregate({
//             where: { tenantId: req.tenantId, reimbursementRequestId: requestId },
//             _sum: { amount: true }
//           });

//           await tx.reimbursementRequest.update({
//             where: { id: requestId },
//             data: { amount: aggregations._sum.amount || 0 }
//           });

//           return item;
//         });

//         res.status(200).json({
//           success: true,
//           data: result,
//           message: 'Item updated successfully'
//         });
//       });
//     } catch (error: any) {
//       console.error('Update item error:', error);
//       res.status(500).json({ success: false, error: 'Failed to update item' });
//     }
//   }

//   static async deleteItem(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId) {
//         res.status(400).json({ success: false, error: 'Tenant context required' });
//         return;
//       }

//       const { requestId, itemId } = req.params;

//       await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
//         const request = await client.reimbursementRequest.findFirst({
//           where: { id: requestId, tenantId: req.tenantId }
//         });

//         if (!request) throw new NotFoundError('Request not found');
        
//         if (request.status !== 'DRAFT' && request.status !== 'CLARIFY' && request.status !== 'PENDING_APPROVAL') {
//           throw new ValidationError('Cannot delete items from this request');
//         }

//         await client.$transaction(async (tx) => {
//           await tx.reimbursementItem.delete({
//             where: { id: itemId }
//           });

//           const aggregations = await tx.reimbursementItem.aggregate({
//             where: { tenantId: req.tenantId, reimbursementRequestId: requestId },
//             _sum: { amount: true }
//           });

//           await tx.reimbursementRequest.update({
//             where: { id: requestId },
//             data: { amount: aggregations._sum.amount || 0 }
//           });
//         });

//         res.status(200).json({
//           success: true,
//           message: 'Item deleted successfully'
//         });
//       });
//     } catch (error: any) {
//       console.error('Delete item error:', error);
//       res.status(500).json({ success: false, error: 'Failed to delete item' });
//     }
//   }
// }

// // ==========================================
// // REIMBURSEMENT APPROVAL CONTROLLER
// // ==========================================
// export class ReimbursementApprovalController {
//   static async getHistory(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId) {
//         res.status(400).json({ success: false, error: 'Tenant context required' });
//         return;
//       }
//       const { requestId } = req.params;

//       const approvals = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
//         return await client.reimbursementApproval.findMany({
//           where: { reimbursementRequestId: requestId, tenantId: req.tenantId },
//           include: {
//             approver: { select: { id: true, name: true, role: true } }
//           },
//           orderBy: { createdAt: 'desc' }
//         });
//       });

//       res.status(200).json({ success: true, data: approvals });
//     } catch (error) {
//       console.error('Get history error:', error);
//       res.status(500).json({ success: false, error: 'Failed to fetch approval history' });
//     }
//   }
// }

// // ==========================================
// // REIMBURSEMENT ATTACHMENT CONTROLLER
// // ==========================================
// export class ReimbursementAttachmentController {
//   static async addAttachment(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({ success: false, error: 'Tenant context required' });
//         return;
//       }
//       const { requestId } = req.params;
//       const { itemId, file, fileName } = req.body;

//       if (!file || !fileName) {
//         res.status(400).json({ success: false, error: 'File and fileName are required' });
//         return;
//       }

//       await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
//         const request = await client.reimbursementRequest.findFirst({
//           where: { id: requestId, tenantId: req.tenantId }
//         });

//         if (!request) throw new NotFoundError('Reimbursement request not found');

//         // Handle file upload
//         let fileToUpload = file;
//         if (file && !file.startsWith('data:')) {
//           const fs = require('fs');
//           if (fs.existsSync(file)) {
//             const fileBuffer = fs.readFileSync(file);
//             const base64Data = fileBuffer.toString('base64');
//             const mimeType = fileName.split('.').pop() || 'application/octet-stream';
//             fileToUpload = `data:${mimeType};base64,${base64Data}`;
//           }
//         }

//         const { fileUrl, fileSize, fileType } = await uploadFileToR2(
//           fileToUpload, 
//           fileName, 
//           req.tenantId!
//         );

//         const attachment = await client.reimbursementAttachment.create({
//           data: {
//             tenantId: req.tenantId!,
//             reimbursementRequestId: requestId,
//             reimbursementItemId: itemId || null,
//             fileName,
//             fileUrl,
//             fileType,
//             fileSize,
//             uploadedById: req.user!.id
//           },
//           include: {
//             uploadedBy: {
//               select: {
//                 id: true,
//                 name: true,
//                 workEmail: true,
//                 position: true
//               }
//             }
//           }
//         });

//         res.status(201).json({ success: true, data: attachment });
//       });
//     } catch (error) {
//       console.error('Add attachment error:', error);
//       if (error instanceof NotFoundError) {
//         res.status(404).json({ success: false, error: error.message });
//         return;
//       }
//       res.status(500).json({ success: false, error: 'Failed to add attachment' });
//     }
//   }

//   static async deleteAttachment(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId) {
//         res.status(400).json({ success: false, error: 'Tenant context required' });
//         return;
//       }
//       const { attachmentId } = req.params;

//       await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
//         const attachment = await client.reimbursementAttachment.findFirst({
//           where: { id: attachmentId, tenantId: req.tenantId }
//         });

//         if (!attachment) throw new NotFoundError('Attachment not found');

//         try {
//           await deleteFileFromR2(attachment.fileUrl, req.tenantId!);
//         } catch (e) {
//           console.error("Failed to delete file from R2", e);
//         }

//         await client.reimbursementAttachment.delete({ where: { id: attachmentId } });
//       });

//       res.status(200).json({ success: true, message: 'Attachment deleted' });
//     } catch (error: any) {
//       console.error('Delete attachment error:', error);
//       if (error instanceof NotFoundError) {
//         res.status(404).json({ success: false, error: error.message });
//         return;
//       }
//       res.status(500).json({ success: false, error: 'Failed to delete attachment' });
//     }
//   }

//   static async getAttachments(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId) {
//         res.status(400).json({ success: false, error: 'Tenant context required' });
//         return;
//       }
//       const { requestId } = req.params;

//       const attachments = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
//         return await client.reimbursementAttachment.findMany({
//           where: { reimbursementRequestId: requestId, tenantId: req.tenantId },
//           include: {
//             uploadedBy: {
//               select: {
//                 id: true,
//                 name: true,
//                 workEmail: true,
//                 position: true
//               }
//             }
//           },
//           orderBy: { uploadedAt: 'desc' }
//         });
//       });

//       res.status(200).json({ success: true, data: attachments });
//     } catch (error) {
//       console.error('Get attachments error:', error);
//       res.status(500).json({ success: false, error: 'Failed to fetch attachments' });
//     }
//   }
// }




import { AuthRequest, ApiResponse, ValidationError, NotFoundError } from "@/types";
import { Response } from "express";
import { prisma, tenantAwarePrisma } from "@/config/database";
import { Prisma } from "@prisma/client";
import { uploadFileToR2, deleteFileFromR2 } from "@/utils/r2Client";

// ==========================================
// REIMBURSEMENT CATEGORY CONTROLLER
// ==========================================
class ReimbursementCategoryController {
  // ==============================
  // CREATE CATEGORY
  // ==============================
  async createCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      const {
        name,
        maxRequestsPerMonth,
        monthlyLimit,
        yearlyLimit,
        eligibleRoles,
        approvalRoles,
        acceptRoles,
        attachmentRequired,
        isActive,
      } = req.body;

      if (!name) {
        res.status(400).json({
          success: false,
          error: "Category name is required",
        });
        return;
      }

      const category = await prisma.reimbursementCategory.create({
        data: {
          tenantId,
          name,
          maxRequestsPerMonth: maxRequestsPerMonth ? new Prisma.Decimal(maxRequestsPerMonth) : null,
          monthlyLimit: monthlyLimit ? new Prisma.Decimal(monthlyLimit) : null,
          yearlyLimit: yearlyLimit ? new Prisma.Decimal(yearlyLimit) : null,
          eligibleRoles: eligibleRoles || [],
          approvalRoles: approvalRoles || [],
          acceptRoles: acceptRoles || [],
          attachmentRequired: attachmentRequired ?? false,
          isActive: isActive ?? true,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      res.status(201).json({
        success: true,
        message: "Reimbursement category created successfully",
        data: category,
      });
    } catch (error: any) {
      console.error("Create reimbursement category error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // ==============================
  // GET ALL CATEGORIES
  // ==============================
  async getCategories(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;

      const categories = await prisma.reimbursementCategory.findMany({
        where: {
          tenantId,
          isActive: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.status(200).json({
        success: true,
        data: categories,
      });
    } catch (error: any) {
      console.error("Get reimbursement categories error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // ==============================
  // GET CATEGORY BY ID
  // ==============================
  async getCategoryById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const category = await prisma.reimbursementCategory.findFirst({
        where: {
          id,
          tenantId,
        },
      });

      if (!category) {
        res.status(404).json({
          success: false,
          error: "Category not found",
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        data: category,
      });
    } catch (error: any) {
      console.error("Get category by ID error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // ==============================
  // UPDATE CATEGORY
  // ==============================
  // ✅ Ensure this method exists in your file
  async updateCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const { id } = req.params;
      const updates = req.body;

      // Remove immutable fields
      delete updates.id;
      delete updates.tenantId;
      delete updates.createdAt;
      delete updates.createdBy;

      const existing = await prisma.reimbursementCategory.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Category not found",
        });
        return;
      }

      // Prepare data with proper Decimal conversion
      const data: any = { ...updates, updatedBy: userId };
      
      if (updates.maxRequestsPerMonth !== undefined) {
        data.maxRequestsPerMonth = updates.maxRequestsPerMonth ? new Prisma.Decimal(updates.maxRequestsPerMonth) : null;
      }
      if (updates.monthlyLimit !== undefined) {
        data.monthlyLimit = updates.monthlyLimit ? new Prisma.Decimal(updates.monthlyLimit) : null;
      }
      if (updates.yearlyLimit !== undefined) {
        data.yearlyLimit = updates.yearlyLimit ? new Prisma.Decimal(updates.yearlyLimit) : null;
      }

      const updated = await prisma.reimbursementCategory.update({
        where: { id },
        data,
      });

      res.status(200).json({
        success: true,
        message: "Category updated successfully",
        data: updated,
      });
    } catch (error: any) {
      console.error("Update reimbursement category error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // ==============================
  // DELETE CATEGORY (SOFT DELETE)
  // ==============================
  async deleteCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const { id } = req.params;

      const existing = await prisma.reimbursementCategory.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Category not found",
        });
        return;
      }

      await prisma.reimbursementCategory.update({
        where: { id },
        data: {
          isActive: false,
          updatedBy: userId,
        },
      });

      res.status(200).json({
        success: true,
        message: "Category deactivated successfully",
      });
    } catch (error: any) {
      console.error("Delete reimbursement category error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // ==============================
  // UPLOAD FILE
  // ==============================
  async uploadFile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const file = (req as any).file;
      if (!file) {
        throw new ValidationError('No file uploaded');
      }

      const fs = require('fs');
      const filePath = file.path;

      const fileBuffer = fs.readFileSync(filePath);
      const base64Data = fileBuffer.toString('base64');
      const mimeType = file.mimetype;
      const dataUri = `data:${mimeType};base64,${base64Data}`;

      const { fileUrl, fileSize, fileType } = await uploadFileToR2(
        dataUri,
        file.originalname,
        req.tenantId
      );

      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }

      res.status(200).json({
        success: true,
        filename: file.originalname,
        url: fileUrl,
        fileSize,
        fileType,
      });
    } catch (error: any) {
      console.error('Upload file error:', error);
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: error.message || 'Failed to upload file' });
    }
  }
}

// ==========================================
// REIMBURSEMENT REQUEST CONTROLLER
// ==========================================
class ReimbursementRequestController {
  
  // ==============================
  // CREATE REQUEST
  // ==============================
  async createRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' });
        return;
      }

      const { category, amount, items, policy, status, department } = req.body;
      const tenantId = req.tenantId;

      if (!category || amount === undefined || !items || !Array.isArray(items)) {
        throw new ValidationError('Category, amount, and items are required');
      }

      await tenantAwarePrisma.withTenant(tenantId, async (client) => {
        const activityLog = [{
          action: 'CREATED',
          date: new Date().toISOString(),
          user: req.user!.name || 'User',
          note: 'Request created'
        }];

        // Process items to handle attachments
        const processedItems = await Promise.all(items.map(async (item: any) => {
          const attachments = item.attachments || item.files || [];
          const processedAttachments = attachments.map((f: any) => {
            let url = "";
            let name = "attachment";

            if (typeof f === 'string') {
              url = f;
            } else {
              url = f.url || f.fileUrl || "";
              name = f.name || f.fileName || "attachment";
            }

            return { 
              url, 
              name, 
              size: f.size || f.fileSize || 0, 
              type: f.type || f.fileType || 'unknown' 
            };
          });

          const validAttachments = processedAttachments.filter((a: any) => a && a.url);

          return {
            ...item,
            processedAttachments: validAttachments,
          };
        }));

        // Generate Request ID
        const lastRequest = await client.reimbursementRequest.findFirst({
          where: { tenantId },
          orderBy: { requestId: 'desc' },
          select: { requestId: true }
        });

        let nextNum = 1;
        if (lastRequest && lastRequest.requestId) {
          const parts = lastRequest.requestId.split('-');
          if (parts.length > 1) {
            const lastNumStr = parts[1];
            if (!isNaN(parseInt(lastNumStr))) {
              nextNum = parseInt(lastNumStr) + 1;
            }
          }
        }
        const requestId = `EXP-${String(nextNum).padStart(5, '0')}`;

        // Create Request and Items
        const request = await client.reimbursementRequest.create({
          data: {
            tenantId,
            requestId,
            userId: req.user!.id,
            category,
            department,
            policy,
            amount: new Prisma.Decimal(Number(amount)),
            status: status || 'DRAFT',
            submittedAt: status === 'PENDING_APPROVAL' ? new Date() : null,
            activityLog,
            items: {
              create: processedItems.map((item: any) => ({
                tenantId,
                title: item.title || "Expense Item",
                date: item.date ? new Date(item.date) : new Date(),
                amount: new Prisma.Decimal(Number(item.amount) || 0),
                billNo: item.billNo,
                description: item.description
              }))
            }
          },
          include: {
            items: true
          }
        });

        // Create Attachments
        const attachmentPromises: any[] = [];

        processedItems.forEach((processedItem, index) => {
          const createdItem = request.items[index];
          if (createdItem && processedItem.processedAttachments) {
            processedItem.processedAttachments.forEach((att: any) => {
              attachmentPromises.push(
                client.reimbursementAttachment.create({
                  data: {
                    tenantId,
                    fileName: att.name || 'attachment',
                    fileUrl: att.url,
                    fileSize: att.size || 0,
                    fileType: att.type || 'unknown',
                    uploadedById: req.user!.id,
                    reimbursementRequestId: request.id,
                    reimbursementItemId: createdItem.id
                  }
                })
              );
            });
          }
        });

        if (attachmentPromises.length > 0) {
          await Promise.all(attachmentPromises);
        }

        // Fetch final request
        const finalRequest = await client.reimbursementRequest.findUnique({
          where: { id: request.id },
          include: {
            items: {
              include: { reimbursementAttachments: true }
            }
          }
        });

        res.status(201).json({
          success: true,
          data: finalRequest,
          message: 'Reimbursement request created successfully'
        });
      });
    } catch (error: any) {
      console.error('Create request error:', error);
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create request',
      });
    }
  }

  // ==============================
  // GET REQUESTS
  // ==============================
  async getRequests(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' });
        return;
      }

      const { view, status, page = 1, limit = 20, search } = req.query;
      const where: any = { tenantId: req.tenantId };

      if (view === 'manager') {
        where.status = { in: ['PENDING_APPROVAL', 'CLARIFY', 'APPROVED', 'REJECTED'] };
      } else if (view === 'finance') {
        if (status) {
          where.status = status;
        } else {
          where.OR = [
            { status: 'APPROVED' },
            { financeStatus: { not: null } }
          ];
        }
      } else {
        where.userId = req.user.id;
        if (status && status !== 'all') where.status = status;
      }

      if (search) {
        where.OR = [
          { requestId: { contains: search as string, mode: 'insensitive' } },
          { category: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [requests, total] = await Promise.all([
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.reimbursementRequest.findMany({
            where,
            include: {
              user: { select: { id: true, name: true, workEmail: true, department: true } },
              items: {
                include: {
                  reimbursementAttachments: true
                }
              }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: Number(limit)
          });
        }),
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.reimbursementRequest.count({ where });
        })
      ]);

      const transformed = requests.map(r => ({
        ...r,
        employee: r.user,
        expenseItems: r.items,
        submitted: r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : null,
        created: new Date(r.createdAt).toLocaleDateString()
      }));

      res.status(200).json({
        success: true,
        data: transformed,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      console.error('Get requests error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch requests' });
    }
  }

  // ==============================
  // GET REQUEST BY ID
  // ==============================
  async getRequestById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' });
        return;
      }

      const { id } = req.params;

      const request = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        return await client.reimbursementRequest.findFirst({
          where: { id, tenantId: req.tenantId },
          include: {
            user: { select: { id: true, name: true, workEmail: true, department: true } },
            items: {
              include: {
                reimbursementAttachments: true
              }
            },
            approvals: {
              include: { approver: { select: { name: true } } },
              orderBy: { createdAt: 'desc' }
            }
          }
        });
      });

      if (!request) {
        res.status(404).json({
          success: false,
          error: "Request not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: request,
      });
    } catch (error: any) {
      console.error("Get request by ID error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // ==============================
  // UPDATE REQUEST
  // ==============================
  async updateRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' });
        return;
      }

      const { id } = req.params;
      const { category, amount, items, status, department } = req.body;
      const tenantId = req.tenantId;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const existing = await client.reimbursementRequest.findFirst({
          where: { id, tenantId: req.tenantId }
        });

        if (!existing) throw new NotFoundError('Request not found');
        
        if (existing.status !== 'DRAFT' && existing.status !== 'CLARIFY' && existing.status !== 'PENDING_APPROVAL') {
          throw new ValidationError('Cannot edit request in current status');
        }

        const activityLog = (existing.activityLog as any[]) || [];
        activityLog.push({
          action: 'UPDATED',
          date: new Date().toISOString(),
          user: req.user!.name,
          note: 'Request updated'
        });

        // Process items
        const processedItems = await Promise.all(items.map(async (item: any) => {
          const attachments = item.attachments || item.files || [];
          const processedAttachments = attachments.map((f: any) => ({
            url: f.url || f.fileUrl || "",
            name: f.name || f.fileName || "attachment",
            size: f.size || f.fileSize || 0,
            type: f.type || f.fileType || 'unknown'
          }));

          return {
            ...item,
            processedAttachments: processedAttachments.filter((a: any) => a && a.url)
          };
        }));

        // Transaction to update
        const updated = await client.$transaction(async (tx) => {
          // Delete old items
          await tx.reimbursementItem.deleteMany({ where: { reimbursementRequestId: id } });

          // Update request and create new items
          const request = await tx.reimbursementRequest.update({
            where: { id },
            data: {
              category,
              department,
              amount: new Prisma.Decimal(Number(amount)),
              status: status || existing.status,
              submittedAt: status === 'PENDING_APPROVAL' ? new Date() : existing.submittedAt,
              activityLog,
              items: {
                create: processedItems.map((item: any) => ({
                  tenantId,
                  title: item.title,
                  date: item.date ? new Date(item.date) : new Date(),
                  amount: new Prisma.Decimal(Number(item.amount) || 0),
                  billNo: item.billNo,
                  description: item.description
                }))
              }
            },
            include: {
              items: true
            }
          });

          // Create new attachments
          const attachmentPromises: any[] = [];
          processedItems.forEach((processedItem, index) => {
            const createdItem = request.items[index];
            if (createdItem && processedItem.processedAttachments) {
              processedItem.processedAttachments.forEach((att: any) => {
                attachmentPromises.push(
                  tx.reimbursementAttachment.create({
                    data: {
                      tenantId,
                      fileName: att.name || 'attachment',
                      fileUrl: att.url,
                      fileSize: att.size || 0,
                      fileType: att.type || 'unknown',
                      uploadedById: req.user!.id,
                      reimbursementRequestId: id,
                      reimbursementItemId: createdItem.id
                    }
                  })
                );
              });
            }
          });

          if (attachmentPromises.length > 0) {
            await Promise.all(attachmentPromises);
          }

          return await tx.reimbursementRequest.findUnique({
            where: { id },
            include: {
              items: {
                include: { reimbursementAttachments: true }
              }
            }
          });
        });

        res.status(200).json({
          success: true,
          data: updated,
          message: 'Request updated successfully'
        });
      });
    } catch (error: any) {
      console.error('Update request error:', error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to update request' });
    }
  }

  // ==============================
  // DELETE REQUEST
  // ==============================
  async deleteRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' });
        return;
      }

      const { id } = req.params;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const existing = await client.reimbursementRequest.findFirst({
          where: { id, tenantId: req.tenantId }
        });

        if (!existing) throw new NotFoundError('Request not found');
        
        if (existing.status !== 'DRAFT' && existing.status !== 'PENDING_APPROVAL') {
          throw new ValidationError('Only DRAFT or PENDING requests can be deleted');
        }

        await client.reimbursementRequest.delete({ where: { id } });
      });

      res.status(200).json({
        success: true,
        message: 'Request deleted successfully'
      });
    } catch (error: any) {
      console.error('Delete request error:', error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to delete request' });
    }
  }

  // ==============================
  // MANAGER ACTION
  // ==============================
  async managerAction(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' });
        return;
      }

      const { id } = req.params;
      const { action, comments } = req.body;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const userName = req.user!.name;

      if (!['APPROVE', 'REJECT', 'CLARIFY'].includes(action)) {
        throw new ValidationError('Invalid action');
      }

      await tenantAwarePrisma.withTenant(tenantId, async (client) => {
        const request = await client.reimbursementRequest.findFirst({
          where: { id, tenantId },
          include: { user: true }
        });

        if (!request) throw new NotFoundError('Request not found');

        let newStatus = request.status;
        if (action === 'APPROVE') newStatus = 'APPROVED';
        else if (action === 'REJECT') newStatus = 'REJECTED';
        else if (action === 'CLARIFY') newStatus = 'CLARIFY';

        const activityLog = (request.activityLog as any[]) || [];
        activityLog.push({
          action: `MANAGER_${action}`,
          date: new Date().toISOString(),
          user: userName,
          note: comments
        });

        const updated = await client.$transaction(async (tx) => {
          await tx.reimbursementApproval.create({
            data: {
              tenantId,
              reimbursementRequestId: id,
              approverId: userId,
              role: 'MANAGER',
              status: action,
              comments: comments || ''
            }
          });

          return await tx.reimbursementRequest.update({
            where: { id },
            data: {
              status: newStatus,
              activityLog
            }
          });
        });

        res.status(200).json({
          success: true,
          data: updated,
          message: `Request ${action.toLowerCase()}ed successfully`
        });
      });
    } catch (error: any) {
      console.error('Manager action error:', error);
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to process manager action' });
    }
  }

  // ==============================
  // FINANCE ACTION
  // ==============================
  async financeAction(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' });
        return;
      }

      const { id } = req.params;
      const { action, comments } = req.body;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const userName = req.user!.name;

      if (!['PAID', 'REJECT', 'ON_HOLD'].includes(action)) {
        throw new ValidationError('Invalid action');
      }

      await tenantAwarePrisma.withTenant(tenantId, async (client) => {
        const request = await client.reimbursementRequest.findFirst({
          where: { id, tenantId }
        });

        if (!request) throw new NotFoundError('Request not found');

        let newStatus = request.status;
        let financeStatus = request.financeStatus;

        if (action === 'PAID') {
          newStatus = 'PAID';
          financeStatus = 'PAID';
        } else if (action === 'REJECT') {
          newStatus = 'REJECTED';
          financeStatus = 'REJECTED';
        } else if (action === 'ON_HOLD') {
          financeStatus = 'ON_HOLD';
          newStatus = 'ON_HOLD';
        }

        const activityLog = (request.activityLog as any[]) || [];
        activityLog.push({
          action: `FINANCE_${action}`,
          date: new Date().toISOString(),
          user: userName,
          note: comments
        });

        const updated = await client.$transaction(async (tx) => {
          await tx.reimbursementApproval.create({
            data: {
              tenantId,
              reimbursementRequestId: id,
              approverId: userId,
              role: 'FINANCE',
              status: action,
              comments: comments || ''
            }
          });

          return await tx.reimbursementRequest.update({
            where: { id },
            data: {
              status: newStatus,
              financeStatus,
              activityLog
            }
          });
        });

        res.status(200).json({
          success: true,
          data: updated,
          message: `Request marked as ${action.toLowerCase()}`
        });
      });
    } catch (error: any) {
      console.error('Finance action error:', error);
      res.status(500).json({ success: false, error: 'Failed to process finance action' });
    }
  }
}

// ==========================================
// REIMBURSEMENT ITEM CONTROLLER
// ==========================================
class ReimbursementItemController {
  async addItem(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' });
        return;
      }

      const { requestId } = req.params;
      const { title, date, amount, billNo, description } = req.body;

      if (!title || !date || !amount) {
        throw new ValidationError('Title, date, and amount are required');
      }

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const request = await client.reimbursementRequest.findFirst({
          where: { id: requestId, tenantId: req.tenantId }
        });

        if (!request) throw new NotFoundError('Request not found');
        
        if (request.status !== 'DRAFT' && request.status !== 'CLARIFY' && request.status !== 'PENDING_APPROVAL') {
          throw new ValidationError('Cannot add items to this request');
        }

        const result = await client.$transaction(async (tx) => {
          const item = await tx.reimbursementItem.create({
            data: {
              tenantId: req.tenantId!,
              reimbursementRequestId: requestId,
              title,
              date: new Date(date),
              amount: new Prisma.Decimal(Number(amount)),
              billNo,
              description
            }
          });

          const aggregations = await tx.reimbursementItem.aggregate({
            where: { tenantId: req.tenantId, reimbursementRequestId: requestId },
            _sum: { amount: true }
          });

          await tx.reimbursementRequest.update({
            where: { id: requestId },
            data: { amount: aggregations._sum.amount || 0 }
          });

          return item;
        });

        res.status(201).json({
          success: true,
          data: result,
          message: 'Item added successfully'
        });
      });
    } catch (error: any) {
      console.error('Add item error:', error);
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to add item' });
    }
  }

  async updateItem(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' });
        return;
      }

      const { requestId, itemId } = req.params;
      const updates = req.body;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const request = await client.reimbursementRequest.findFirst({
          where: { id: requestId, tenantId: req.tenantId }
        });

        if (!request) throw new NotFoundError('Request not found');
        
        if (request.status !== 'DRAFT' && request.status !== 'CLARIFY' && request.status !== 'PENDING_APPROVAL') {
          throw new ValidationError('Cannot update items in this request');
        }

        const result = await client.$transaction(async (tx) => {
          const item = await tx.reimbursementItem.update({
            where: { id: itemId },
            data: {
              ...updates,
              date: updates.date ? new Date(updates.date) : undefined
            }
          });

          const aggregations = await tx.reimbursementItem.aggregate({
            where: { tenantId: req.tenantId, reimbursementRequestId: requestId },
            _sum: { amount: true }
          });

          await tx.reimbursementRequest.update({
            where: { id: requestId },
            data: { amount: aggregations._sum.amount || 0 }
          });

          return item;
        });

        res.status(200).json({
          success: true,
          data: result,
          message: 'Item updated successfully'
        });
      });
    } catch (error: any) {
      console.error('Update item error:', error);
      res.status(500).json({ success: false, error: 'Failed to update item' });
    }
  }

  async deleteItem(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' });
        return;
      }

      const { requestId, itemId } = req.params;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const request = await client.reimbursementRequest.findFirst({
          where: { id: requestId, tenantId: req.tenantId }
        });

        if (!request) throw new NotFoundError('Request not found');
        
        if (request.status !== 'DRAFT' && request.status !== 'CLARIFY' && request.status !== 'PENDING_APPROVAL') {
          throw new ValidationError('Cannot delete items from this request');
        }

        await client.$transaction(async (tx) => {
          await tx.reimbursementItem.delete({
            where: { id: itemId }
          });

          const aggregations = await tx.reimbursementItem.aggregate({
            where: { tenantId: req.tenantId, reimbursementRequestId: requestId },
            _sum: { amount: true }
          });

          await tx.reimbursementRequest.update({
            where: { id: requestId },
            data: { amount: aggregations._sum.amount || 0 }
          });
        });

        res.status(200).json({
          success: true,
          message: 'Item deleted successfully'
        });
      });
    } catch (error: any) {
      console.error('Delete item error:', error);
      res.status(500).json({ success: false, error: 'Failed to delete item' });
    }
  }
}

// ==========================================
// REIMBURSEMENT APPROVAL CONTROLLER
// ==========================================
class ReimbursementApprovalController {
  async getHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' });
        return;
      }
      const { requestId } = req.params;

      const approvals = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        return await client.reimbursementApproval.findMany({
          where: { reimbursementRequestId: requestId, tenantId: req.tenantId },
          include: {
            approver: { select: { id: true, name: true, role: true } }
          },
          orderBy: { createdAt: 'desc' }
        });
      });

      res.status(200).json({ success: true, data: approvals });
    } catch (error) {
      console.error('Get history error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch approval history' });
    }
  }
}

// ==========================================
// REIMBURSEMENT ATTACHMENT CONTROLLER
// ==========================================
class ReimbursementAttachmentController {
  async addAttachment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' });
        return;
      }
      const { requestId } = req.params;
      const { itemId, file, fileName } = req.body;

      if (!file || !fileName) {
        res.status(400).json({ success: false, error: 'File and fileName are required' });
        return;
      }

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const request = await client.reimbursementRequest.findFirst({
          where: { id: requestId, tenantId: req.tenantId }
        });

        if (!request) throw new NotFoundError('Reimbursement request not found');

        // Handle file upload
        let fileToUpload = file;
        if (file && !file.startsWith('data:')) {
          const fs = require('fs');
          if (fs.existsSync(file)) {
            const fileBuffer = fs.readFileSync(file);
            const base64Data = fileBuffer.toString('base64');
            const mimeType = fileName.split('.').pop() || 'application/octet-stream';
            fileToUpload = `data:${mimeType};base64,${base64Data}`;
          }
        }

        const { fileUrl, fileSize, fileType } = await uploadFileToR2(
          fileToUpload, 
          fileName, 
          req.tenantId!
        );

        const attachment = await client.reimbursementAttachment.create({
          data: {
            tenantId: req.tenantId!,
            reimbursementRequestId: requestId,
            reimbursementItemId: itemId || null,
            fileName,
            fileUrl,
            fileType,
            fileSize,
            uploadedById: req.user!.id
          },
          include: {
            uploadedBy: {
              select: {
                id: true,
                name: true,
                workEmail: true,
                position: true
              }
            }
          }
        });

        res.status(201).json({ success: true, data: attachment });
      });
    } catch (error) {
      console.error('Add attachment error:', error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to add attachment' });
    }
  }

  async deleteAttachment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' });
        return;
      }
      const { attachmentId } = req.params;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const attachment = await client.reimbursementAttachment.findFirst({
          where: { id: attachmentId, tenantId: req.tenantId }
        });

        if (!attachment) throw new NotFoundError('Attachment not found');

        try {
          await deleteFileFromR2(attachment.fileUrl, req.tenantId!);
        } catch (e) {
          console.error("Failed to delete file from R2", e);
        }

        await client.reimbursementAttachment.delete({ where: { id: attachmentId } });
      });

      res.status(200).json({ success: true, message: 'Attachment deleted' });
    } catch (error: any) {
      console.error('Delete attachment error:', error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to delete attachment' });
    }
  }

  async getAttachments(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' });
        return;
      }
      const { requestId } = req.params;

      const attachments = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        return await client.reimbursementAttachment.findMany({
          where: { reimbursementRequestId: requestId, tenantId: req.tenantId },
          include: {
            uploadedBy: {
              select: {
                id: true,
                name: true,
                workEmail: true,
                position: true
              }
            }
          },
          orderBy: { uploadedAt: 'desc' }
        });
      });

      res.status(200).json({ success: true, data: attachments });
    } catch (error) {
      console.error('Get attachments error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch attachments' });
    }
  }
}

// ==========================================
// EXPORT ALL CONTROLLERS
// ==========================================
const reimbursementCategoryController = new ReimbursementCategoryController();
const reimbursementRequestController = new ReimbursementRequestController();
const reimbursementItemController = new ReimbursementItemController();
const reimbursementApprovalController = new ReimbursementApprovalController();
const reimbursementAttachmentController = new ReimbursementAttachmentController();

export {
  reimbursementCategoryController as default,
  reimbursementRequestController,
  reimbursementItemController,
  reimbursementApprovalController,
  reimbursementAttachmentController
};