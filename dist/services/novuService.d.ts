export declare class NovuService {
    private novu;
    constructor();
    /**
     * Trigger a notification to a list of subscribers
     * @param workflowId The trigger/workflow ID from Novu dashboard
     * @param subscribers Array of subscriber IDs (user IDs)
     * @param payload Custom payload for the notification template
     */
    triggerNotification(workflowId: string, subscribers: string[], payload: Record<string, any>): Promise<void>;
}
export declare const novuService: NovuService;
