import { AuthRequest } from "@/types";
export declare function createShortcut(req: AuthRequest): Promise<{
    success: boolean;
    message: string;
    shortcut: {
        createdAt: Date;
        updatedAt: Date;
        createdById: string;
        updatedById: string;
        id: string;
        title: string;
        path: string;
    };
}>;
export declare function getShortcuts(req: AuthRequest): Promise<{
    createdAt: Date;
    updatedAt: Date;
    createdById: string;
    updatedById: string;
    id: string;
    title: string;
    path: string;
}[]>;
export declare function deleteShortcut(req: AuthRequest, shortcutId: string): Promise<{
    success: boolean;
    message: string;
}>;
