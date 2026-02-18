import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { tenantAwarePrisma } from '@/config/database';

import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError

} from '@/types';
import { uploadFileToR2, deleteFileFromR2 } from "@/utils/r2Client";

export class ReimbursementCategoryController {
  /**
   * Get all reimbursement categories with filtering and pagination
   */
  static async getCategories(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const {
        page = 1,
        limit = 20,
        search,
        isActive,
        sortBy = 'name',
        sortOrder = 'asc',
        names,
        roles
      } = req.query;

      const where: any = {
        tenantId: req.tenantId,
      };

      if (isActive !== undefined && isActive !== 'all') {
        where.isActive = isActive === 'true';
      }

      if (search) {
        where.name = { contains: search as string, mode: 'insensitive' };
      }

      if (names) {
        const nameList = (names as string).split(',').filter(Boolean);
        if (nameList.length > 0) {
          where.name = { in: nameList };
        }
      }

      if (roles) {
        const roleList = (roles as string).split(',').filter(Boolean);
        if (roleList.length > 0) {
          where.eligibleRoles = { hasSome: roleList };
        }
      }

      const orderBy: any = {};
      orderBy[sortBy as string] = sortOrder === 'desc' ? 'desc' : 'asc';

      const skip = (Number(page) - 1) * Number(limit);

      const [categories, total] = await Promise.all([
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.reimbursementCategory.findMany({
            where,
            include: {
              createdByUser: {
                select: { id: true, name: true }
              },
              updatedByUser: {
                select: { id: true, name: true }
              }
            },
            orderBy,
            skip,
            take: Number(limit),
          });
        }),
        tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
          return await client.reimbursementCategory.count({ where });
        })
      ]);

      const totalPages = Math.ceil(total / Number(limit));

      res.status(200).json({
        success: true,
        data: categories,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: totalPages,
          hasNext: Number(page) < totalPages,
          hasPrev: Number(page) > 1
        }
      } as ApiResponse);
    } catch (error) {
      console.error('Get reimbursement categories error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch reimbursement categories'
      } as ApiResponse);
    }
  }

  /**
   * Get category by ID
   */
  static async getCategoryById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const category = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        return await client.reimbursementCategory.findFirst({
          where: { id, tenantId: req.tenantId },
          include: {
            createdByUser: { select: { id: true, name: true } },
            updatedByUser: { select: { id: true, name: true } }
          }
        });
      });

      if (!category) {
        throw new NotFoundError('Reimbursement category not found');
      }

      res.status(200).json({
        success: true,
        data: category
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get category by ID error:', error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to fetch category' } as ApiResponse);
    }
  }

  /**
   * Create new reimbursement category
   */
  static async createCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
        return;
      }

      const {
        name,
        maxPerRequest,
        monthlyLimit,
        yearlyLimit,
        eligibleRoles,
        approvalRoles,
        accept,
        attachmentRequired,
        isActive
      } = req.body;

      if (!name) {
        throw new ValidationError('Category name is required');
      }

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        // Check for duplicate name
        const existing = await client.reimbursementCategory.findFirst({
          where: {
            tenantId: req.tenantId,
            name: { equals: name, mode: 'insensitive' }
          }
        });

        if (existing) {
          throw new ValidationError('A category with this name already exists');
        }

        const category = await client.reimbursementCategory.create({
          data: {
            tenant: { connect: { id: req.tenantId } },
            name,
            monthlyLimit: monthlyLimit ? new Prisma.Decimal(monthlyLimit) : null,
            yearlyLimit: yearlyLimit ? new Prisma.Decimal(yearlyLimit) : null,
            maxRequestsPerMonth: maxPerRequest ? Number(maxPerRequest) : null,
            eligibleRoles: eligibleRoles || [],
            acceptRoles: accept || [],
            approvalRoles: approvalRoles || [],
            attachmentRequired: attachmentRequired ?? false,
            isActive: isActive ?? true,
            createdByUser: { connect: { id: req.user!.id } },
            updatedByUser: { connect: { id: req.user!.id } }
          }
        });

        res.status(201).json({
          success: true,
          data: category,
          message: 'Reimbursement category created successfully'
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Create category error:', error);
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to create category' } as ApiResponse);
    }
  }

  /**
   * Update reimbursement category
   */
  static async updateCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const updates = req.body;

      // Prevent updating immutable fields
      delete updates.id;
      delete updates.tenantId;
      delete updates.createdAt;
      delete updates.createdBy;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const existing = await client.reimbursementCategory.findFirst({
          where: { id, tenantId: req.tenantId }
        });

        if (!existing) {
          throw new NotFoundError('Category not found');
        }

        // Check name uniqueness if name is changing
        if (updates.name && updates.name.toLowerCase() !== existing.name.toLowerCase()) {
          const duplicate = await client.reimbursementCategory.findFirst({
            where: {
              tenantId: req.tenantId,
              name: { equals: updates.name, mode: 'insensitive' },
              id: { not: id }
            }
          });

          if (duplicate) {
            throw new ValidationError('A category with this name already exists');
          }
        }


        const {
          name,
          maxPerRequest,
          monthlyLimit,
          yearlyLimit,
          eligibleRoles,
          approvalRoles,
          accept,
          attachmentRequired,
          isActive
        } = updates;

        const updateData: any = {
          updatedByUser: { connect: { id: req.user!.id } },
          updatedAt: new Date()
        };

        if (name !== undefined) updateData.name = name;
        if (maxPerRequest !== undefined) updateData.maxRequestsPerMonth = maxPerRequest ? Number(maxPerRequest) : null;
        if (monthlyLimit !== undefined) updateData.monthlyLimit = monthlyLimit ? new Prisma.Decimal(monthlyLimit) : null;
        if (yearlyLimit !== undefined) updateData.yearlyLimit = yearlyLimit ? new Prisma.Decimal(yearlyLimit) : null;
        if (eligibleRoles !== undefined) updateData.eligibleRoles = eligibleRoles;
        if (approvalRoles !== undefined) updateData.approvalRoles = approvalRoles;
        if (accept !== undefined) updateData.acceptRoles = accept;
        if (attachmentRequired !== undefined) updateData.attachmentRequired = attachmentRequired;
        if (isActive !== undefined) updateData.isActive = isActive;

        const category = await client.reimbursementCategory.update({
          where: { id },
          data: updateData
        });

        res.status(200).json({
          success: true,
          data: category,
          message: 'Reimbursement category updated successfully'
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Update category error:', error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to update category' } as ApiResponse);
    }
  }

  /**
   * Delete reimbursement category
   */
  static async deleteCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
        return;
      }

      const { id } = req.params;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const existing = await client.reimbursementCategory.findFirst({
          where: { id, tenantId: req.tenantId }
        });

        if (!existing) {
          throw new NotFoundError('Category not found');
        }

        await client.reimbursementCategory.delete({
          where: { id }
        });

        res.status(200).json({
          success: true,
          message: 'Reimbursement category deleted successfully'
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Delete category error:', error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      // Handle foreign key constraints (if any items use this category)
      if (error.code === 'P2003') {
        res.status(400).json({
          success: false,
          error: 'Cannot delete category because it is being used by existing reimbursement requests'
        } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to delete category' } as ApiResponse);
    }
  }

  /**
   * Upload file (Generic)
   */
  static async uploadFile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const file = (req as any).file;
      if (!file) {
        throw new ValidationError('No file uploaded');
      }

      const fs = require('fs');
      const path = require('path');
      const filePath = file.path;

      // Read file and convert to base64 for R2 upload
      const fileBuffer = fs.readFileSync(filePath);
      const base64Data = fileBuffer.toString('base64');
      const mimeType = file.mimetype;
      const dataUri = `data:${mimeType};base64,${base64Data}`;

      const { fileUrl, fileSize, fileType } = await uploadFileToR2(
        dataUri,
        file.originalname,
        req.tenantId
      );

      // Clean up local temp file after R2 upload
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }

      res.status(200).json({
        success: true,
        filename: file.originalname,
        url: fileUrl,
        fileSize: fileSize,
        fileType: fileType
      } as ApiResponse);
    } catch (error: any) {
      console.error('Upload file error:', error);
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: error.message || 'Failed to upload file' } as ApiResponse);
    }
  }
}

// ==========================================
// REIMBURSEMENT REQUEST CONTROLLER
// ==========================================

export class ReimbursementRequestController {
  /**
   * Create a new reimbursement request
   */
  static async createRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
        return;
      }

      const { category, amount, items, policy, status, department } = req.body;
      const tenantId = req.tenantId; // Capture tenantId for closure safety

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

        // Process items to handle Base64 attachments (upload to R2)
        const processedItems = await Promise.all(items.map(async (item: any) => {
          const attachments = item.attachments || item.files || [];
          const processedAttachments = await Promise.all(attachments.map(async (f: any) => {
            let url = "";
            let name = "attachment";

            if (typeof f === 'string') {
              url = f;
            } else {
              url = f.url || f.fileUrl || f.response?.url || "";
              name = f.name || f.fileName || "attachment";
            }

            if (url && url.startsWith('data:')) {
              try {
                const { fileUrl, fileSize, fileType } = await uploadFileToR2(url, name, tenantId);
                return { url: fileUrl, name, size: fileSize, type: fileType };
              } catch (e) {
                console.error("Failed to upload base64 attachment", e);
                return null;
              }
            }
            return { url, name, size: f.size || f.fileSize || 0, type: f.type || f.fileType || 'unknown' };
          }));

          const validAttachments = processedAttachments.filter((a: any) => a && a.url);

          return {
            ...item,
            processedAttachments: validAttachments,
            attachments: validAttachments.map(a => a.url) // Legacy compatibility
          };
        }));

        // Generate Request ID more robustly to avoid collisions
        const lastRequest = await client.reimbursementRequest.findFirst({
          where: { tenantId },
          orderBy: { requestId: 'desc' },
          select: { requestId: true }
        });

        let nextNum = 1;
        if (lastRequest && lastRequest.requestId.startsWith('EXP-')) {
          const lastNumStr = lastRequest.requestId.split('-')[1];
          if (!isNaN(parseInt(lastNumStr))) {
            nextNum = parseInt(lastNumStr) + 1;
          }
        }
        const requestId = `EXP-${String(nextNum).padStart(5, '0')}`;

        console.log("🚀 Creating Request with RequestID:", requestId);
        console.log("📦 Body Items Count:", items.length);
        console.log("📦 Processed Items Count:", processedItems.length);

        try {
          // STEP 1: Create Request and Items (without nested attachments)
          const request = await client.reimbursementRequest.create({
            data: {
              tenantId,
              requestId,
              userId: req.user!.id,
              category,
              department: department,
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

          // STEP 2: Create Attachments for each item explicitly
          // We iterate through processedItems and find the matching created item by index or unique property
          // Since create: [] preserves order, we can map by index
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

          // Fetch the final request with all relations to return to frontend
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
          } as ApiResponse);
        } catch (dbError: any) {
          console.error("Prisma Create Error:", dbError);
          throw dbError; // Rethrow to be caught by outer catch
        }
      });
    } catch (error: any) {
      console.error('Create request error:', error);
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create request',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        details: error
      } as ApiResponse);
    }
  }

  /**
   * Get requests (My Requests, Manager Approvals, Finance View)
   */
  static async getRequests(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
        return;
      }

      const { view, status, page = 1, limit = 20, search } = req.query;
      const where: any = { tenantId: req.tenantId };

      // View Logic
      if (view === 'manager') {
        // Relaxed check: Allow seeing all requests for Manager/Admin view as requested
        // Previously restricted to subordinates: if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && userRole !== 'MANAGER') { where.user = { reportsToId: req.user.id }; }

        // Fetch statuses relevant to Manager (Pending, Clarify, Approved/Rejected for history/stats)
        where.status = { in: ['PENDING_APPROVAL', 'CLARIFY', 'APPROVED', 'REJECTED'] };
      } else if (view === 'finance') {
        // Finance sees APPROVED requests (ready for payment) or PAID/REJECTED history
        if (status) {
          where.status = status; // Can filter by PAID, etc.
        } else {
          // Finance sees APPROVED requests (incoming) OR requests they have acted on (financeStatus is set)
          where.OR = [
            { status: 'APPROVED' },
            { financeStatus: { not: null } }
          ];
        }
      } else {
        // Default: My Requests
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

      // Transform for frontend if needed (e.g., mapping user to employee)
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
      } as ApiResponse);

    } catch (error) {
      console.error('Get requests error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch requests' } as ApiResponse);
    }
  }

  /**
   * Get request by ID
   */
  static async getRequestById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
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
        throw new NotFoundError('Request not found');
      }

      res.status(200).json({
        success: true,
        data: {
          ...request,
          employee: request.user,
          expenseItems: request.items
        }
      } as ApiResponse);
    } catch (error: any) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to fetch request' } as ApiResponse);
    }
  }

  /**
   * Update request (Edit)
   */
  static async updateRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { category, amount, items, status, department } = req.body;
      const tenantId = req.tenantId; // Capture tenantId for closure safety

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const existing = await client.reimbursementRequest.findFirst({
          where: { id, tenantId: req.tenantId }
        });

        if (!existing) throw new NotFoundError('Request not found');
        if (existing.status !== 'DRAFT' && existing.status !== 'CLARIFY' && existing.status !== 'PENDING_APPROVAL') {
          throw new ValidationError('Cannot edit request unless it is Draft, Pending Approval, or Clarification requested');
        }

        // Update logic
        const activityLog = existing.activityLog as any[];
        activityLog.push({
          action: 'UPDATED',
          date: new Date().toISOString(),
          user: req.user!.name,
          note: 'Request updated'
        });

        // Process items to handle Base64 attachments (upload to R2)
        const processedItems = await Promise.all(items.map(async (item: any) => {
          const attachments = item.attachments || item.files || [];
          const processedAttachments = await Promise.all(attachments.map(async (f: any) => {
            let url = "";
            let name = "attachment";

            if (typeof f === 'string') {
              url = f;
            } else {
              url = f.url || f.fileUrl || f.response?.url || "";
              name = f.name || f.fileName || "attachment";
            }

            if (url && url.startsWith('data:')) {
              try {
                const { fileUrl, fileSize, fileType } = await uploadFileToR2(url, name, tenantId);
                return { url: fileUrl, name, size: fileSize, type: fileType };
              } catch (e) {
                console.error("Failed to upload base64 attachment", e);
                return null;
              }
            }
            return { url, name, size: f.size || f.fileSize || 0, type: f.type || f.fileType || 'unknown' };
          }));

          const validAttachments = processedAttachments.filter((a: any) => a && a.url);

          return {
            ...item,
            processedAttachments: validAttachments
          };
        }));

        console.log("🚀 Updating Request:", id);
        console.log("📦 Items to update:", processedItems.length);

        // Transaction to update request and replace items
        const updated = await client.$transaction(async (tx) => {
          try {
            // Delete old items and their attachments (Prisma cascade or manual)
            await tx.reimbursementItem.deleteMany({ where: { reimbursementRequestId: id } });

            // STEP 1: Update request and create new items (without nested attachments)
            const request = await tx.reimbursementRequest.update({
              where: { id },
              data: {
                category,
                department,
                amount: new Prisma.Decimal(Number(amount)),
                status: status || existing.status, // Can submit while updating
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

            // STEP 2: Create new attachments explicitly linked to both Request and Item
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
                        reimbursementRequestId: id, // request ID
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

            // Fetch final state
            return await tx.reimbursementRequest.findUnique({
              where: { id },
              include: {
                items: {
                  include: { reimbursementAttachments: true }
                }
              }
            });
          } catch (txError: any) {
            console.error("❌ Prisma Update Transaction Error:", txError);
            throw txError;
          }
        });

        res.status(200).json({
          success: true,
          data: updated,
          message: 'Request updated successfully'
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Update request error:', error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to update request' } as ApiResponse);
    }
  }

  /**
   * Delete request
   */
  static async deleteRequest(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
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

        res.status(200).json({
          success: true,
          message: 'Request deleted successfully'
        } as ApiResponse);
      });
    } catch (error: any) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to delete request' } as ApiResponse);
    }
  }

  /**
   * Manager Action (Approve, Reject, Clarify)
   */
  static async managerAction(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { action, comments } = req.body; // action: APPROVE, REJECT, CLARIFY
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

        // Relaxed check: Allow any manager/admin to approve as requested
        // Previously restricted to direct managers: if (request.user.reportsToId !== req.user!.id && req.user!.role !== 'admin' && req.user!.role !== 'super_admin') { throw new ValidationError('You are not authorized to approve this request'); }

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

        // Update Request and Create Approval Record
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
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Manager action error:', error);
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to process manager action' } as ApiResponse);
    }
  }

  /**
   * Finance Action (Paid, Reject, On Hold)
   */
  static async financeAction(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { action, comments } = req.body; // action: PAID, REJECT, ON_HOLD
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const userName = req.user!.name;

      if (!['PAID', 'REJECT', 'ON_HOLD'].includes(action)) {
        throw new ValidationError('Invalid action');
      }

      // Check if user has finance role (assuming 'admin' or specific role, here using admin for simplicity)
      // In real app, check for 'finance' role or permission
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        // throw new ValidationError('Only finance/admin can perform this action');
        // For now allowing admin
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
          newStatus = 'REJECTED'; // Or keep APPROVED and set financeStatus REJECTED? Usually final reject.
          financeStatus = 'REJECTED';
        } else if (action === 'ON_HOLD') {
          financeStatus = 'ON_HOLD';
          // Status might stay APPROVED or move to ON_HOLD
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
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Finance action error:', error);
      res.status(500).json({ success: false, error: 'Failed to process finance action' } as ApiResponse);
    }
  }
}

// ==========================================
// REIMBURSEMENT ITEM CONTROLLER
// ==========================================

export class ReimbursementItemController {
  /**
   * Add item to request
   */
  static async addItem(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
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
          throw new ValidationError('Cannot add items to a submitted or approved request');
        }

        // Create Item and Update Request Total
        const result = await client.$transaction(async (tx) => {
          const item = await tx.reimbursementItem.create({
            data: {
              tenantId: req.tenantId!,
              reimbursementRequestId: requestId,
              title,
              date: new Date(date),
              amount,
              billNo,
              description
            }
          });

          // Recalculate total
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
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Add item error:', error);
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to add item' } as ApiResponse);
    }
  }

  /**
   * Update item
   */
  static async updateItem(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
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
          throw new ValidationError('Cannot update items in a submitted or approved request');
        }

        const result = await client.$transaction(async (tx) => {
          const item = await tx.reimbursementItem.update({
            where: { id: itemId },
            data: {
              ...updates,
              date: updates.date ? new Date(updates.date) : undefined
            }
          });

          // Recalculate total
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
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Update item error:', error);
      res.status(500).json({ success: false, error: 'Failed to update item' } as ApiResponse);
    }
  }

  /**
   * Delete item
   */
  static async deleteItem(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
        return;
      }

      const { requestId, itemId } = req.params;

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const request = await client.reimbursementRequest.findFirst({
          where: { id: requestId, tenantId: req.tenantId }
        });

        if (!request) throw new NotFoundError('Request not found');
        if (request.status !== 'DRAFT' && request.status !== 'CLARIFY' && request.status !== 'PENDING_APPROVAL') {
          throw new ValidationError('Cannot delete items from a submitted or approved request');
        }

        await client.$transaction(async (tx) => {
          await tx.reimbursementItem.delete({
            where: { id: itemId }
          });

          // Recalculate total
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
        } as ApiResponse);
      });
    } catch (error: any) {
      console.error('Delete item error:', error);
      res.status(500).json({ success: false, error: 'Failed to delete item' } as ApiResponse);
    }
  }
}

// ==========================================
// REIMBURSEMENT APPROVAL CONTROLLER
// ==========================================

export class ReimbursementApprovalController {
  static async getHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
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

      res.status(200).json({ success: true, data: approvals } as ApiResponse);
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch approval history' } as ApiResponse);
    }
  }
}

// ==========================================
// REIMBURSEMENT ATTACHMENT CONTROLLER
// ==========================================

export class ReimbursementAttachmentController {
  static async addAttachment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
        return;
      }
      const { requestId } = req.params;
      const { itemId, file, fileName } = req.body;

      if (!file || !fileName) {
        res.status(400).json({ success: false, error: 'File and fileName are required' } as ApiResponse);
        return;
      }

      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        const request = await client.reimbursementRequest.findFirst({
          where: { id: requestId, tenantId: req.tenantId }
        });

        if (!request) throw new NotFoundError('Reimbursement request not found');

        const { fileUrl, fileSize, fileType } = await uploadFileToR2(file, fileName, req.tenantId!, requestId);

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

        res.status(201).json({ success: true, data: attachment } as ApiResponse);
      });
    } catch (error) {
      console.error('Add attachment error:', error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to add attachment' } as ApiResponse);
    }
  }

  static async deleteAttachment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
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

      res.status(200).json({ success: true, message: 'Attachment deleted' } as ApiResponse);
    } catch (error: any) {
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to delete attachment' } as ApiResponse);
    }
  }

  static async getAttachments(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
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

      res.status(200).json({ success: true, data: attachments } as ApiResponse);
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch attachments' } as ApiResponse);
    }
  }
}
