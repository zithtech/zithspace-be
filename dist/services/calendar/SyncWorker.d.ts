export declare class SyncWorker {
    private static isRunning;
    /**
     * Start the sync scheduler. Polls every 5 minutes for integrations due for sync
     * and enqueues them into the BullMQ queue instead of calling directly.
     */
    static start(): void;
    private static pollAndEnqueue;
}
