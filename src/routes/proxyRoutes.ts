import { Router } from 'express';
import axios from 'axios';

const router = Router();

/**
 * GET /api/proxy-logo?url=...
 * Proxy external images to avoid CORS issues in cropping
 */
router.get('/proxy-logo', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const contentType = (response.headers['content-type'] as string) || 'image/jpeg';
      
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(response.data);
  } catch (error) {
    console.error('Proxy logo error:', error);
    res.status(500).json({ success: false, error: 'Failed to proxy logo' });
  }
});

import { SUBSCRIPTION_CONSTANTS } from '../modules/subscriptions/subscription.constants';

router.get('/plans', async (req, res) => {
  try {
    const adminApiUrl = SUBSCRIPTION_CONSTANTS.ADMIN_API_URL;
    const response = await axios.get(`${adminApiUrl}/api/plans`);
    res.json(response.data);
  } catch (error) {
    console.error('Proxy plans error:', error);
    res.status(500).json({ success: false, error: 'Failed to proxy plans' });
  }
});

router.get('/subscriptions/tenant/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const adminApiUrl = SUBSCRIPTION_CONSTANTS.ADMIN_API_URL;
    const response = await axios.get(`${adminApiUrl}/api/subscriptions/tenant/${tenantId}`);
    res.json(response.data);
  } catch (error: any) {
    console.error('Proxy subscription error:', error?.response?.data || error);
    res.status(error?.response?.status || 500).json(error?.response?.data || { success: false, error: 'Failed to proxy subscription' });
  }
});

export default router;
