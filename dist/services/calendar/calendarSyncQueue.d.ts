export declare const calendarSyncQueue: any;
/**
 * Enqueue an incremental sync for one integration.
 * Uses integrationId as jobId to prevent duplicate jobs in the queue.
 */
export declare function enqueueSync(integrationId: string): Promise<void>;
