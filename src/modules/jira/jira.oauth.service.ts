import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class JiraOAuthService {
  private readonly clientId = process.env.JIRA_CLIENT_ID!;
  private readonly clientSecret = process.env.JIRA_CLIENT_SECRET!;
  private readonly callbackUrl = process.env.JIRA_CALLBACK_URL!;

  public getAuthorizationUrl(tenantId: string, userId: string, returnUrl?: string): string {
    const scopes = ["read:jira-work", "read:jira-user", "read:board-scope:jira-software", "read:sprint:jira-software", "read:project:jira", "offline_access"];
    const stateObj: any = { tenantId, userId };
    if (returnUrl) {
      stateObj.returnUrl = returnUrl;
    }
    const state = JSON.stringify(stateObj);

    return `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${this.clientId}&scope=${scopes.join("%20")}&redirect_uri=${encodeURIComponent(
      this.callbackUrl
    )}&state=${encodeURIComponent(state)}&response_type=code&prompt=consent`;
  }

  public async exchangeCodeForToken(code: string, tenantId: string, userId: string) {
    const tokenUrl = "https://auth.atlassian.com/oauth/token";

    const response = await axios.post(tokenUrl, {
      grant_type: "authorization_code",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.callbackUrl,
    });

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // TODO: Encrypt tokens before storing
    const encryptedAccessToken = access_token; 
    const encryptedRefreshToken = refresh_token;

    // We are using raw query as per the requirement
    await prisma.$executeRaw`
      DELETE FROM "jira_integrations" WHERE "tenant_id" = ${tenantId}::uuid AND "user_id" = ${userId}::uuid;
    `;
    await prisma.$executeRaw`
      INSERT INTO "jira_integrations" (
        "tenant_id", "user_id", "access_token_encrypted", "refresh_token_encrypted", "expires_at", "status"
      ) VALUES (
        ${tenantId}::uuid, ${userId}::uuid, ${encryptedAccessToken}, ${encryptedRefreshToken}, ${expiresAt}, 'CONNECTED'
      );
    `;

    return response.data;
  }

  public async getAccessToken(integrationId: string) {
    const integrations = await prisma.$queryRaw<Array<{ access_token_encrypted: string, refresh_token_encrypted: string, cloud_id: string, expires_at: Date }>>`
      SELECT access_token_encrypted, refresh_token_encrypted, cloud_id, expires_at FROM "jira_integrations" WHERE id = ${integrationId}::uuid
    `;
    if (!integrations.length) throw new Error("Integration not found");
    return this.ensureValidToken(integrationId, integrations[0]);
  }

  public async getAccessTokenByTenantId(tenantId: string, userId: string) {
    const integrations = await prisma.$queryRaw<Array<{ id: string, access_token_encrypted: string, refresh_token_encrypted: string, cloud_id: string, expires_at: Date }>>`
      SELECT id, access_token_encrypted, refresh_token_encrypted, cloud_id, expires_at FROM "jira_integrations" WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}::uuid LIMIT 1
    `;
    if (!integrations.length) throw new Error("Integration not found");
    return this.ensureValidToken(integrations[0].id, integrations[0]);
  }

  private async ensureValidToken(integrationId: string, integration: any) {
    // If expires_at is not set or in the past, refresh it
    if (!integration.expires_at || new Date() >= new Date(integration.expires_at)) {
      const tokenUrl = "https://auth.atlassian.com/oauth/token";
      const response = await axios.post(tokenUrl, {
        grant_type: "refresh_token",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: integration.refresh_token_encrypted,
      });

      const { access_token, refresh_token, expires_in } = response.data;
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      await prisma.$executeRaw`
        UPDATE "jira_integrations" SET
          "access_token_encrypted" = ${access_token},
          "refresh_token_encrypted" = ${refresh_token},
          "expires_at" = ${expiresAt}
        WHERE "id" = ${integrationId}::uuid
      `;
      return { accessToken: access_token, cloudId: integration.cloud_id };
    }

    return { accessToken: integration.access_token_encrypted, cloudId: integration.cloud_id };
  }
}
