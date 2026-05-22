"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketService = exports.SocketService = void 0;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const clientPortalJwt_1 = __importDefault(require("@/utils/clientPortalJwt"));
class SocketService {
    constructor() {
        this.io = null;
    }
    static getInstance() {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService();
        }
        return SocketService.instance;
    }
    initialize(httpServer) {
        if (this.io) {
            return; // Already initialized
        }
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: "*", // Adjust in production
                methods: ["GET", "POST"],
            },
            pingTimeout: 60000,
        });
        this.io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error("Authentication error: No token provided"));
            }
            // Try staff JWT first. If that fails, try the portal JWT. Either side
            // signs with its own secret + audience, so a token will only verify
            // against one of the two paths.
            try {
                const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_ACCESS_SECRET || "your-secret-key");
                const auth = {
                    scope: "staff",
                    userId: decoded.userId,
                    tenantId: decoded.tenantId,
                    email: decoded.email,
                };
                socket.auth = auth;
                return next();
            }
            catch {
                // fall through to portal JWT
            }
            try {
                const decoded = clientPortalJwt_1.default.verifyAccessToken(token);
                const auth = {
                    scope: "portal",
                    portalUserId: decoded.portalUserId,
                    tenantId: decoded.tenantId,
                    clientId: decoded.clientId,
                    email: decoded.email,
                };
                socket.auth = auth;
                return next();
            }
            catch {
                return next(new Error("Authentication error: Invalid token"));
            }
        });
        this.io.on("connection", (socket) => {
            const auth = socket.auth;
            if (!auth)
                return;
            if (auth.scope === "staff") {
                const tenantRoom = `tenant:${auth.tenantId}`;
                socket.join(tenantRoom);
                console.log(`Staff connected: ${auth.userId} (Tenant: ${auth.tenantId})`);
            }
            else {
                // Portal users get their own per-client room so events for client A
                // never leak to client B. Staff stay on the tenant room and we
                // dual-emit to both when an event is client-scoped.
                const clientRoom = `tenant:${auth.tenantId}:client:${auth.clientId}`;
                socket.join(clientRoom);
                console.log(`Portal user connected: ${auth.portalUserId} (Client: ${auth.clientId}, Tenant: ${auth.tenantId})`);
            }
            socket.on("disconnect", () => {
                if (auth.scope === "staff") {
                    console.log("Staff disconnected:", auth.userId);
                }
                else {
                    console.log("Portal user disconnected:", auth.portalUserId);
                }
            });
        });
        console.log("Socket.io initialized");
    }
    getIO() {
        if (!this.io) {
            throw new Error("Socket.io not initialized!");
        }
        return this.io;
    }
    emitToTenant(tenantId, event, data) {
        if (!this.io)
            return;
        this.io.to(`tenant:${tenantId}`).emit(event, data);
    }
    /**
     * Fans out a client-scoped event to BOTH the tenant room (so all staff in
     * the tenant pick it up) and the specific client's portal room (so that
     * client's portal users pick it up). Other clients in the same tenant
     * receive nothing, which keeps portal traffic correctly partitioned.
     */
    emitToClient(tenantId, clientId, event, data) {
        if (!this.io)
            return;
        this.io
            .to([`tenant:${tenantId}`, `tenant:${tenantId}:client:${clientId}`])
            .emit(event, data);
    }
}
exports.SocketService = SocketService;
exports.socketService = SocketService.getInstance();
//# sourceMappingURL=socketService.js.map