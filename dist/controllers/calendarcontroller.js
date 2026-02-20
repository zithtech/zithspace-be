"use strict";
// // controllers/calendarcontroller.ts
// import { Response } from 'express';
// import { prisma } from "@/config/database";
// import { 
//   AuthRequest as BaseAuthRequest, 
//   ApiResponse, 
//   NotFoundError, 
//   ValidationError 
// } from '@/types';
// import axios from 'axios';
// import { Session } from 'express-session'; 
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarController = void 0;
const database_1 = require("@/config/database");
const axios_1 = __importDefault(require("axios"));
class CalendarController {
    /**
     * Connect to Zoho - Redirect user to Zoho login page
     * GET /api/zoho/connect
     */
    // static async connect(req: AuthRequest, res: Response): Promise<void> {
    //   try {
    //     console.log("=== CONNECT STARTED ===");
    //     console.log("User:", req.user);
    //     console.log("Session:", req.sessionID);
    //     const client_id = process.env.ZOHO_CLIENT_ID as string;
    //     const redirect_uri = process.env.ZOHO_REDIRECT_URI as string;
    //     const scope = 'ZohoCalendar.calendar.ALL';
    //     // Generate random state
    //     const state = Math.random().toString(36).substring(7);
    //     // Save state in session (with or without user)
    //     const stateData: any = {
    //       state,
    //     };
    //     // If user is logged in, save their ID
    //     if (req.user?.id) {
    //       stateData.userId = req.user.id;
    //       stateData.tenantId = req.tenantId;
    //       console.log("User is logged in:", req.user.id);
    //     } else {
    //       console.log("No user logged in - will associate after login");
    //     }
    //     req.session.zohoState = JSON.stringify(stateData);
    //     // Save session explicitly
    //     req.session.save((err) => {
    //       if (err) {
    //         console.error("Error saving session:", err);
    //       } else {
    //         console.log("Session saved with state");
    //       }
    //     });
    //     // Use the correct accounts URL based on your region
    //     const accountsUrl = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in';
    //     const authUrl = new URL(`${accountsUrl}/oauth/v2/auth`);
    //     authUrl.searchParams.append('client_id', client_id);
    //     authUrl.searchParams.append('redirect_uri', redirect_uri);
    //     authUrl.searchParams.append('scope', scope);
    //     authUrl.searchParams.append('response_type', 'code');
    //     authUrl.searchParams.append('access_type', 'offline');
    //     authUrl.searchParams.append('state', state);
    //     authUrl.searchParams.append('prompt', 'consent');
    //     console.log("Redirecting to Zoho");
    //     res.redirect(authUrl.toString());
    //   } catch (error) {
    //     console.error('Connect error:', error);
    //     res.status(500).json({ error: 'Failed to initiate Zoho connection' });
    //   }
    // }
    /**
     * Connect to Zoho - Redirect user to Zoho login page
     * GET /api/zoho/connect
     */
    // static async connect(req: AuthRequest, res: Response): Promise<void> {
    //   try {
    //     console.log("=== CONNECT STARTED ===");
    //     console.log("User:", req.user);
    //     console.log("Session:", req.sessionID);
    //     const client_id = process.env.ZOHO_CLIENT_ID as string;
    //     const redirect_uri = process.env.ZOHO_REDIRECT_URI as string;
    //     /**
    //      * FIXED SCOPE:
    //      * Added 'ZohoCalendar.event.ALL' to allow creating/editing events.
    //      * 'ZohoCalendar.calendar.ALL' alone is often insufficient for 'POST' requests.
    //      */
    //     const scope = 'ZohoCalendar.calendar.ALL,ZohoCalendar.event.ALL';
    //     // Generate random state
    //     const state = Math.random().toString(36).substring(7);
    //     // Save state in session (with or without user)
    //     const stateData: any = {
    //       state,
    //     };
    //     // If user is logged in, save their ID
    //     if (req.user?.id) {
    //       stateData.userId = req.user.id;
    //       stateData.tenantId = req.tenantId;
    //       console.log("User is logged in:", req.user.id);
    //     } else {
    //       console.log("No user logged in - will associate after login");
    //     }
    //     req.session.zohoState = JSON.stringify(stateData);
    //     // Save session explicitly
    //     req.session.save((err) => {
    //       if (err) {
    //         console.error("Error saving session:", err);
    //       } else {
    //         console.log("Session saved with state");
    //       }
    //     });
    //     // Use the correct accounts URL based on your region
    //     const accountsUrl = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in';
    //     const authUrl = new URL(`${accountsUrl}/oauth/v2/auth`);
    //     authUrl.searchParams.append('client_id', client_id);
    //     authUrl.searchParams.append('redirect_uri', redirect_uri);
    //     authUrl.searchParams.append('scope', scope); // Updated scope is applied here
    //     authUrl.searchParams.append('response_type', 'code');
    //     authUrl.searchParams.append('access_type', 'offline');
    //     authUrl.searchParams.append('state', state);
    //     /**
    //      * CRITICAL: prompt=consent forces Zoho to show the permissions screen again.
    //      * This ensures the user "Accepts" the new 'event.ALL' scope.
    //      */
    //     authUrl.searchParams.append('prompt', 'consent');
    //     console.log("Redirecting to Zoho with full scopes:", scope);
    //     res.redirect(authUrl.toString());
    //   } catch (error) {
    //     console.error('Connect error:', error);
    //     res.status(500).json({ error: 'Failed to initiate Zoho connection' });
    //   }
    // }
    static async connect(req, res) {
        try {
            console.log("=== ZOHO CONNECT STARTED ===");
            const clientId = process.env.ZOHO_CLIENT_ID;
            const redirectUri = process.env.ZOHO_REDIRECT_URI;
            if (!clientId || !redirectUri) {
                res.status(500).json({ error: "Zoho OAuth config missing" });
                return;
            }
            // ✅ Required scopes for full calendar + event access
            const scope = "ZohoCalendar.calendar.ALL,ZohoCalendar.event.ALL";
            // ✅ Generate secure random state
            const state = Math.random().toString(36).substring(2);
            // Save state + user info in session
            // const stateData = {
            //   state,
            //   userId: req.user?.id || null,
            //   tenantId: req.tenantId || null,
            // };
            if (!req.user?.id) {
                res.status(401).json({
                    success: false,
                    message: "User must be logged in before connecting Zoho",
                });
                return; // ← this keeps function return type as void
            }
            const stateData = {
                state,
                userId: req.user.id, // 🔥 now guaranteed
                tenantId: req.tenantId || null,
            };
            req.session.zohoState = JSON.stringify(stateData);
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
            // ✅ Use correct region
            // If your Zoho account is India → accounts.zoho.in
            // If global → accounts.zoho.com
            const accountsUrl = process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in";
            const authUrl = new URL(`${accountsUrl}/oauth/v2/auth`);
            authUrl.searchParams.append("client_id", clientId);
            authUrl.searchParams.append("redirect_uri", redirectUri);
            authUrl.searchParams.append("response_type", "code");
            authUrl.searchParams.append("access_type", "offline");
            authUrl.searchParams.append("scope", scope);
            authUrl.searchParams.append("state", state);
            // 🔥 IMPORTANT: forces permission screen again
            authUrl.searchParams.append("prompt", "consent");
            console.log("Redirecting to Zoho OAuth:", authUrl.toString());
            // res.redirect(authUrl.toString());
            res.json({
                success: true,
                url: authUrl.toString(),
            });
        }
        catch (error) {
            console.error("Zoho Connect Error:", error);
            res.status(500).json({
                success: false,
                message: "Failed to initiate Zoho connection",
            });
        }
    }
    /**
     * Handle OAuth callback from Zoho
     * GET /api/zoho/callback
     */
    //   static async callback(req: AuthRequest, res: Response): Promise<void> {
    //     console.log("\n=== 🔵 CALLBACK STARTED ===");
    //     console.log("Timestamp:", new Date().toISOString());
    //     console.log("Session ID:", req.sessionID);
    //     console.log("Full URL:", req.protocol + '://' + req.get('host') + req.originalUrl);
    //     console.log("Query params:", req.query);
    //     try {
    //       const { code, state, error, error_description } = req.query;
    //       // Check if Zoho returned an error
    //       if (error) {
    //         console.error("❌ Zoho returned error:", error);
    //         console.error("Error description:", error_description);
    //         const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3005';
    //         return res.redirect(`${frontendUrl}/calendar?zoho=error&message=zoho_error_${error}`);
    //       }
    //       console.log("Code received:", code ? `${code.toString().substring(0, 30)}...` : 'MISSING');
    //       console.log("State received:", state);
    //       // Get stored state from session
    //       console.log("Checking session for stored state...");
    //       console.log("Session exists:", !!req.session);
    //       const storedStateData = (req.session as any)?.zohoState ? 
    //         JSON.parse((req.session as any).zohoState) : null;
    //       console.log("Stored state data:", storedStateData);
    //       // Verify state
    //       if (!storedStateData) {
    //         console.error("❌ No stored state found in session");
    //         const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3005';
    //         return res.redirect(`${frontendUrl}/calendar?zoho=error&message=no_stored_state`);
    //       }
    //       if (state !== storedStateData.state) {
    //         console.error("❌ State mismatch!");
    //         console.error("  Received state:", state);
    //         console.error("  Expected state:", storedStateData.state);
    //         const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3005';
    //         return res.redirect(`${frontendUrl}/calendar?zoho=error&message=state_mismatch`);
    //       }
    //       console.log("✅ State verification passed");
    //       if (!code) {
    //         console.error("❌ No code provided");
    //         const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3005';
    //         return res.redirect(`${frontendUrl}/calendar?zoho=error&message=no_code`);
    //       }
    //       // ========== TOKEN EXCHANGE ==========
    //       console.log("\n=== 🔄 EXCHANGING CODE FOR TOKENS ===");
    //       // Determine Zoho region from the request or use environment
    //       const accountsServer = req.query['accounts-server'] || process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in';
    //       console.log("Accounts server:", accountsServer);
    //       const tokenUrl = `${accountsServer}/oauth/v2/token`;
    //       console.log("Token URL:", tokenUrl);
    //       console.log("Client ID:", process.env.ZOHO_CLIENT_ID ? `${process.env.ZOHO_CLIENT_ID.substring(0, 10)}...` : 'MISSING');
    //       console.log("Client Secret length:", process.env.ZOHO_CLIENT_SECRET?.length || 0);
    //       console.log("Redirect URI:", process.env.ZOHO_REDIRECT_URI);
    //       console.log("Grant type: authorization_code");
    //       try {
    //         // Make the token request
    //         const tokenResponse = await axios({
    //           method: 'post',
    //           url: tokenUrl,
    //           params: {
    //             code: code as string,
    //             client_id: process.env.ZOHO_CLIENT_ID,
    //             client_secret: process.env.ZOHO_CLIENT_SECRET,
    //             redirect_uri: process.env.ZOHO_REDIRECT_URI,
    //             grant_type: 'authorization_code'
    //           },
    //           headers: {
    //             'Content-Type': 'application/x-www-form-urlencoded',
    //             'Accept': 'application/json'
    //           },
    //           timeout: 10000 // 10 second timeout
    //         });
    //         console.log("✅ Token request successful");
    //         console.log("Response status:", tokenResponse.status);
    //         console.log("Response data:", tokenResponse.data);
    //         const tokens = tokenResponse.data;
    //         // Check if we got valid tokens
    //         if (!tokens.access_token) {
    //           console.error("❌ No access_token in response!");
    //           console.error("Full response:", tokens);
    //           const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3005';
    //           return res.redirect(`${frontendUrl}/calendar?zoho=error&message=no_access_token`);
    //         }
    //         console.log("✅ Access token received:", tokens.access_token.substring(0, 30) + '...');
    //         console.log("✅ Refresh token received:", tokens.refresh_token ? 'YES' : 'NO');
    //         console.log("✅ Expires in:", tokens.expires_in, "seconds");
    //         const expiresAt = new Date();
    //         expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);
    //         console.log("Token expiry:", expiresAt.toISOString());
    //         // ========== SAVE TOKENS ==========
    //         const userId = storedStateData.userId;
    //         if (userId) {
    //           // User was logged in - save tokens directly
    //           console.log("\n=== 💾 SAVING TOKENS TO USER ===");
    //           console.log("User ID:", userId);
    //           try {
    //             await prisma.user.update({
    //               where: { id: userId },
    //               data: {
    //                 zohoAccessToken: tokens.access_token,
    //                 zohoRefreshToken: tokens.refresh_token,
    //                 zohoTokenExpiry: expiresAt
    //               }
    //             });
    //             console.log("✅ Tokens saved to user in database");
    //             // Get and save default calendar
    //             try {
    //               console.log("\n=== 📅 FETCHING DEFAULT CALENDAR ===");
    //               const calendarApiUrl = process.env.ZOHO_API_URL || 'https://calendar.zoho.in/api/v1';
    //               console.log("Calendar API URL:", calendarApiUrl);
    //               const calendarsResponse = await axios.get(
    //                 `${calendarApiUrl}/calendars`,
    //                 {
    //                   headers: {
    //   'Authorization': `Zoho-oauthtoken ${tokens.access_token}`
    // }
    //                 }
    //               );
    //               console.log("Calendars response status:", calendarsResponse.status);
    //               console.log("Number of calendars:", calendarsResponse.data.calendars?.length || 0);
    //               if (calendarsResponse.data.calendars && calendarsResponse.data.calendars.length > 0) {
    //                 const defaultCalendar = calendarsResponse.data.calendars[0];
    //                 console.log("Default calendar:", defaultCalendar);
    //                 await prisma.user.update({
    //                   where: { id: userId },
    //                   data: { 
    //                     zohoCalendarId: defaultCalendar.id 
    //                   }
    //                 });
    //                 console.log("✅ Default calendar saved to user");
    //               }
    //             } catch (calError: any) {
    //               console.error("❌ Failed to sync default calendar:", calError.message);
    //               // Continue even if calendar sync fails
    //             }
    //           } catch (dbError: any) {
    //             console.error("❌ Failed to save tokens to database:", dbError.message);
    //             const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3005';
    //             return res.redirect(`${frontendUrl}/calendar?zoho=error&message=db_save_failed`);
    //           }
    //         } else {
    //           // No user logged in - store tokens in session for later association
    //           console.log("\n=== 📦 STORING TOKENS IN SESSION ===");
    //           (req.session as any).zohoTokens = {
    //             accessToken: tokens.access_token,
    //             refreshToken: tokens.refresh_token,
    //             expiry: expiresAt
    //           };
    //           console.log("✅ Tokens stored in session");
    //         }
    //         // Clear state from session
    //         (req.session as any).zohoState = null;
    //         console.log("✅ Cleared state from session");
    //         // Save session
    //         req.session.save((err) => {
    //           if (err) {
    //             console.error("❌ Error saving session:", err);
    //           } else {
    //             console.log("✅ Session saved successfully");
    //           }
    //         });
    //         console.log("\n=== ✅ CALLBACK COMPLETED SUCCESSFULLY ===");
    //         const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3005';
    //         console.log("Redirecting to:", `${frontendUrl}/calendar?zoho=connected`);
    //         res.redirect(`${frontendUrl}/calendar?zoho=connected`);
    //       } catch (tokenError: any) {
    //         console.error("\n=== ❌ TOKEN EXCHANGE ERROR ===");
    //         console.error("Error message:", tokenError.message);
    //         if (tokenError.response) {
    //           console.error("Response status:", tokenError.response.status);
    //           console.error("Response data:", tokenError.response.data);
    //         }
    //         const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3005';
    //         const errorMessage = tokenError.response?.data?.error || 'token_exchange_failed';
    //         res.redirect(`${frontendUrl}/calendar?zoho=error&message=${errorMessage}`);
    //       }
    //     } catch (error: any) {
    //       console.error("\n=== ❌ UNHANDLED CALLBACK ERROR ===");
    //       console.error("Error:", error);
    //       const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3005';
    //       res.redirect(`${frontendUrl}/calendar?zoho=error&message=unexpected_error`);
    //     }
    //   }
    static async callback(req, res) {
        console.log("\n=== 🔵 ZOHO CALLBACK STARTED ===");
        try {
            const { code, state, error } = req.query;
            const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3005";
            // =========================
            // 1️⃣ Handle Zoho Error
            // =========================
            if (error) {
                console.error("Zoho returned error:", error);
                return res.redirect(`${frontendUrl}/calendar?zoho=error&message=${error}`);
            }
            if (!code) {
                console.error("No authorization code received");
                return res.redirect(`${frontendUrl}/calendar?zoho=error&message=no_code`);
            }
            // =========================
            // 2️⃣ Verify State
            // =========================
            const storedStateData = req.session?.zohoState
                ? JSON.parse(req.session.zohoState)
                : null;
            if (!storedStateData || state !== storedStateData.state) {
                console.error("State verification failed");
                return res.redirect(`${frontendUrl}/calendar?zoho=error&message=state_mismatch`);
            }
            const userId = storedStateData.userId;
            // =========================
            // 3️⃣ Exchange Code for Tokens
            // =========================
            const accountsServer = process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in";
            const tokenUrl = `${accountsServer}/oauth/v2/token`;
            const tokenResponse = await axios_1.default.post(tokenUrl, null, {
                params: {
                    grant_type: "authorization_code",
                    client_id: process.env.ZOHO_CLIENT_ID,
                    client_secret: process.env.ZOHO_CLIENT_SECRET,
                    redirect_uri: process.env.ZOHO_REDIRECT_URI,
                    code: code,
                },
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            });
            const tokens = tokenResponse.data;
            if (!tokens.access_token) {
                console.error("No access token received");
                return res.redirect(`${frontendUrl}/calendar?zoho=error&message=no_access_token`);
            }
            const expiry = new Date(Date.now() + tokens.expires_in * 1000);
            // =========================
            // 4️⃣ Save Tokens to DB
            // =========================
            await database_1.prisma.user.update({
                where: { id: userId },
                data: {
                    zohoAccessToken: tokens.access_token,
                    zohoRefreshToken: tokens.refresh_token,
                    zohoTokenExpiry: expiry,
                },
            });
            console.log("✅ Tokens saved successfully");
            // =========================
            // 5️⃣ Fetch Primary Calendar
            // =========================
            const calendarApiUrl = process.env.ZOHO_API_URL || "https://calendar.zoho.in/api/v1";
            const calendarsResponse = await axios_1.default.get(`${calendarApiUrl}/calendars`, {
                headers: {
                    Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
                },
            });
            const calendars = calendarsResponse.data.calendars;
            if (!calendars || calendars.length === 0) {
                console.error("No calendars found");
                return res.redirect(`${frontendUrl}/calendar?zoho=error&message=no_calendars`);
            }
            // 🔥 IMPORTANT FIX
            const primaryCalendar = calendars.find((cal) => cal.isPrimary) || calendars[0];
            console.log("Primary calendar ID:", primaryCalendar.id);
            await database_1.prisma.user.update({
                where: { id: userId },
                data: {
                    zohoCalendarId: primaryCalendar.id,
                },
            });
            console.log("✅ Primary calendar saved");
            // =========================
            // 6️⃣ Cleanup Session
            // =========================
            req.session.zohoState = null;
            req.session.save(() => {
                console.log("Session saved");
            });
            console.log("=== ✅ ZOHO CONNECTED SUCCESSFULLY ===");
            return res.redirect(`${frontendUrl}/calendar?zoho=connected`);
        }
        catch (error) {
            console.error("Callback error:", error?.response?.data || error.message);
            const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3005";
            return res.redirect(`${frontendUrl}/calendar?zoho=error&message=unexpected_error`);
        }
    }
    /**
     * Helper: Refresh user token
     */
    static async refreshUserToken(userId, refreshToken) {
        console.log("🔄 Refreshing token for user:", userId);
        try {
            const accountsUrl = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in';
            const refreshResponse = await axios_1.default.post(`${accountsUrl}/oauth/v2/token`, null, {
                params: {
                    refresh_token: refreshToken,
                    client_id: process.env.ZOHO_CLIENT_ID,
                    client_secret: process.env.ZOHO_CLIENT_SECRET,
                    grant_type: 'refresh_token'
                }
            });
            console.log("✅ Refresh response received");
            const newToken = refreshResponse.data.access_token;
            const expiresAt = new Date();
            expiresAt.setSeconds(expiresAt.getSeconds() + refreshResponse.data.expires_in);
            await database_1.prisma.user.update({
                where: { id: userId },
                data: {
                    zohoAccessToken: newToken,
                    zohoTokenExpiry: expiresAt
                }
            });
            console.log("✅ Token refreshed and saved to database");
            return newToken;
        }
        catch (error) {
            console.error("❌ Token refresh failed:", error.message);
            throw new Error('Failed to refresh token');
        }
    }
    /**
     * Helper: Get valid token (automatically refreshes if expired)
     */
    static async getValidToken(userId, session) {
        console.log("🔍 Getting valid token for user:", userId);
        // First check database
        const user = await database_1.prisma.user.findUnique({
            where: { id: userId }
        });
        // If user has tokens in DB, use them
        if (user?.zohoRefreshToken) {
            console.log("✅ Found tokens in database");
            const now = new Date();
            const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60000);
            // Check if token needs refresh
            if (!user.zohoTokenExpiry || user.zohoTokenExpiry < fiveMinutesFromNow) {
                console.log("🔄 Token expired or expiring soon, refreshing...");
                return await CalendarController.refreshUserToken(userId, user.zohoRefreshToken);
            }
            console.log("✅ Using existing access token");
            return user.zohoAccessToken;
        }
        // If no tokens in DB but session has tokens, save them first
        if (session?.zohoTokens) {
            console.log("📦 Found tokens in session, saving to user...");
            await database_1.prisma.user.update({
                where: { id: userId },
                data: {
                    zohoAccessToken: session.zohoTokens.accessToken,
                    zohoRefreshToken: session.zohoTokens.refreshToken,
                    zohoTokenExpiry: session.zohoTokens.expiry
                }
            });
            console.log("✅ Tokens saved to database");
            // Get and save default calendar
            try {
                const calendarApiUrl = process.env.ZOHO_API_URL || 'https://calendar.zoho.in/api/v1';
                const calendarsResponse = await axios_1.default.get(`${calendarApiUrl}/calendars`, {
                    headers: {
                        'Authorization': `Bearer ${session.zohoTokens.accessToken}`
                    }
                });
                if (calendarsResponse.data.calendars && calendarsResponse.data.calendars.length > 0) {
                    await database_1.prisma.user.update({
                        where: { id: userId },
                        data: {
                            zohoCalendarId: calendarsResponse.data.calendars[0].id
                        }
                    });
                    console.log("✅ Default calendar saved:", calendarsResponse.data.calendars[0].id);
                }
            }
            catch (calError) {
                console.error("❌ Failed to sync default calendar:", calError);
            }
            // Store the token before clearing session
            const accessToken = session.zohoTokens.accessToken;
            // Clear from session
            session.zohoTokens = null;
            return accessToken;
        }
        console.log("❌ No tokens found anywhere");
        throw new Error('Zoho not connected');
    }
    /**
     * Check Zoho connection status
     * GET /api/zoho/status
     */
    static async status(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(200).json({
                    success: true,
                    data: {
                        connected: false,
                        hasCalendar: false,
                        tokenExpiry: null,
                        calendarId: null
                    }
                });
                return;
            }
            const user = await database_1.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    zohoAccessToken: true,
                    zohoRefreshToken: true,
                    zohoTokenExpiry: true,
                    zohoCalendarId: true
                }
            });
            res.status(200).json({
                success: true,
                data: {
                    connected: !!user?.zohoRefreshToken,
                    hasCalendar: !!user?.zohoCalendarId,
                    tokenExpiry: user?.zohoTokenExpiry,
                    calendarId: user?.zohoCalendarId
                }
            });
        }
        catch (error) {
            console.error('Status error:', error);
            res.status(200).json({
                success: true,
                data: {
                    connected: false,
                    hasCalendar: false,
                    tokenExpiry: null,
                    calendarId: null
                }
            });
        }
    }
    /**
     * Get all calendars from Zoho
     * GET /api/zoho/calendars
     */
    static async getCalendars(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const accessToken = await CalendarController.getValidToken(req.user.id, req.session);
            const calendarApiUrl = process.env.ZOHO_API_URL || 'https://calendar.zoho.in/api/v1';
            const response = await axios_1.default.get(`${calendarApiUrl}/calendars`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            res.status(200).json({
                success: true,
                data: response.data.calendars
            });
        }
        catch (error) {
            console.error('Get calendars error:', error);
            if (error.message === 'Zoho not connected') {
                res.status(400).json({
                    success: false,
                    error: 'Zoho calendar not connected'
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to fetch calendars'
            });
        }
    }
    /**
     * Associate Zoho tokens with logged-in user
     * POST /api/zoho/associate
     */
    static async associateTokens(req, res) {
        try {
            if (!req.user || !req.user.id) {
                res.status(401).json({ success: false, error: 'User not authenticated' });
                return;
            }
            const sessionTokens = req.session?.zohoTokens;
            if (!sessionTokens) {
                res.status(400).json({
                    success: false,
                    error: 'No Zoho tokens found in session. Please complete Zoho login first.'
                });
                return;
            }
            console.log("📦 Associating tokens for user:", req.user.id);
            // Save tokens to user
            await database_1.prisma.user.update({
                where: { id: req.user.id },
                data: {
                    zohoAccessToken: sessionTokens.accessToken,
                    zohoRefreshToken: sessionTokens.refreshToken,
                    zohoTokenExpiry: sessionTokens.expiry
                }
            });
            // Get and save default calendar
            try {
                const calendarApiUrl = process.env.ZOHO_API_URL || 'https://calendar.zoho.in/api/v1';
                const calendarsResponse = await axios_1.default.get(`${calendarApiUrl}/calendars`, {
                    headers: {
                        'Authorization': `Bearer ${sessionTokens.accessToken}`
                    }
                });
                if (calendarsResponse.data.calendars && calendarsResponse.data.calendars.length > 0) {
                    await database_1.prisma.user.update({
                        where: { id: req.user.id },
                        data: {
                            zohoCalendarId: calendarsResponse.data.calendars[0].id
                        }
                    });
                    console.log("✅ Default calendar saved during association");
                }
            }
            catch (calError) {
                console.error("❌ Failed to sync default calendar during association:", calError);
            }
            // Clear from session
            req.session.zohoTokens = null;
            console.log("✅ Tokens associated successfully");
            res.status(200).json({
                success: true,
                message: 'Zoho account associated successfully'
            });
        }
        catch (error) {
            console.error('Associate tokens error:', error);
            res.status(500).json({ success: false, error: 'Failed to associate Zoho account' });
        }
    }
    /**
     * Get events from local database with pagination
     * GET /api/zoho/events
     */
    static async getEvents(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { page = 1, limit = 20, from, to, search, calendarId } = req.query;
            const pageNum = Number(page);
            const limitNum = Number(limit);
            // Build filter query
            const where = {
                userId: req.user.id,
            };
            if (calendarId) {
                where.calendarId = calendarId;
            }
            if (from || to) {
                where.startTime = {};
                if (from)
                    where.startTime.gte = new Date(from);
                if (to)
                    where.startTime.lte = new Date(to);
            }
            if (search) {
                where.OR = [
                    { title: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                    { location: { contains: search, mode: 'insensitive' } }
                ];
            }
            // Pagination
            const skip = (pageNum - 1) * limitNum;
            const [events, total] = await Promise.all([
                database_1.prisma.zohoEvent.findMany({
                    where,
                    orderBy: { startTime: 'asc' },
                    skip,
                    take: limitNum,
                }),
                database_1.prisma.zohoEvent.count({ where })
            ]);
            const totalPages = Math.ceil(total / limitNum);
            res.status(200).json({
                success: true,
                data: events,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    pages: totalPages,
                    hasNext: pageNum < totalPages,
                    hasPrev: pageNum > 1
                }
            });
        }
        catch (error) {
            console.error('Get events error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch events'
            });
        }
    }
    /**
     * Get single event by ID
     * GET /api/zoho/events/:id
     */
    static async getEventById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const event = await database_1.prisma.zohoEvent.findFirst({
                where: {
                    id,
                    userId: req.user.id
                }
            });
            if (!event) {
                res.status(404).json({
                    success: false,
                    error: 'Event not found'
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: event
            });
        }
        catch (error) {
            console.error('Get event by ID error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch event'
            });
        }
    }
    /**
     * Sync events from Zoho to local database
     * POST /api/zoho/events/sync
     */
    static async syncEvents(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { from, to, calendarId } = req.query;
            // Get user's calendar ID if not provided
            let targetCalendarId = calendarId;
            if (!targetCalendarId) {
                const user = await database_1.prisma.user.findUnique({
                    where: { id: req.user.id }
                });
                targetCalendarId = user?.zohoCalendarId;
            }
            if (!targetCalendarId) {
                res.status(400).json({
                    success: false,
                    error: 'No calendar ID provided or found'
                });
                return;
            }
            const accessToken = await CalendarController.getValidToken(req.user.id, req.session);
            // Build query parameters
            const params = {};
            if (from)
                params.from = from;
            if (to)
                params.to = to;
            const calendarApiUrl = process.env.ZOHO_API_URL || 'https://calendar.zoho.in/api/v1';
            const response = await axios_1.default.get(`${calendarApiUrl}/calendars/${targetCalendarId}/events`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                params
            });
            // Sync to local DB
            const events = response.data.events || [];
            let synced = 0;
            let failed = 0;
            for (const event of events) {
                try {
                    const uniqueId = `${event.event_id}_${req.user.id}`;
                    await database_1.prisma.zohoEvent.upsert({
                        where: {
                            eventId_userId: {
                                eventId: event.event_id,
                                userId: req.user.id
                            }
                        },
                        update: {
                            title: event.title,
                            description: event.description,
                            startTime: new Date(event.start_time),
                            endTime: new Date(event.end_time),
                            location: event.location,
                            updatedById: req.user.id,
                            updatedAt: new Date()
                        },
                        create: {
                            id: uniqueId,
                            eventId: event.event_id,
                            calendarId: targetCalendarId,
                            title: event.title,
                            description: event.description,
                            startTime: new Date(event.start_time),
                            endTime: new Date(event.end_time),
                            location: event.location,
                            userId: req.user.id,
                            updatedById: req.user.id
                        }
                    });
                    synced++;
                }
                catch (err) {
                    failed++;
                    console.error(`Failed to sync event ${event.event_id}:`, err);
                }
            }
            res.status(200).json({
                success: true,
                data: {
                    synced,
                    failed,
                    total: events.length,
                    message: `Successfully synced ${synced} events${failed ? `, ${failed} failed` : ''}`
                }
            });
        }
        catch (error) {
            console.error('Sync events error:', error);
            if (error.message === 'Zoho not connected') {
                res.status(400).json({
                    success: false,
                    error: 'Zoho calendar not connected'
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to sync events'
            });
        }
    }
    /**
     * Create event in Zoho and save to local DB
     * POST /api/zoho/events
     */
    static async createEvent(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Auth required' });
                return;
            }
            const { calendarId, title, description, startTime, endTime, location } = req.body;
            // 1. Get Calendar ID
            let targetCalendarId = calendarId;
            if (!targetCalendarId) {
                const user = await database_1.prisma.user.findUnique({ where: { id: req.user.id } });
                targetCalendarId = user?.zohoCalendarId;
            }
            // 2. Get Token (This is where your logs show it refreshes)
            const accessToken = await CalendarController.getValidToken(req.user.id, req.session);
            const startDate = new Date(startTime);
            const endDate = new Date(endTime);
            // Zoho Pattern: yyyyMMddTHHmmssZ
            const formatZohoDate = (date) => {
                return date.toISOString().replace(/[:\-]/g, '').split('.')[0] + 'Z';
            };
            // 3. Construct Payload
            const eventObject = {
                title,
                description: description || '',
                location: location || '',
                dateandtime: {
                    start: formatZohoDate(startDate),
                    end: formatZohoDate(endDate),
                    timezone: "Asia/Kolkata"
                }
            };
            const params = new URLSearchParams();
            params.append('eventdata', JSON.stringify(eventObject));
            const calendarApiUrl = process.env.ZOHO_API_URL || 'https://calendar.zoho.in/api/v1';
            // 4. API Call
            const response = await axios_1.default.post(`${calendarApiUrl}/calendars/${targetCalendarId}/events`, params, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            // 5. Database Sync
            const zohoEventId = response.data.event_id || (response.data.events && response.data.events[0]?.event_id);
            const newEvent = await database_1.prisma.zohoEvent.create({
                data: {
                    id: `${zohoEventId}_${req.user.id}`,
                    eventId: zohoEventId,
                    calendarId: targetCalendarId,
                    title,
                    description: description || '',
                    startTime: startDate,
                    endTime: endDate,
                    location: location || '',
                    userId: req.user.id,
                    updatedById: req.user.id
                }
            });
            res.status(201).json({ success: true, data: newEvent });
        }
        catch (error) {
            if (error.response) {
                const zohoError = error.response.data;
                console.error('❌ Zoho API Error:', JSON.stringify(zohoError, null, 2));
                // Detect scope error and tell the user to re-link their account
                if (JSON.stringify(zohoError).includes("INVALID_OAUTHSCOPE")) {
                    res.status(403).json({
                        success: false,
                        error: "Insufficient Permissions",
                        message: "Please disconnect and reconnect your Zoho account to grant 'Create Event' permissions."
                    });
                    return;
                }
                res.status(400).json({ success: false, error: zohoError });
            }
            else {
                res.status(500).json({ success: false, error: error.message });
            }
        }
    }
    /**
     * Update event in Zoho and local DB
     * PUT /api/zoho/events/:id
     */
    static async updateEvent(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const { title, description, startTime, endTime, location } = req.body;
            // Find local event
            const existingEvent = await database_1.prisma.zohoEvent.findFirst({
                where: {
                    id,
                    userId: req.user.id
                }
            });
            if (!existingEvent) {
                res.status(404).json({
                    success: false,
                    error: 'Event not found'
                });
                return;
            }
            const accessToken = await CalendarController.getValidToken(req.user.id, req.session);
            const calendarApiUrl = process.env.ZOHO_API_URL || 'https://calendar.zoho.in/api/v1';
            const zohoEventData = {
                title,
                description,
                start_time: new Date(startTime).toISOString(),
                end_time: new Date(endTime).toISOString(),
                location
            };
            await axios_1.default.put(`${calendarApiUrl}/calendars/${existingEvent.calendarId}/events/${existingEvent.eventId}`, zohoEventData, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            // Update local DB
            const updatedEvent = await database_1.prisma.zohoEvent.update({
                where: { id },
                data: {
                    title,
                    description,
                    startTime: new Date(startTime),
                    endTime: new Date(endTime),
                    location,
                    updatedById: req.user.id,
                    updatedAt: new Date()
                }
            });
            res.status(200).json({
                success: true,
                data: updatedEvent,
                message: 'Event updated successfully'
            });
        }
        catch (error) {
            console.error('Update event error:', error);
            if (error.message === 'Zoho not connected') {
                res.status(400).json({
                    success: false,
                    error: 'Zoho calendar not connected'
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to update event'
            });
        }
    }
    /**
     * Delete event from Zoho and local DB
     * DELETE /api/zoho/events/:id
     */
    static async deleteEvent(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            // Find local event
            const existingEvent = await database_1.prisma.zohoEvent.findFirst({
                where: {
                    id,
                    userId: req.user.id
                }
            });
            if (!existingEvent) {
                res.status(404).json({
                    success: false,
                    error: 'Event not found'
                });
                return;
            }
            const accessToken = await CalendarController.getValidToken(req.user.id, req.session);
            const calendarApiUrl = process.env.ZOHO_API_URL || 'https://calendar.zoho.in/api/v1';
            await axios_1.default.delete(`${calendarApiUrl}/calendars/${existingEvent.calendarId}/events/${existingEvent.eventId}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            // Delete from local DB
            await database_1.prisma.zohoEvent.delete({
                where: { id }
            });
            res.status(200).json({
                success: true,
                message: 'Event deleted successfully'
            });
        }
        catch (error) {
            console.error('Delete event error:', error);
            if (error.message === 'Zoho not connected') {
                res.status(400).json({
                    success: false,
                    error: 'Zoho calendar not connected'
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to delete event'
            });
        }
    }
    /**
     * Disconnect Zoho and clear all data
     * POST /api/zoho/disconnect
     */
    static async disconnect(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            // Delete all events and clear tokens in a transaction
            await database_1.prisma.$transaction([
                database_1.prisma.zohoEvent.deleteMany({
                    where: { userId: req.user.id }
                }),
                database_1.prisma.user.update({
                    where: { id: req.user.id },
                    data: {
                        zohoAccessToken: null,
                        zohoRefreshToken: null,
                        zohoTokenExpiry: null,
                        zohoCalendarId: null
                    }
                })
            ]);
            res.status(200).json({
                success: true,
                message: 'Successfully disconnected from Zoho'
            });
        }
        catch (error) {
            console.error('Disconnect error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to disconnect'
            });
        }
    }
    /**
     * Get events for dropdown/select (minimal data)
     * GET /api/zoho/events/select
     */
    static async getEventsForSelect(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { from, to, calendarId } = req.query;
            const where = {
                userId: req.user.id,
            };
            if (calendarId) {
                where.calendarId = calendarId;
            }
            if (from || to) {
                where.startTime = {};
                if (from)
                    where.startTime.gte = new Date(from);
                if (to)
                    where.startTime.lte = new Date(to);
            }
            const events = await database_1.prisma.zohoEvent.findMany({
                where,
                select: {
                    id: true,
                    eventId: true,
                    title: true,
                    startTime: true,
                    endTime: true,
                    location: true,
                },
                orderBy: { startTime: 'asc' }
            });
            const formattedEvents = events.map(event => ({
                value: event.id,
                label: event.title,
                startTime: event.startTime,
                endTime: event.endTime,
                location: event.location,
            }));
            res.status(200).json({
                success: true,
                data: formattedEvents
            });
        }
        catch (error) {
            console.error('Get events for select error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch events'
            });
        }
    }
}
exports.CalendarController = CalendarController;
exports.default = CalendarController;
//# sourceMappingURL=calendarcontroller.js.map