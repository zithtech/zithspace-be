
import { Novu } from '@novu/node';

export class NovuService {
    private novu: Novu;

    constructor() {
        if (!process.env.NOVU_API_KEY) {
            console.warn('NOVU_API_KEY is not set. Notifications will not be sent.');
        }
        this.novu = new Novu(process.env.NOVU_API_KEY || '');
    }

    /**
     * Trigger a notification to a list of subscribers
     * @param workflowId The trigger/workflow ID from Novu dashboard
     * @param subscribers Array of subscriber IDs (user IDs)
     * @param payload Custom payload for the notification template
     */
    async triggerNotification(
        workflowId: string,
        subscribers: string[],
        payload: Record<string, any>
    ) {
        if (!process.env.NOVU_API_KEY) return;

        try {
            // Trigger for each subscriber
            // Novu supports bulk trigger or individual. 
            // For simplicity and to match the 'to' field requirements, we can iterate or formatting correctly.
            // The Novu Node SDK 'trigger' method takes 'to' which can be a single subscriber ID or an object.
            // To send to multiple, we usually loop or use specific bulk methods if available.
            // However, recent SDK versions allow 'to' to be an array of subscriberIds strings? 
            // Actually, standard usage often implies individual triggers or using Topics.
            // Let's iterate for safety unless we use Topics.

            const promises = subscribers.map(subscriberId => {
                return this.novu.trigger(workflowId, {
                    to: {
                        subscriberId,
                    },
                    payload,
                });
            });

            await Promise.all(promises);

            console.log(`[Novu] Triggered '${workflowId}' for ${subscribers.length} subscribers.`);
        } catch (error) {
            console.error(`[Novu] Error triggering notification '${workflowId}':`, error);
        }
    }
}

export const novuService = new NovuService();
