import pool from '../config/dbpool';
import crypto from 'crypto';
import axios from 'axios';

export class LinearAuthService {
  private clientId = process.env.LINEAR_CLIENT_ID || '64627264e30d9c5d4e9cc5d4a5ad7cd4';
  private clientSecret = process.env.LINEAR_CLIENT_SECRET || '83b45be6c9a27ad2025142bad65e5ceb';
  private redirectUri = process.env.LINEAR_REDIRECT_URI || 'http://localhost:5001/api/integrations/linear/callback';

  // State maps could be stored in Redis/DB for production, using in-memory for simple implementation
  private static stateMap = new Map<string, { tenantId: string, userId: string, clientUrl: string }>();

  public getConnectUrl(tenantId: string, userId: string, clientUrl: string): string {
    const state = crypto.randomBytes(16).toString('hex');
    
    // Store the state with context
    LinearAuthService.stateMap.set(state, { tenantId, userId, clientUrl });
    
    // Clear state after 15 mins to prevent memory leaks
    setTimeout(() => {
      LinearAuthService.stateMap.delete(state);
    }, 15 * 60 * 1000);

    const url = new URL('https://linear.app/oauth/authorize');
    url.searchParams.append('client_id', this.clientId);
    url.searchParams.append('redirect_uri', this.redirectUri);
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('state', state);
    url.searchParams.append('scope', 'read,write'); // Standard scopes for Linear
    url.searchParams.append('prompt', 'consent');
    
    return url.toString();
  }

  public getClientUrlFromState(state: string): string | null {
    const context = LinearAuthService.stateMap.get(state);
    return context ? context.clientUrl : null;
  }

  public async handleCallback(code: string, state: string): Promise<{ success: boolean, clientUrl: string }> {
    const context = LinearAuthService.stateMap.get(state);
    if (!context) {
      throw new Error('Invalid or expired OAuth state');
    }
    
    const { tenantId, userId, clientUrl } = context;
    LinearAuthService.stateMap.delete(state); // Prevent replay attacks

    // Exchange code for token
    const tokenUrl = 'https://api.linear.app/oauth/token';
    const params = new URLSearchParams();
    params.append('client_id', this.clientId);
    params.append('client_secret', this.clientSecret);
    params.append('redirect_uri', this.redirectUri);
    params.append('code', code);
    params.append('grant_type', 'authorization_code');

    try {
      const response = await axios.post(tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      const { access_token } = response.data;
      if (!access_token) {
        throw new Error('No access token received from Linear');
      }

      await this.saveToken(tenantId, userId, access_token);
      return { success: true, clientUrl };
    } catch (error: any) {
      console.error('Linear OAuth token exchange error:', error.response?.data || error.message);
      throw new Error('Failed to exchange authorization code for Linear token');
    }
  }

  private async saveToken(tenantId: string, userId: string, token: string): Promise<void> {
    const query = `
      INSERT INTO linear_integrations (tenant_id, user_id, access_token, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (tenant_id, user_id) 
      DO UPDATE SET access_token = $3, updated_at = NOW()
    `;
    
    await pool.query(query, [tenantId, userId, token]);
  }

  public async getStatus(tenantId: string, userId: string): Promise<string | null> {
    const query = `
      SELECT id FROM linear_integrations 
      WHERE tenant_id = $1 AND user_id = $2
      LIMIT 1
    `;
    const result = await pool.query(query, [tenantId, userId]);
    return result.rows.length > 0 ? result.rows[0].id : null;
  }

  public async getToken(tenantId: string, userId: string): Promise<string | null> {
    const query = `
      SELECT access_token FROM linear_integrations 
      WHERE tenant_id = $1 AND user_id = $2
      LIMIT 1
    `;
    const result = await pool.query(query, [tenantId, userId]);
    if (result.rows.length > 0) {
      return result.rows[0].access_token;
    }
    return null;
  }

  public async disconnect(tenantId: string, userId: string): Promise<void> {
    const query = `
      DELETE FROM linear_integrations 
      WHERE tenant_id = $1 AND user_id = $2
    `;
    await pool.query(query, [tenantId, userId]);
  }
}
