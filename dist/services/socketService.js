"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketService = exports.SocketService = void 0;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
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
            try {
                const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || "your-secret-key");
                // Attach user info to socket
                socket.user = decoded;
                next();
            }
            catch (err) {
                next(new Error("Authentication error: Invalid token"));
            }
        });
        this.io.on("connection", (socket) => {
            const user = socket.user;
            if (!user)
                return;
            console.log(`User connected: ${user.userId} (Tenant: ${user.tenantId})`);
            // Join tenant room automatically
            const tenantRoom = `tenant:${user.tenantId}`;
            socket.join(tenantRoom);
            console.log(`User ${user.userId} joined room: ${tenantRoom}`);
            socket.on("disconnect", () => {
                console.log("User disconnected:", user.userId);
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
}
exports.SocketService = SocketService;
exports.socketService = SocketService.getInstance();
//# sourceMappingURL=socketService.js.map