import { Request, Response } from "express";
import { AuthRequest } from "@/types";
import { PushNotificationService } from "@/services/pushNotificationService";
import { WebPushSubscriptionModel } from "@/models/WebPushSubscription.model";

export class NotificationController {
  /**
   * GET /api/notifications/vapid-public-key
   * Returns the VAPID public key so the client can subscribe.
   */
  static getPublicKey(req: Request, res: Response) {
    try {
      const publicKey = PushNotificationService.getPublicKey();
      return res.status(200).json({
        success: true,
        data: { publicKey },
      });
    } catch (error: any) {
      console.error("[NotificationController] getPublicKey error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to retrieve public key",
      });
    }
  }

  /**
   * POST /api/notifications/subscribe
   * Saves or updates the push notification subscription details for the logged-in user.
   */
  static async subscribe(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { endpoint, keys } = req.body;

      if (!req.user?.id) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      if (!endpoint || !keys || !keys.auth || !keys.p256dh) {
        res.status(400).json({ success: false, error: "Missing required subscription keys" });
        return;
      }

      const subscription = await WebPushSubscriptionModel.save(
        req.user.id,
        endpoint,
        keys.auth,
        keys.p256dh
      );

      res.status(201).json({
        success: true,
        data: subscription,
        message: "Successfully subscribed to push notifications",
      });
    } catch (error: any) {
      console.error("[NotificationController] subscribe error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to save push subscription",
      });
    }
  }
}
