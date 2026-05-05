/**
 * Auto-Purge Trash Job
 *
 * Automatically deletes tickets that have been in trash for more than 7 days.
 * Runs daily at 2:00 AM server time.
 *
 * Features:
 * - Tenant-scoped deletion (processes each tenant separately)
 * - Cascade deletion of related data (comments, attachments, activity logs, etc.)
 * - Performance optimized with batching
 * - Cache invalidation for affected tickets
 * - Detailed logging with metrics
 *
 * @example
 * // In your main server file (app.ts or index.ts):
 * import { startTrashAutoPurgeJob } from '@/jobs/trashAutoPurge';
 *
 * // After server initialization:
 * startTrashAutoPurgeJob();
 */
interface PurgeStats {
    tenantId: string;
    ticketsDeleted: number;
    commentsDeleted: number;
    attachmentsDeleted: number;
    linksDeleted: number;
    activityLogsDeleted: number;
    duration: number;
    leadsDeleted?: number;
}
interface PurgeSummary {
    startTime: Date;
    endTime: Date;
    totalDuration: number;
    tenantsProcessed: number;
    totalTicketsDeleted: number;
    totalCommentsDeleted: number;
    totalAttachmentsDeleted: number;
    totalLinksDeleted: number;
    totalActivityLogsDeleted: number;
    totalLeadsDeleted: number;
    errors: Array<{
        tenantId: string;
        error: string;
    }>;
    stats: PurgeStats[];
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
export declare function startTrashAutoPurgeJob(): void;
/**
 * Manual trigger for testing or emergency purge
 * Can be called via API endpoint
 */
export declare function triggerManualPurge(): Promise<PurgeSummary>;
export {};
