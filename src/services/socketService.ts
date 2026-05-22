import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import ClientPortalJWT from "@/utils/clientPortalJwt";

interface StaffAuthPayload {
  scope: "staff";
  userId: string;
  tenantId: string;
  email: string;
}

interface PortalAuthPayload {
  scope: "portal";
  portalUserId: string;
  tenantId: string;
  clientId: string;
  email: string;
}

type SocketAuth = StaffAuthPayload | PortalAuthPayload;

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

      // Try staff JWT first. If that fails, try the portal JWT. Either side
      // signs with its own secret + audience, so a token will only verify
      // against one of the two paths.
      try {
        const decoded = jwt.verify(
          token,
          process.env.JWT_ACCESS_SECRET || "your-secret-key",
        ) as { userId: string; tenantId: string; email: string };
        const auth: StaffAuthPayload = {
          scope: "staff",
          userId: decoded.userId,
          tenantId: decoded.tenantId,
          email: decoded.email,
        };
        (socket as any).auth = auth;
        return next();
      } catch {
        // fall through to portal JWT
      }

      try {
        const decoded = ClientPortalJWT.verifyAccessToken(token);
        const auth: PortalAuthPayload = {
          scope: "portal",
          portalUserId: decoded.portalUserId,
          tenantId: decoded.tenantId,
          clientId: decoded.clientId,
          email: decoded.email,
        };
        (socket as any).auth = auth;
        return next();
      } catch {
        return next(new Error("Authentication error: Invalid token"));
      }
    });

    this.io.on("connection", (socket) => {
      const auth = (socket as any).auth as SocketAuth | undefined;
      if (!auth) return;

      if (auth.scope === "staff") {
        const tenantRoom = `tenant:${auth.tenantId}`;
        socket.join(tenantRoom);
        console.log(
          `Staff connected: ${auth.userId} (Tenant: ${auth.tenantId})`,
        );
      } else {
        // Portal users get their own per-client room so events for client A
        // never leak to client B. Staff stay on the tenant room and we
        // dual-emit to both when an event is client-scoped.
        const clientRoom = `tenant:${auth.tenantId}:client:${auth.clientId}`;
        socket.join(clientRoom);
        console.log(
          `Portal user connected: ${auth.portalUserId} (Client: ${auth.clientId}, Tenant: ${auth.tenantId})`,
        );
      }

      socket.on("disconnect", () => {
        if (auth.scope === "staff") {
          console.log("Staff disconnected:", auth.userId);
        } else {
          console.log("Portal user disconnected:", auth.portalUserId);
        }
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

  /**
   * Fans out a client-scoped event to BOTH the tenant room (so all staff in
   * the tenant pick it up) and the specific client's portal room (so that
   * client's portal users pick it up). Other clients in the same tenant
   * receive nothing, which keeps portal traffic correctly partitioned.
   */
  public emitToClient(
    tenantId: string,
    clientId: string,
    event: string,
    data: any,
  ) {
    if (!this.io) return;
    this.io
      .to([`tenant:${tenantId}`, `tenant:${tenantId}:client:${clientId}`])
      .emit(event, data);
  }
}

export const socketService = SocketService.getInstance();
