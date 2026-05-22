import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";
export declare class SocketService {
    private static instance;
    private io;
    private constructor();
    static getInstance(): SocketService;
    initialize(httpServer: HttpServer): void;
    getIO(): SocketIOServer;
    emitToTenant(tenantId: string, event: string, data: any): void;
    /**
     * Fans out a client-scoped event to BOTH the tenant room (so all staff in
     * the tenant pick it up) and the specific client's portal room (so that
     * client's portal users pick it up). Other clients in the same tenant
     * receive nothing, which keeps portal traffic correctly partitioned.
     */
    emitToClient(tenantId: string, clientId: string, event: string, data: any): void;
}
export declare const socketService: SocketService;
