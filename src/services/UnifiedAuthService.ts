import { prisma } from "@/config/database";
import { CalendarProvider, mail_provider } from "@prisma/client";
import { CalendarProviderFactory } from "./calendar/CalendarProviderFactory";
import axios from "axios";

export class UnifiedAuthService {
    /**
     * Get combined OAuth URL for both Calendar and Mail
     */
    static getAuthUrl(provider: CalendarProvider, userId: string): string {
        const calendarProvider = CalendarProviderFactory.getProvider(provider);
        const originalUrl = calendarProvider.getAuthUrl(userId);
        const url = new URL(originalUrl);

        // Add Mail scopes to the existing ones
        let scopes = url.searchParams.get("scope") || "";

        switch (provider) {
            case CalendarProvider.GOOGLE:
                const googleMailScopes = [
                    "https://www.googleapis.com/auth/gmail.readonly",
                    "https://www.googleapis.com/auth/gmail.send",
                    "https://www.googleapis.com/auth/gmail.modify",
                    "https://www.googleapis.com/auth/userinfo.email",
                    "https://www.googleapis.com/auth/userinfo.profile",
                    "openid"
                ];
                googleMailScopes.forEach(s => {
                    if (!scopes.includes(s)) scopes += " " + s;
                });
                break;

            case CalendarProvider.MICROSOFT:
                const msMailScopes = [
                    "Mail.ReadWrite",
                    "Mail.Send",
                    "User.Read",
                    "offline_access"
                ];
                msMailScopes.forEach(s => {
                    if (!scopes.includes(s)) scopes += " " + s;
                });
                break;

            case CalendarProvider.ZOHO:
                const zohoMailScopes = [
                    "ZohoMail.messages.ALL",
                    "ZohoMail.accounts.READ",
                    "ZohoMail.folders.READ"
                ];
                // Zoho scopes must be comma-separated
                zohoMailScopes.forEach(s => {
                    if (!scopes.includes(s)) scopes += (scopes ? "," : "") + s;
                });
                break;
        }

        url.searchParams.set("scope", scopes);
        return url.toString();
    }

    /**
     * Handle OAuth callback, saving tokens to CalendarIntegration and linking MailAccount
     */
    static async handleCallback(provider: CalendarProvider, code: string, state: string, userId: string, tenantId: string): Promise<any> {
        const calProvider = CalendarProviderFactory.getProvider(provider);
        const authResult = await calProvider.handleCallback(code, state);

        // 1. Get user email for MailAccount identification
        const email = await this.getUserEmail(provider, authResult.accessToken);

        // 2. Deactivate all other mail accounts for this user/tenant before connecting the new one
        await prisma.mail_accounts.updateMany({
            where: {
                user_id: userId,
                tenant_id: tenantId,
                is_active: true
            },
            data: { is_active: false }
        });

        // 3. Create/Update mail_accounts (with NULL tokens)
        const mailAccount = await prisma.mail_accounts.upsert({
            where: {
                provider_email_tenant_id: {
                    provider: provider as unknown as mail_provider,
                    email: email,
                    tenant_id: tenantId
                }
            },
            update: {
                user_id: userId,
                is_active: true,
                access_token: null,
                refresh_token: null,
                expires_at: null,
                use_shared_tokens: true,
                sync_cursor: null
            },
            create: {
                id: `mail_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                provider: provider as unknown as mail_provider,
                email: email,
                user_id: userId,
                tenant_id: tenantId,
                is_active: true,
                use_shared_tokens: true
            }
        });

        // 3. Upsert CalendarIntegration (Source of Truth for tokens)
        await prisma.calendarIntegration.upsert({
            where: {
                userId_provider: {
                    userId,
                    provider
                }
            },
            update: {
                accessToken: authResult.accessToken,
                refreshToken: authResult.refreshToken || undefined, // Keep existing if not returned
                tokenExpiry: new Date(Date.now() + authResult.expiresIn * 1000),
                calendarId: authResult.calendarId,
                mail_account_id: mailAccount.id,
                lastSyncStatus: 'SUCCESS',
            },
            create: {
                id: `cal_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                userId,
                tenantId,
                provider,
                accessToken: authResult.accessToken,
                refreshToken: authResult.refreshToken,
                tokenExpiry: new Date(Date.now() + authResult.expiresIn * 1000),
                calendarId: authResult.calendarId,
                mail_account_id: mailAccount.id,
            }
        });

        return mailAccount;
    }

    /**
     * Get validated access token from the shared source (CalendarIntegration)
     */
    static async getValidAccessToken(userId: string, provider: CalendarProvider): Promise<string> {
        // Normalizing provider: UI might send mail provider which equals calendar provider value
        const normalizedProvider = provider.toString().toUpperCase() as CalendarProvider;

        const integration = await prisma.calendarIntegration.findUnique({
            where: { userId_provider: { userId, provider: normalizedProvider } }
        });

        if (!integration || !integration.accessToken) {
            throw new Error("No integration found");
        }

        // Check if token is expired (with 1 min buffer)
        const isExpired = integration.tokenExpiry && (new Date(integration.tokenExpiry).getTime() - Date.now() < 60000);

        if (isExpired && integration.refreshToken) {
            console.log(`[UnifiedAuthService] Refreshing token for ${provider} (User: ${userId})`);
            const calProvider = CalendarProviderFactory.getProvider(provider);
            const refreshResult = await calProvider.refreshToken(integration.refreshToken);

            await prisma.calendarIntegration.update({
                where: { id: integration.id },
                data: {
                    accessToken: refreshResult.accessToken,
                    tokenExpiry: new Date(Date.now() + refreshResult.expiresIn * 1000)
                }
            });

            return refreshResult.accessToken;
        }

        return integration.accessToken;
    }

    private static async getUserEmail(provider: CalendarProvider, accessToken: string): Promise<string> {
        try {
            switch (provider) {
                case CalendarProvider.GOOGLE:
                    const gRes = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    return gRes.data.email;

                case CalendarProvider.MICROSOFT:
                    const msRes = await axios.get("https://graph.microsoft.com/v1.0/me", {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    return msRes.data.mail || msRes.data.userPrincipalName;

                case CalendarProvider.ZOHO:
                    // Zoho Mail specific: get account email
                    console.log(`[UnifiedAuthService] Fetching Zoho email with token: ${accessToken.substring(0, 10)}...`);
                    const zRes = await axios.get("https://mail.zoho.in/api/accounts", {
                        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                    });
                    console.log(`[UnifiedAuthService] Zoho accounts response:`, JSON.stringify(zRes.data));

                    if (zRes.data && zRes.data.data && zRes.data.data.length > 0) {
                        const account = zRes.data.data[0];
                        return account.mailboxAddress || account.primaryEmailAddress || account.incomingUserName;
                    }
                    throw new Error("No Zoho mail accounts found for this token");

                default:
                    throw new Error("Unsupported provider for email retrieval");
            }
        } catch (error) {
            console.error(`[UnifiedAuthService] Failed to get email for ${provider}:`, error.message);
            throw new Error(`Failed to identify user account: ${error.message}`);
        }
    }
}
