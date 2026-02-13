// zithspace-be/src/services/emailLoggerService.ts

import { prisma } from "@/config/database";

import { randomUUID } from 'crypto';

export interface EmailLogData {
  // Tenant
  tenantId: string;
  
  // Module information
  module: string;        // 'INVOICE', 'ESTIMATE', etc.
  moduleId: string;      // Database ID of the record
  moduleNumber: string;  // Human readable number (INV-001, EST-001)
  
  // Email content
  to: string;
  from: string;
  fromName?: string;
  subject: string;
  html: string;          // Full HTML email content - EXACTLY as sent
  plainText?: string;
  
  // Customer information (snapshot at send time)
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  
  // Invoice specific fields
  amount?: string;
  dueDate?: string;
  currency?: string;
  
  // Attachment
  hasAttachment?: boolean;
  attachmentUrl?: string;
  attachmentName?: string;
  
  // Status
  status: 'SENT' | 'FAILED' | 'OPENED' | 'CLICKED' | 'BOUNCED';
  errorMessage?: string;
  
  // User who sent
  sentBy: string;        // User ID
  sentByUser?: string;   // User name/email
  
  // Optional metadata
  metadata?: any;
}

export class EmailLoggerService {
  
  /**
   * Log an email that was sent
   */
  static async logEmail(data: EmailLogData): Promise<void> {
    try {
      await prisma.emailLog.create({
        data: {
          id: randomUUID(),
          tenantId: data.tenantId,
          
          // Module
          module: data.module,
          moduleId: data.moduleId,
          moduleNumber: data.moduleNumber,
          
          // Email
          to: data.to,
          from: data.from,
          fromName: data.fromName,
          subject: data.subject,
          html: data.html,
          plainText: data.plainText,
          
          // Customer
          customerId: data.customerId,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          
          // Invoice specific
          amount: data.amount,
          dueDate: data.dueDate,
          currency: data.currency,
          
          // Attachment
          hasAttachment: data.hasAttachment || false,
          attachmentUrl: data.attachmentUrl,
          attachmentName: data.attachmentName,
          
          // Status
          status: data.status,
          errorMessage: data.errorMessage,
          sentAt: new Date(),
          
          // User
          sentBy: data.sentBy,
          sentByUser: data.sentByUser,
          
          // Metadata
          metadata: data.metadata || {}
        }
      });
      
      console.log(`✅ Email logged: ${data.module} ${data.moduleNumber} to ${data.to}`);
      
    } catch (error) {
      console.error('❌ Failed to log email:', error);
      // Don't throw - email is already sent, logging should not break the flow
    }
  }

  /**
   * Get email logs with filtering and pagination
   */
  static async getEmailLogs(
    tenantId: string,
    filters: {
      module?: string;
      moduleId?: string;
      customerId?: string;
      search?: string;
      status?: string;
      startDate?: Date;
      endDate?: Date;
    },
    pagination: {
      page: number;
      limit: number;
    }
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };

    // Apply filters
    if (filters.module) where.module = filters.module;
    if (filters.moduleId) where.moduleId = filters.moduleId;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.status) where.status = filters.status;
    
    // Date range filter
    if (filters.startDate || filters.endDate) {
      where.sentAt = {};
      if (filters.startDate) where.sentAt.gte = filters.startDate;
      if (filters.endDate) where.sentAt.lte = filters.endDate;
    }

    // Search across multiple fields
    if (filters.search) {
      where.OR = [
        { moduleNumber: { contains: filters.search, mode: 'insensitive' } },
        { to: { contains: filters.search, mode: 'insensitive' } },
        { subject: { contains: filters.search, mode: 'insensitive' } },
        { customerName: { contains: filters.search, mode: 'insensitive' } },
        { customerEmail: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    // Get total count for pagination
    const total = await prisma.emailLog.count({ where });

    // Get paginated results
    const logs = await prisma.emailLog.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      skip,
      take: limit,
      include: {
        customer: {
          select: {
            id: true,
            companyName: true,
            email: true
          }
        },
        sentByUserRel: {
          select: {
            id: true,
            name: true,
            
          }
        }
      }
    });

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get a single email log by ID
   */
  static async getEmailById(id: string, tenantId: string) {
    return prisma.emailLog.findFirst({
      where: { id, tenantId },
      include: {
        customer: true,
        sentByUserRel: {
          select: {
            id: true,
            name: true,
            
          }
        }
      }
    });
  }

  /**
   * Get all unique modules that have sent emails
   */
  static async getModules(tenantId: string) {
    const modules = await prisma.emailLog.findMany({
      where: { tenantId },
      select: { module: true },
      distinct: ['module'],
      orderBy: { module: 'asc' }
    });
    return modules.map(m => m.module);
  }

  /**
   * Get email statistics
   */
  static async getStats(tenantId: string) {
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const weekAgo = new Date(now.setDate(now.getDate() - 7));
    const monthAgo = new Date(now.setMonth(now.getMonth() - 1));

    const [
      total,
      sentToday,
      sentThisWeek,
      sentThisMonth,
      byModule,
      byStatus
    ] = await Promise.all([
      prisma.emailLog.count({ where: { tenantId } }),
      prisma.emailLog.count({
        where: {
          tenantId,
          sentAt: { gte: today }
        }
      }),
      prisma.emailLog.count({
        where: {
          tenantId,
          sentAt: { gte: weekAgo }
        }
      }),
      prisma.emailLog.count({
        where: {
          tenantId,
          sentAt: { gte: monthAgo }
        }
      }),
      prisma.emailLog.groupBy({
        by: ['module'],
        where: { tenantId },
        _count: true,
        orderBy: { _count: { id: 'desc' } }
      }),
      prisma.emailLog.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true
      })
    ]);

    return {
      total,
      sentToday,
      sentThisWeek,
      sentThisMonth,
      byModule: byModule.map(m => ({
        module: m.module,
        count: m._count
      })),
      byStatus: byStatus.map(s => ({
        status: s.status,
        count: s._count
      }))
    };
  }

  /**
   * Update email status (for tracking opens/clicks)
   */
  static async updateStatus(
    id: string, 
    tenantId: string, 
    status: 'OPENED' | 'CLICKED',
    metadata?: any
  ) {
    const updateData: any = {};
    
    if (status === 'OPENED') {
      updateData.openedAt = new Date();
      updateData.status = 'OPENED';
    } else if (status === 'CLICKED') {
      updateData.clickedAt = new Date();
      updateData.status = 'CLICKED';
    }

    return prisma.emailLog.update({
      where: { id },
      data: updateData
    });
  }
}