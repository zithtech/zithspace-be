import type { Request, Response } from 'express';
import { paymentService } from './payment.service';

export const paymentController = {
  async createOrder(req: Request, res: Response) {
    try {
      // tenantId comes from the auth middleware
      const tenantId = (req as any).tenant?.id || req.body.tenantId;
      
      const payload = { ...req.body, tenantId };
      const order = await paymentService.createOrder(payload);
      res.status(200).json(order);
    } catch (error: any) {
      const msg = error.response?.data?.error || error.response?.data?.message || error.message;
      console.error('[PaymentController] createOrder error:', msg);
      res.status(400).json({ success: false, error: msg });
    }
  },

  async verifyPayment(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenant?.id || req.body.tenantId;
      const result = await paymentService.verifyPayment(req.body, tenantId);
      res.status(200).json(result);
    } catch (error: any) {
      const msg = error.response?.data?.error || error.response?.data?.message || error.message;
      console.error('[PaymentController] verifyPayment error:', msg);
      res.status(400).json({ success: false, error: msg });
    }
  }
};
