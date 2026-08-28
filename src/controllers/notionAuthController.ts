import { Request, Response } from "express";
import { NotionAuthService } from "@/services/NotionAuthService";
import { AuthRequest } from "@/types";
import crypto from "crypto";

function getAbsoluteReturnUrl(inputUrl: string | undefined, frontendUrl: string, subdomain?: string): string {
    let target = inputUrl || "/calendar";
    if (target.startsWith("http://") || target.startsWith("https://")) {
        return target;
    }
    try {
        const urlObj = new URL(frontendUrl);
        if (subdomain) {
            let host = urlObj.hostname;
            if (host.startsWith('www.')) {
                host = host.slice(4);
            }
            if (host === "localhost" || host === "127.0.0.1") {
                urlObj.hostname = `${subdomain}.localhost`;
            } else {
                if (host.startsWith(`${subdomain}.`)) {
                    urlObj.hostname = host;
                } else {
                    const parts = host.split('.');
                    if (parts.length >= 3) {
                        const rootDomain = parts.slice(1).join('.');
                        urlObj.hostname = `${subdomain}.${rootDomain}`;
                    } else {
                        urlObj.hostname = `${subdomain}.${host}`;
                    }
                }
            }
        }
        target = target.startsWith('/') ? target : `/${target}`;
        return `${urlObj.protocol}//${urlObj.host}${target}`;
    } catch (e) {
        target = target.startsWith('/') ? target : `/${target}`;
        return `${frontendUrl}${target}`;
    }
}

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export class NotionAuthController {
    /**
     * GET /api/v2/auth/notion/connect
     * Initiates the Notion OAuth flow.
     */
    static async connect(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { returnUrl = `${FRONTEND_URL}/calendar` } = req.query as Record<string, string>;

            // Encode and sign the multi-tenant state parameter
            const targetReturnUrl = getAbsoluteReturnUrl(returnUrl, FRONTEND_URL, req.tenant?.subdomain);
            const statePayload = JSON.stringify({
                tenantId: req.tenantId || req.user.tenantId,
                userId: req.user.id,
                returnUrl: targetReturnUrl
            });
            
            const secret = process.env.JWT_SECRET || "your-secret-key-change-in-production";
            const signature = crypto.createHmac("sha256", secret).update(statePayload).digest("hex");
            const state = Buffer.from(JSON.stringify({ payload: statePayload, signature })).toString("base64url");

            const authUrl = NotionAuthService.getAuthUrl(state);

            res.status(200).json({
                success: true,
                data: { authUrl },
            });
        } catch (error) {
            console.error("Notion connect error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to initiate Notion connection",
            });
        }
    }

    /**
     * GET /api/v2/auth/notion/status
     * Whether this user has a Notion connection in this tenant.
     */
    static async status(req: AuthRequest, res: Response): Promise<void> {
        try {
            const status = await NotionAuthService.getStatus(
                req.user.id,
                req.tenantId || req.user.tenantId
            );
            res.status(200).json({ success: true, data: status });
        } catch (error) {
            console.error("Notion status error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get Notion status",
            });
        }
    }

    /**
     * DELETE /api/v2/auth/notion/disconnect
     * Removes the stored Notion token for this user.
     */
    static async disconnect(req: AuthRequest, res: Response): Promise<void> {
        try {
            await NotionAuthService.disconnect(
                req.user.id,
                req.tenantId || req.user.tenantId
            );
            res.status(200).json({ success: true, data: { connected: false } });
        } catch (error) {
            console.error("Notion disconnect error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to disconnect Notion",
            });
        }
    }

    /**
     * GET /api/v2/auth/notion/callback
     * Handles the OAuth callback from Notion.
     */
    static async callback(req: Request, res: Response): Promise<void> {
        let returnUrl = `${FRONTEND_URL}/calendar`;
        try {
            const { code, state, error: oauthError } = req.query as Record<string, string>;

            if (state) {
                try {
                    const decodedStateStr = Buffer.from(state, "base64url").toString("utf8");
                    const decodedState = JSON.parse(decodedStateStr);
                    if (decodedState.payload) {
                        const payloadObj = JSON.parse(decodedState.payload);
                        returnUrl = payloadObj.returnUrl || returnUrl;
                    } else if (decodedState.returnUrl) {
                        returnUrl = decodedState.returnUrl;
                    }
                } catch (e: any) {
                    console.warn("[NotionAuthController] Early state decode failed:", e.message);
                }
            }

            if (oauthError) {
                console.error(`Notion OAuth error:`, oauthError);
                return res.redirect(`${returnUrl}?error=notion_denied`) as any;
            }

            if (!code || !state) {
                return res.redirect(`${returnUrl}?error=missing_params`) as any;
            }

            // Decode state parameter
            let tenantId: string = "";
            let userId: string = "";

            const decodedStateStr = Buffer.from(state, "base64url").toString("utf8");
            const decodedState = JSON.parse(decodedStateStr);

            if (decodedState.payload && decodedState.signature) {
                const secret = process.env.JWT_SECRET || "your-secret-key-change-in-production";
                const expectedSignature = crypto.createHmac("sha256", secret).update(decodedState.payload).digest("hex");
                if (decodedState.signature !== expectedSignature) {
                    throw new Error("Invalid state signature (tampered payload or CSRF attempt)");
                }
                const payloadObj = JSON.parse(decodedState.payload);
                tenantId = payloadObj.tenantId;
                userId = payloadObj.userId;
                returnUrl = payloadObj.returnUrl;
            } else {
                throw new Error("Unknown state payload structure");
            }

            await NotionAuthService.handleCallback(code, state, userId, tenantId);

            res.redirect(`${returnUrl}?success=true&provider=notion`);
        } catch (error) {
            console.error("Notion callback error:", error);
            res.redirect(`${returnUrl}?error=notion_callback_failed`);
        }
    }
}
