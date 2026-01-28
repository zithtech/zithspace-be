"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTrashAutoPurgeJob = startTrashAutoPurgeJob;
exports.triggerManualPurge = triggerManualPurge;
const node_cron_1 = __importDefault(require("node-cron"));
const database_1 = require("../config/database");
const cacheService_1 = require("../utils/cacheService");
/**
 * Purge expired trash for a single tenant
 */
async function purgeTrashForTenant(tenantId) {
    const startTime = Date.now();
    // Calculate the cutoff date (7 days ago)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    console.log(`[Trash Auto-Purge] Processing tenant: ${tenantId}`);
    console.log(`[Trash Auto-Purge] Cutoff date: ${sevenDaysAgo.toISOString()}`);
    // Find tickets to delete for this tenant
    const ticketsToDelete = await database_1.prisma.ticket.findMany({
        where: {
            tenantId,
            isDeleted: true,
            deletedAt: {
                lte: sevenDaysAgo,
            },
        },
        select: {
            id: true,
            ticketNumber: true,
            title: true,
            deletedAt: true,
        },
    });
    if (ticketsToDelete.length === 0) {
        console.log(`[Trash Auto-Purge] No expired tickets found for tenant ${tenantId}`);
        return {
            tenantId,
            ticketsDeleted: 0,
            commentsDeleted: 0,
            attachmentsDeleted: 0,
            linksDeleted: 0,
            activityLogsDeleted: 0,
            duration: Date.now() - startTime,
        };
    }
    console.log(`[Trash Auto-Purge] Found ${ticketsToDelete.length} expired tickets for tenant ${tenantId}:`);
    ticketsToDelete.forEach(ticket => {
        console.log(`  - ${ticket.ticketNumber}: ${ticket.title} (deleted ${ticket.deletedAt?.toISOString()})`);
    });
    const ticketIds = ticketsToDelete.map(t => t.id);
    // Delete in transaction for data consistency
    const result = await database_1.prisma.$transaction(async (tx) => {
        // Delete comments
        const deletedComments = await tx.ticketComment.deleteMany({
            where: { ticketId: { in: ticketIds } },
        });
        // Delete attachments
        const deletedAttachments = await tx.ticketAttachment.deleteMany({
            where: { ticketId: { in: ticketIds } },
        });
        // Delete related links (external URL links)
        const deletedLinks = await tx.ticketRelatedLink.deleteMany({
            where: {
                ticketId: { in: ticketIds },
            },
        });
        // Delete activity logs
        const deletedActivityLogs = await tx.ticketActivityLog.deleteMany({
            where: { ticketId: { in: ticketIds } },
        });
        // Delete tickets
        const deletedTickets = await tx.ticket.deleteMany({
            where: { id: { in: ticketIds } },
        });
        return {
            ticketsDeleted: deletedTickets.count,
            commentsDeleted: deletedComments.count,
            attachmentsDeleted: deletedAttachments.count,
            linksDeleted: deletedLinks.count,
            activityLogsDeleted: deletedActivityLogs.count,
        };
    });
    // Invalidate cache for deleted tickets
    for (const ticketId of ticketIds) {
        await cacheService_1.cacheService.invalidateTicket(tenantId, ticketId);
    }
    const duration = Date.now() - startTime;
    console.log(`[Trash Auto-Purge] Tenant ${tenantId} completed in ${duration}ms:`);
    console.log(`  - Tickets: ${result.ticketsDeleted}`);
    console.log(`  - Comments: ${result.commentsDeleted}`);
    console.log(`  - Attachments: ${result.attachmentsDeleted}`);
    console.log(`  - Links: ${result.linksDeleted}`);
    console.log(`  - Activity Logs: ${result.activityLogsDeleted}`);
    return {
        tenantId,
        ...result,
        duration,
    };
}
/**
 * Run the trash auto-purge job for all tenants
 */
async function runAutoPurgeJob() {
    const startTime = new Date();
    console.log(`\n========================================`);
    console.log(`[Trash Auto-Purge] Job started at ${startTime.toISOString()}`);
    console.log(`========================================\n`);
    const summary = {
        startTime,
        endTime: new Date(),
        totalDuration: 0,
        tenantsProcessed: 0,
        totalTicketsDeleted: 0,
        totalCommentsDeleted: 0,
        totalAttachmentsDeleted: 0,
        totalLinksDeleted: 0,
        totalActivityLogsDeleted: 0,
        errors: [],
        stats: [],
    };
    try {
        // Get all tenants
        const tenants = await database_1.prisma.tenant.findMany({
            where: { isActive: true },
            select: { id: true, name: true },
        });
        console.log(`[Trash Auto-Purge] Found ${tenants.length} active tenants to process\n`);
        // Process each tenant sequentially
        for (const tenant of tenants) {
            try {
                const stats = await purgeTrashForTenant(tenant.id);
                summary.stats.push(stats);
                summary.tenantsProcessed++;
                summary.totalTicketsDeleted += stats.ticketsDeleted;
                summary.totalCommentsDeleted += stats.commentsDeleted;
                summary.totalAttachmentsDeleted += stats.attachmentsDeleted;
                summary.totalLinksDeleted += stats.linksDeleted;
                summary.totalActivityLogsDeleted += stats.activityLogsDeleted;
            }
            catch (error) {
                console.error(`[Trash Auto-Purge] Error processing tenant ${tenant.id}:`, error);
                summary.errors.push({
                    tenantId: tenant.id,
                    error: error.message || 'Unknown error',
                });
            }
        }
    }
    catch (error) {
        console.error('[Trash Auto-Purge] Fatal error:', error);
        summary.errors.push({
            tenantId: 'SYSTEM',
            error: error.message || 'Fatal error during job execution',
        });
    }
    summary.endTime = new Date();
    summary.totalDuration = summary.endTime.getTime() - summary.startTime.getTime();
    // Log summary
    console.log(`\n========================================`);
    console.log(`[Trash Auto-Purge] Job completed at ${summary.endTime.toISOString()}`);
    console.log(`========================================`);
    console.log(`Duration: ${summary.totalDuration}ms (${(summary.totalDuration / 1000).toFixed(2)}s)`);
    console.log(`Tenants Processed: ${summary.tenantsProcessed}`);
    console.log(`Total Tickets Deleted: ${summary.totalTicketsDeleted}`);
    console.log(`Total Comments Deleted: ${summary.totalCommentsDeleted}`);
    console.log(`Total Attachments Deleted: ${summary.totalAttachmentsDeleted}`);
    console.log(`Total Links Deleted: ${summary.totalLinksDeleted}`);
    console.log(`Total Activity Logs Deleted: ${summary.totalActivityLogsDeleted}`);
    if (summary.errors.length > 0) {
        console.log(`\nErrors encountered: ${summary.errors.length}`);
        summary.errors.forEach(err => {
            console.log(`  - Tenant ${err.tenantId}: ${err.error}`);
        });
    }
    console.log(`========================================\n`);
    return summary;
}
/**
 * Start the cron job
 *
 * Schedule: Daily at 2:00 AM
 * Cron Expression: '0 2 * * *'
 * - Minute: 0 (top of the hour)
 * - Hour: 2 (2 AM)
 * - Day of Month: * (every day)
 * - Month: * (every month)
 * - Day of Week: * (every day of the week)
 */
function startTrashAutoPurgeJob() {
    console.log('[Trash Auto-Purge] Initializing cron job...');
    console.log('[Trash Auto-Purge] Schedule: Daily at 2:00 AM (0 2 * * *)');
    // Schedule the job
    node_cron_1.default.schedule('0 2 * * *', async () => {
        try {
            await runAutoPurgeJob();
        }
        catch (error) {
            console.error('[Trash Auto-Purge] Unhandled error in cron job:', error);
        }
    }, {
        timezone: process.env.CRON_TIMEZONE || 'UTC',
    });
    console.log('[Trash Auto-Purge] Cron job scheduled successfully');
    console.log(`[Trash Auto-Purge] Timezone: ${process.env.CRON_TIMEZONE || 'UTC'}`);
    console.log('[Trash Auto-Purge] Next run: Tomorrow at 2:00 AM\n');
}
/**
 * Manual trigger for testing or emergency purge
 * Can be called via API endpoint
 */
async function triggerManualPurge() {
    console.log('[Trash Auto-Purge] Manual purge triggered');
    return await runAutoPurgeJob();
}
//# sourceMappingURL=trashAutoPurge.js.map