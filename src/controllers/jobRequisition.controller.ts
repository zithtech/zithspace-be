import { Response } from "express";
import { tenantAwarePrisma } from "@/config/database";
import { uploadRequisitionAttachmentToR2, deleteFileFromR2 } from "@/utils/r2Client";
import { nanoid } from "nanoid";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";

/**
 * Create a new Job Requisition
 */
export const createRequisition = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.tenantId || !req.user) {
      res.status(400).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
      return;
    }

    const { 
      assignedRecruiters, 
      contactIds, 
      implementationContactId, 
      clientContactId, 
      vendorContactId, 
      ...data 
    } = req.body;

    // Validate required fields
    if (!data.jobTitle || !data.jobTitle.trim()) {
      res.status(400).json({
        success: false,
        error: "Job title is required",
      } as ApiResponse);
      return;
    }
    if (!data.jobType) {
      res.status(400).json({
        success: false,
        error: "Job type is required",
      } as ApiResponse);
      return;
    }

    const tenantId = req.tenantId;

    // Generate ticketId: ZR-YYYY-NNN  (parse MAX existing to avoid collision on delete)
    const currentYear = new Date().getFullYear();
    const prefix = `ZR-${currentYear}-`;

    const lastReq = await tenantAwarePrisma.withTenant(
      tenantId,
      async (client) => {
        return await client.jobRequisition.findFirst({
          where: {
            tenantId,
            ticketId: { startsWith: prefix },
          },
          orderBy: { ticketId: "desc" },
          select: { ticketId: true },
        });
      }
    );

    let nextNum = 101; // start from 101
    if (lastReq?.ticketId) {
      const parts = lastReq.ticketId.split("-");
      const lastNum = parseInt(parts[2], 10);
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1;
      }
    }
    const ticketId = `${prefix}${nextNum}`;

    const newRequisition = await tenantAwarePrisma.withTenant(
      tenantId,
      async (client) => {
        const requisition = await client.jobRequisition.create({
          data: {
            ...data,
            tenantId,
            ticketId,
            createdById: req.user!.id,
            ...(assignedRecruiters && assignedRecruiters.length > 0
              ? {
                  assignedRecruiters: {
                    connect: assignedRecruiters.map((id: string) => ({ id })),
                  },
                }
              : {}),
            ...(contactIds && contactIds.length > 0
              ? {
                  jobRequisitionContacts: {
                    create: contactIds.map((cid: string) => ({ contactId: cid })),
                  },
                }
              : {}),
          },
          include: {
            client: true,
            createdBy: {
              select: { id: true, name: true, workEmail: true },
            },
            accountManager: {
              select: { id: true, name: true, workEmail: true },
            },
            deliveryManager: {
              select: { id: true, name: true, workEmail: true },
            },
            jobRequisitionContacts: true,
          },
        });
        return requisition;
      }
    );

    res.status(201).json({
      success: true,
      data: newRequisition,
      message: "Job requisition created successfully",
    } as ApiResponse);
  } catch (error) {
    console.error("Error creating job requisition:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create job requisition",
    } as ApiResponse);
  }
};

/**
 * Get all Job Requisitions with filtering + pagination
 *
 * Query params: search, status, priority, clientId, visa, startDateFrom, startDateTo, page, limit
 */
export const getRequisitions = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.tenantId || !req.user) {
      res.status(400).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
      return;
    }

    const {
      search,
      status,
      priority,
      clientId,
      visa,
      startDateFrom,
      startDateTo,
      page = 1,
      limit = 10,
    } = req.query;

    const tenantId = req.tenantId;

    // Build where clause
    const where: any = { tenantId };

    if (search) {
      where.OR = [
        { ticketId: { contains: search as string, mode: "insensitive" } },
        { jobTitle: { contains: search as string, mode: "insensitive" } },
        { jobLocation: { contains: search as string, mode: "insensitive" } },
      ];
    }

    if (status) {
      where.status = status as string;
    }

    if (priority) {
      where.priority = priority as string;
    }

    if (clientId) {
      where.clientId = clientId as string;
    }

    if (visa) {
      where.allowedVisaTypes = { has: visa as string };
    }

    if (startDateFrom || startDateTo) {
      where.startDate = {};
      if (startDateFrom) {
        where.startDate.gte = new Date(startDateFrom as string);
      }
      if (startDateTo) {
        where.startDate.lte = new Date(startDateTo as string);
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [requisitions, total] = await Promise.all([
      tenantAwarePrisma.withTenant(tenantId, async (client) => {
        return await client.jobRequisition.findMany({
          where,
          include: {
            client: true,
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: Number(limit),
        });
      }),
      tenantAwarePrisma.withTenant(tenantId, async (client) => {
        return await client.jobRequisition.count({ where });
      }),
    ]);

    const totalPages = Math.ceil(total / Number(limit));

    res.status(200).json({
      success: true,
      data: requisitions,
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
    console.error("Error fetching job requisitions:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch job requisitions",
    } as ApiResponse);
  }
};

/**
 * Get a single Job Requisition by ID
 */
export const getRequisitionById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.tenantId || !req.user) {
      res.status(400).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
      return;
    }

    const { id } = req.params;

    const requisition = await tenantAwarePrisma.withTenant(
      req.tenantId,
      async (client) => {
        return await client.jobRequisition.findFirst({
          where: { id, tenantId: req.tenantId },
          include: {
            client: true,
            createdBy: {
              select: { id: true, name: true, workEmail: true },
            },
            accountManager: {
              select: { id: true, name: true, workEmail: true },
            },
            deliveryManager: {
              select: { id: true, name: true, workEmail: true },
            },
            jobRequisitionContacts: true,
          },
        });
      }
    );

    if (!requisition) {
      res.status(404).json({
        success: false,
        error: "Job requisition not found",
      } as ApiResponse);
      return;
    }

    res.status(200).json({
      success: true,
      data: requisition,
    } as ApiResponse);
  } catch (error) {
    console.error("Error fetching job requisition:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch job requisition",
    } as ApiResponse);
  }
};

/**
 * Update a Job Requisition
 */
export const updateRequisition = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.tenantId || !req.user) {
      res.status(400).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
      return;
    }

    const { id } = req.params;
    const { 
      assignedRecruiters, 
      contactIds, 
      implementationContactId, 
      clientContactId, 
      vendorContactId, 
      ...updateData 
    } = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData.tenantId;
    delete updateData.ticketId;
    delete updateData.createdById;
    delete updateData.createdAt;
    delete updateData.id;

    // Check existence
    const existing = await tenantAwarePrisma.withTenant(
      req.tenantId,
      async (client) => {
        return await client.jobRequisition.findFirst({
          where: { id, tenantId: req.tenantId },
        });
      }
    );

    if (!existing) {
      res.status(404).json({
        success: false,
        error: "Job requisition not found",
      } as ApiResponse);
      return;
    }

    const requisition = await tenantAwarePrisma.withTenant(
      req.tenantId,
      async (client) => {
        const requisition = await client.jobRequisition.update({
          where: { id },
          data: {
            ...updateData,
            ...(assignedRecruiters !== undefined
              ? {
                  assignedRecruiters: {
                    set: assignedRecruiters.map((rid: string) => ({ id: rid })),
                  },
                }
              : {}),
            ...(contactIds !== undefined
              ? {
                  jobRequisitionContacts: {
                    deleteMany: {},
                    create: contactIds.map((cid: string) => ({
                      contactId: cid,
                    })),
                  },
                }
              : {}),
          },
          include: {
            client: true,
            createdBy: {
              select: { id: true, name: true, workEmail: true },
            },
            accountManager: {
              select: { id: true, name: true, workEmail: true },
            },
            deliveryManager: {
              select: { id: true, name: true, workEmail: true },
            },
            jobRequisitionContacts: true,
          },
        });
        return requisition;
      }
    );

    res.status(200).json({
      success: true,
      data: requisition,
      message: "Job requisition updated successfully",
    } as ApiResponse);
  } catch (error) {
    console.error("Error updating job requisition:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update job requisition",
    } as ApiResponse);
  }
};

/**
 * Delete a Job Requisition (hard delete)
 */
export const deleteRequisition = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.tenantId || !req.user) {
      res.status(400).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
      return;
    }

    const { id } = req.params;

    // Check existence
    const existing = await tenantAwarePrisma.withTenant(
      req.tenantId,
      async (client) => {
        return await client.jobRequisition.findFirst({
          where: { id, tenantId: req.tenantId },
        });
      }
    );

    if (!existing) {
      res.status(404).json({
        success: false,
        error: "Job requisition not found",
      } as ApiResponse);
      return;
    }

    await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
      return await client.jobRequisition.delete({
        where: { id },
      });
    });

    res.status(200).json({
      success: true,
      message: "Job requisition deleted successfully",
    } as ApiResponse);
  } catch (error) {
    console.error("Error deleting job requisition:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete job requisition",
    } as ApiResponse);
  }
};
/**
 * Delete multiple Job Requisitions (batch delete)
 */
export const deleteRequisitions = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.tenantId || !req.user) {
      res.status(400).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
      return;
    }

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        error: "Job requisition IDs are required",
      } as ApiResponse);
      return;
    }

    await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
      return await client.jobRequisition.deleteMany({
        where: {
          id: { in: ids },
          tenantId: req.tenantId,
        },
      });
    });

    res.status(200).json({
      success: true,
      message: `${ids.length} job requisitions deleted successfully`,
    } as ApiResponse);
  } catch (error) {
    console.error("Error deleting job requisitions:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete job requisitions",
    } as ApiResponse);
  }
};

/**
 * Upload an attachment for a Job Requisition
 */
export const uploadAttachment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.tenantId || !req.user) {
      res.status(403).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
      return;
    }

    const { id } = req.params;
    const { file, fileName, category } = req.body;



    if (!file || !fileName || !category) {
      res.status(400).json({
        success: false,
        error: "File, fileName, and category are required",
      } as ApiResponse);
      return;
    }

    // Verify requisition exists
    const requisition = await tenantAwarePrisma.withTenant(
      req.tenantId,
      async (client) => {
        return await client.jobRequisition.findFirst({
          where: { id, tenantId: req.tenantId },
        });
      }
    );

    if (!requisition) {
      res.status(404).json({
        success: false,
        error: "Job requisition not found",
      } as ApiResponse);
      return;
    }

    // Upload to R2 under requisition_attachments folder
    const { fileUrl, fileSize, fileType } = await uploadRequisitionAttachmentToR2(
      file,
      fileName,
      req.tenantId,
      id,
      category
    );
    
    // Wait for the R2 upload, then create metadata
    const newAttachment = {
      id: nanoid(),
      requisitionId: id,
      fileName,
      fileUrl,
      fileSize,
      fileType,
      category,
      uploadedAt: new Date().toISOString(),
      uploadedBy: {
        id: req.user.id,
        name: req.user.name,
        workEmail: (req.user as any).workEmail || req.user.email || "",
        position: (req.user as any).role || "" // We don't have position name easily available, using role
      },
      r2Key: fileUrl // R2 utils `deleteFileFromR2` extracts key from URL
    };

    // We need to parse existing attachments, update it, and save it
    let currentAttachments: any[] = [];
    if (requisition.attachments) {
      if (typeof requisition.attachments === 'string') {
        try { currentAttachments = JSON.parse(requisition.attachments); } catch(e) { currentAttachments = []; }
      } else if (Array.isArray(requisition.attachments)) {
        currentAttachments = requisition.attachments as any[];
      }
    }
    
    // Replace old attachment of same category, or add new
    const updatedAttachments = currentAttachments.filter(a => a.category !== category);
    updatedAttachments.push(newAttachment);

    await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
      return await client.jobRequisition.update({
        where: { id },
        data: {
          attachments: updatedAttachments,
        },
      });
    });

    res.status(201).json({ success: true, data: newAttachment });
  } catch (error: any) {
    console.error("Error uploading job requisition attachment:", error);
    if (error.message && error.message.includes("5MB")) {
      res.status(413).json({ success: false, error: "File too large. Max 5MB." });
      return;
    }
    res.status(500).json({
      success: false,
      error: "Failed to upload attachment",
    } as ApiResponse);
  }
};

/**
 * Get all attachments for a Job Requisition
 */
export const getAttachments = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.tenantId || !req.user) {
      res.status(403).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
      return;
    }

    const { id } = req.params;

    const requisition = await tenantAwarePrisma.withTenant(
      req.tenantId,
      async (client) => {
        return await client.jobRequisition.findFirst({
          where: { id, tenantId: req.tenantId },
          select: { attachments: true },
        });
      }
    );

    if (!requisition) {
      res.status(404).json({
        success: false,
        error: "Job requisition not found",
      } as ApiResponse);
      return;
    }

    let attachments: any[] = [];
    if (requisition.attachments) {
      if (typeof requisition.attachments === 'string') {
        try { attachments = JSON.parse(requisition.attachments); } catch(e) { attachments = []; }
      } else if (Array.isArray(requisition.attachments)) {
        attachments = requisition.attachments as any[];
      }
    }

    res.status(200).json({ success: true, data: attachments });
  } catch (error) {
    console.error("Error fetching job requisition attachments:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch attachments",
    } as ApiResponse);
  }
};

/**
 * Delete an attachment from a Job Requisition
 */
export const deleteAttachment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.tenantId || !req.user) {
      res.status(403).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
      return;
    }

    const { id, attachmentId } = req.params;

    const requisition = await tenantAwarePrisma.withTenant(
      req.tenantId,
      async (client) => {
        return await client.jobRequisition.findFirst({
          where: { id, tenantId: req.tenantId },
        });
      }
    );

    if (!requisition) {
      res.status(404).json({
        success: false,
        error: "Job requisition not found",
      } as ApiResponse);
      return;
    }

    let currentAttachments: any[] = [];
    if (requisition.attachments) {
      if (typeof requisition.attachments === 'string') {
        try { currentAttachments = JSON.parse(requisition.attachments); } catch(e) { currentAttachments = []; }
      } else if (Array.isArray(requisition.attachments)) {
        currentAttachments = requisition.attachments as any[];
      }
    }

    const attachmentToDelete = currentAttachments.find(a => a.id === attachmentId);
    
    if (!attachmentToDelete) {
      res.status(404).json({ success: false, error: "Attachment not found" });
      return;
    }

    // Try deleting from R2
    try {
      if (attachmentToDelete.fileUrl) {
        await deleteFileFromR2(attachmentToDelete.fileUrl, req.tenantId);
      }
    } catch (r2Error) {
      console.error("Warning: Failed to delete file from R2, proceeding with DB removal", r2Error);
      // We continue to remove it from DB even if R2 fails (e.g., file already gone)
    }

    const updatedAttachments = currentAttachments.filter(a => a.id !== attachmentId);

    await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
      return await client.jobRequisition.update({
        where: { id },
        data: {
          attachments: updatedAttachments,
        },
      });
    });

    res.status(200).json({ success: true, message: "Attachment deleted successfully" });
  } catch (error) {
    console.error("Error deleting job requisition attachment:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete attachment",
    } as ApiResponse);
  }
};
