import { Request, Response } from 'express';
import { prisma } from '@/config/database';
import { uploadDealFileToR2 } from '@/utils/r2Client';

// Activities
export const getDealActivities = async (req: Request, res: Response) => {
  try {
    const { id: dealId } = req.params;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant context missing' });
    }

    const activities = await prisma.dealActivity.findMany({
      where: {
        dealId,
        tenantId,
      },
      orderBy: {
        scheduledAt: 'desc',
      },
    });

    return res.status(200).json({ success: true, data: activities });
  } catch (error) {
    console.error('Error fetching deal activities:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch deal activities' });
  }
};

export const createDealActivity = async (req: Request, res: Response) => {
  try {
    const { id: dealId } = req.params;
    const { type, content, scheduledAt } = req.body;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant context missing' });
    }

    const activity = await prisma.dealActivity.create({
      data: {
        dealId,
        tenantId,
        type,
        content,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      },
    });

    return res.status(201).json({ success: true, data: activity });
  } catch (error) {
    console.error('Error creating deal activity:', error);
    return res.status(500).json({ success: false, error: 'Failed to create deal activity' });
  }
};

// Communications
export const getDealCommunications = async (req: Request, res: Response) => {
  try {
    const { id: dealId } = req.params;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant context missing' });
    }

    const communications = await prisma.dealCommunication.findMany({
      where: {
        dealId,
        tenantId,
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    return res.status(200).json({ success: true, data: communications });
  } catch (error) {
    console.error('Error fetching deal communications:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch deal communications' });
  }
};

export const createDealCommunication = async (req: Request, res: Response) => {
  try {
    const { id: dealId } = req.params;
    const { type, direction, sender, receiver, subject, content } = req.body;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant context missing' });
    }

    const communication = await prisma.dealCommunication.create({
      data: {
        dealId,
        tenantId,
        type: type || 'Email',
        direction,
        sender,
        receiver,
        subject,
        content,
      },
    });

    return res.status(201).json({ success: true, data: communication });
  } catch (error) {
    console.error('Error creating deal communication:', error);
    return res.status(500).json({ success: false, error: 'Failed to create deal communication' });
  }
};

// Tasks
export const getDealTasks = async (req: Request, res: Response) => {
  try {
    const { id: dealId } = req.params;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant context missing' });
    }

    const tasks = await prisma.dealTask.findMany({
      where: {
        dealId,
        tenantId,
      },
      include: {
        assignedTo: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.status(200).json({ success: true, data: tasks });
  } catch (error) {
    console.error('Error fetching deal tasks:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch deal tasks' });
  }
};

export const createDealTask = async (req: Request, res: Response) => {
  try {
    const { id: dealId } = req.params;
    const { title, description, dueDate, assignedToId } = req.body;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant context missing' });
    }

    const task = await prisma.dealTask.create({
      data: {
        dealId,
        tenantId,
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : null,
        assignedToId,
      },
    });

    return res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error('Error creating deal task:', error);
    return res.status(500).json({ success: false, error: 'Failed to create deal task' });
  }
};

export const updateDealTaskStatus = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant context missing' });
    }

    const task = await prisma.dealTask.update({
      where: {
        id: taskId,
        tenantId,
      },
      data: {
        status,
      },
    });

    return res.status(200).json({ success: true, data: task });
  } catch (error) {
    console.error('Error updating deal task:', error);
    return res.status(500).json({ success: false, error: 'Failed to update deal task' });
  }
};

// Files
export const getDealFiles = async (req: Request, res: Response) => {
  try {
    const { id: dealId } = req.params;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant context missing' });
    }

    const files = await prisma.dealFile.findMany({
      where: {
        dealId,
        tenantId,
      },
      include: {
        uploadedBy: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.status(200).json({ success: true, data: files });
  } catch (error) {
    console.error('Error fetching deal files:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch deal files' });
  }
};

export const createDealFile = async (req: Request, res: Response) => {
  try {
    const { id: dealId } = req.params;
    const { fileName, fileType, base64File } = req.body;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;

    if (!base64File) {
      return res.status(400).json({ success: false, error: 'File data missing' });
    }

    // Fetch user to get employeeId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { employeeId: true }
    });

    // Upload to R2
    const { fileUrl, fileSize, fileType: contentType } = await uploadDealFileToR2(
      base64File,
      fileName,
      tenantId,
      dealId
    );

    const file = await prisma.dealFile.create({
      data: {
        dealId,
        tenantId,
        fileName,
        fileUrl,
        fileType: contentType || fileType,
        fileSize,
        uploadedById: user?.employeeId || null,
      },
    });

    return res.status(201).json({ success: true, data: file });
  } catch (error: any) {
    console.error('CRITICAL: Error creating deal file:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to create deal file',
      details: error.message 
    });
  }
};

// Financials
export const getDealFinancials = async (req: Request, res: Response) => {
  try {
    const { id: dealId } = req.params;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant context missing' });
    }

    console.log(`Fetching financials for deal: ${dealId}, tenant: ${tenantId}`);

    const financials = await prisma.deal.findFirst({
      where: { id: dealId, tenantId },
      select: {
        estimatedValue: true,
        cost: true,
        currency: true,
        paymentSchedule: {
          orderBy: { dueDate: 'asc' }
        }
      }
    });

    if (!financials) {
      return res.status(404).json({ success: false, error: 'Deal financials not found' });
    }

    return res.status(200).json({ success: true, data: financials });
  } catch (error: any) {
    console.error('CRITICAL: Error fetching deal financials:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch deal financials',
      details: error.message
    });
  }
};

export const updateDealFinancials = async (req: Request, res: Response) => {
  try {
    const { id: dealId } = req.params;
    const { estimatedValue, cost } = req.body;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant context missing' });
    }

    const deal = await prisma.deal.update({
      where: { id: dealId, tenantId },
      data: {
        estimatedValue,
        cost
      }
    });

    return res.status(200).json({ success: true, data: deal });
  } catch (error: any) {
    console.error('Error updating deal financials:', error);
    return res.status(500).json({ success: false, error: 'Failed to update deal financials' });
  }
};

export const createPaymentMilestone = async (req: Request, res: Response) => {
  try {
    const { id: dealId } = req.params;
    const { milestone, amount, dueDate } = req.body;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant context missing' });
    }

    const payment = await prisma.dealPaymentSchedule.create({
      data: {
        dealId,
        tenantId,
        milestone,
        amount,
        dueDate: new Date(dueDate),
        status: 'Pending'
      }
    });

    return res.status(201).json({ success: true, data: payment });
  } catch (error: any) {
    console.error('Error creating payment milestone:', error);
    return res.status(500).json({ success: false, error: 'Failed to create payment milestone' });
  }
};

export const updatePaymentStatus = async (req: Request, res: Response) => {
  try {
    const { milestoneId } = req.params;
    const { status } = req.body;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant context missing' });
    }

    const payment = await prisma.dealPaymentSchedule.update({
      where: { id: milestoneId, tenantId },
      data: { status }
    });

    return res.status(200).json({ success: true, data: payment });
  } catch (error: any) {
    console.error('Error updating payment status:', error);
    return res.status(500).json({ success: false, error: 'Failed to update payment status' });
  }
};
