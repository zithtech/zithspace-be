import { Request, Response } from 'express';
import { LinearAuthService } from '../services/LinearAuthService';
import { AuthRequest } from '../types';

const linearAuthService = new LinearAuthService();

export class LinearAuthController {
  static getConnectUrl = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.tenantId || !req.user?.id) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const clientUrl = req.headers.origin || req.headers.referer || process.env.FRONTEND_URL || 'http://localhost:3005';
      // If referer is something like http://localhost:3005/integrations, we just want the base URL
      const baseUrl = new URL(clientUrl as string).origin;
      
      const authUrl = linearAuthService.getConnectUrl(req.tenantId, req.user.id, baseUrl);
      res.json({ success: true, data: { authUrl } });
    } catch (error: any) {
      console.error('Error generating Linear connect URL:', error);
      res.status(500).json({ success: false, error: 'Failed to generate connect URL' });
    }
  };

  static handleCallback = async (req: Request, res: Response): Promise<void> => {
    try {
      const { code, state, error, error_description } = req.query;
      const fallbackUrl = process.env.FRONTEND_URL || 'http://localhost:3005';

      // Handle OAuth errors from Linear
      if (error) {
        console.error('Linear OAuth Error:', error, error_description);
        res.redirect(`${fallbackUrl}/integrations?error=` + encodeURIComponent(error_description as string || 'OAuth flow failed'));
        return;
      }

      if (!code || !state) {
        res.redirect(`${fallbackUrl}/integrations?error=Missing+code+or+state`);
        return;
      }

      const { clientUrl } = await linearAuthService.handleCallback(code as string, state as string);
      
      // Redirect back to frontend on success
      res.redirect(`${clientUrl}/integrations?success=linear_connected`);
    } catch (err: any) {
      const fallbackUrl = process.env.FRONTEND_URL || 'http://localhost:3005';
      console.error('Linear OAuth Callback Error:', err);
      res.redirect(`${fallbackUrl}/integrations?error=` + encodeURIComponent(err.message || 'Failed to connect Linear'));
    }
  };

  static getStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.tenantId || !req.user?.id) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      
      const integrationId = await linearAuthService.getStatus(req.tenantId, req.user.id);
      res.json({ success: true, data: { connected: !!integrationId, integrationId } });
    } catch (error: any) {
      console.error('Error getting Linear status:', error);
      res.status(500).json({ success: false, error: 'Failed to get Linear status' });
    }
  };

  static disconnect = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.tenantId || !req.user?.id) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      
      await linearAuthService.disconnect(req.tenantId, req.user.id);
      res.json({ success: true, message: 'Disconnected from Linear' });
    } catch (error: any) {
      console.error('Error disconnecting Linear:', error);
      res.status(500).json({ success: false, error: 'Failed to disconnect from Linear' });
    }
  };
}
