import axios from "axios";
import pool from "@/config/dbpool";
import { v4 as uuidv4 } from "uuid";

export class NotionAuthService {
    /**
     * Ensure the raw Notion integrations table exists.
     * This is called lazily to ensure the table is available.
     */
    static async ensureTableExists(): Promise<void> {
        const query = `
            CREATE TABLE IF NOT EXISTS notion_integrations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                user_id UUID NOT NULL,
                access_token TEXT NOT NULL,
                workspace_name TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(tenant_id, user_id)
            );
        `;
        await pool.query(query);
    }

    /**
     * Get Notion OAuth URL
     */
    static getAuthUrl(state: string): string {
        const clientId = process.env.NOTION_CLIENT_ID;
        const redirectUri = process.env.NOTION_REDIRECT_URI;
        
        if (!clientId || !redirectUri) {
            throw new Error("Missing Notion OAuth environment variables");
        }

        const url = new URL("https://api.notion.com/v1/oauth/authorize");
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("owner", "user");
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("state", state);

        return url.toString();
    }

    /**
     * Handle OAuth callback and save token via raw query
     */
    static async handleCallback(code: string, state: string, userId: string, tenantId: string): Promise<any> {
        await this.ensureTableExists();

        const clientId = process.env.NOTION_CLIENT_ID;
        const clientSecret = process.env.NOTION_CLIENT_SECRET;
        const redirectUri = process.env.NOTION_REDIRECT_URI;

        if (!clientId || !clientSecret || !redirectUri) {
            throw new Error("Missing Notion OAuth environment variables");
        }

        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

        const response = await axios.post("https://api.notion.com/v1/oauth/token", {
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri
        }, {
            headers: {
                "Authorization": `Basic ${credentials}`,
                "Content-Type": "application/json"
            }
        });

        const { access_token, workspace_name } = response.data;

        const query = `
            INSERT INTO notion_integrations (tenant_id, user_id, access_token, workspace_name, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            ON CONFLICT (tenant_id, user_id) 
            DO UPDATE SET 
                access_token = EXCLUDED.access_token,
                workspace_name = EXCLUDED.workspace_name,
                updated_at = NOW();
        `;
        
        await pool.query(query, [tenantId, userId, access_token, workspace_name]);

        return response.data;
    }

    /**
     * Retrieve a valid access token for a user
     */
    static async getValidAccessToken(userId: string, tenantId: string): Promise<string> {
        await this.ensureTableExists();

        const query = `
            SELECT access_token FROM notion_integrations 
            WHERE user_id = $1 AND tenant_id = $2
        `;
        
        const result = await pool.query(query, [userId, tenantId]);
        
        if (result.rows.length === 0) {
            throw new Error("Notion is not connected. Please connect your Notion account.");
        }

        return result.rows[0].access_token;
    }
}
