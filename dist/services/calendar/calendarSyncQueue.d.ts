import { Queue } from 'bullmq';
export declare const calendarSyncQueue: Queue<any, any, string, any, any, string>;
/**
 * Enqueue an incremental sync for one integration.
 * Uses integrationId as jobId to prevent duplicate jobs in the queue.
 */
export declare function enqueueSync(integrationId: string): Promise<void>;
