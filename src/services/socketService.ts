import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";

interface AuthTokenPayload {
  userId: string;
  tenantId: string;
  email: string;
}

export class SocketService {
  private static instance: SocketService;
  private io: SocketIOServer | null = null;

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  public initialize(httpServer: HttpServer): void {
    if (this.io) {
      return; // Already initialized
    }

    this.io = new SocketIOServer(httpServer, {
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
        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || "your-secret-key"
        ) as AuthTokenPayload;
        
        // Attach user info to socket
        (socket as any).user = decoded;
        next();
      } catch (err) {
        next(new Error("Authentication error: Invalid token"));
      }
    });

    this.io.on("connection", (socket) => {
      const user = (socket as any).user as AuthTokenPayload;
      if (!user) return;

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

  public getIO(): SocketIOServer {
    if (!this.io) {
      throw new Error("Socket.io not initialized!");
    }
    return this.io;
  }

  public emitToTenant(tenantId: string, event: string, data: any) {
    if (!this.io) return;
    this.io.to(`tenant:${tenantId}`).emit(event, data);
  }
}

export const socketService = SocketService.getInstance();
