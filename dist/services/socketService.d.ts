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
}
export declare const socketService: SocketService;
