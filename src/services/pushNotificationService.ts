import webpush from 'web-push';
import { WebPushSubscriptionModel } from '@/models/WebPushSubscription.model';

const DEFAULT_PUBLIC_KEY = 'BP3NCbIahVLML5QVhRRJUybLdvfq_LWxquXDkrNrkETXsxwZyyVfcFeT3jiIvAdddmEZOnIdPR62rSXVjxHZ8cA';
const DEFAULT_PRIVATE_KEY = 'WlmtLe9eAYAQGn1uCZj_vMy_gHDCvyYhh0QQbZDxjy0';

const publicKey = process.env.VAPID_PUBLIC_KEY || DEFAULT_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;
const mailTo = process.env.VAPID_MAILTO || 'mailto:support@zukvo.com';

// Initialize web-push with VAPID details
webpush.setVapidDetails(mailTo, publicKey, privateKey);

export class PushNotificationService {
  /**
   * Retrieves the public VAPID key.
   */
  static getPublicKey(): string {
    return publicKey;
  }

  /**
   * Sends a push notification to all active devices of the specified users.
   */
  static async sendNotification(
    userIds: string[], 
    payload: { title: string; body: string; url?: string }
  ): Promise<void> {
    if (!userIds || userIds.length === 0) return;

    console.log(`[PushNotificationService] Querying subscriptions for user IDs:`, userIds);

    try {
      // Get all subscriptions for target user IDs
      const subscriptions = await WebPushSubscriptionModel.getSubscriptionsByUserIds(userIds);
      
      if (subscriptions.length === 0) {
        console.log(`[PushNotificationService] No active web push subscriptions found for users:`, userIds);
        return;
      }

      console.log(`[PushNotificationService] Sending push to ${subscriptions.length} devices...`);

      const payloadString = JSON.stringify(payload);

      // Trigger all notification dispatches in parallel
      const sendPromises = subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            auth: sub.keysAuth,
            p256dh: sub.keysP256dh
          }
        };

        try {
          await webpush.sendNotification(pushSubscription, payloadString);
        } catch (error: any) {
          // Prune subscriptions if the user unregistered or the subscription expired
          if (error.statusCode === 410 || error.statusCode === 404) {
            console.log(`[PushNotificationService] Pruning expired subscription for endpoint:`, sub.endpoint);
            await WebPushSubscriptionModel.deleteByEndpoint(sub.endpoint).catch(err => {
              console.error(`[PushNotificationService] Failed to prune subscription:`, err);
            });
          } else {
            console.error(`[PushNotificationService] Error sending to subscription:`, error.message);
          }
        }
      });

      await Promise.all(sendPromises);
    } catch (error: any) {
      console.error(`[PushNotificationService] Failed to execute sendNotification:`, error.message);
    }
  }

  /**
   * Sends a notification to users matching a list of email addresses.
   */
  static async sendNotificationToEmails(
    emails: string[],
    payload: { title: string; body: string; url?: string }
  ): Promise<void> {
    if (!emails || emails.length === 0) return;
    
    console.log(`[PushNotificationService] Triggering push check for emails:`, emails);

    try {
      const userIds = await WebPushSubscriptionModel.findUserIdsByEmails(emails);
      if (userIds.length === 0) {
        console.log(`[PushNotificationService] No active users found in DB matching emails:`, emails);
        return;
      }
      await this.sendNotification(userIds, payload);
    } catch (error: any) {
      console.error(`[PushNotificationService] Failed to sendNotificationToEmails:`, error.message);
    }
  }
}
