"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createShortcut = createShortcut;
exports.getShortcuts = getShortcuts;
exports.deleteShortcut = deleteShortcut;
const database_1 = require("@/config/database");
// ✅ CREATE Shortcut
async function createShortcut(req) {
    try {
        if (!req.user?.id)
            throw new Error("Unauthorized");
        const { title, path } = req.body;
        const shortcut = await database_1.prisma.shortcut.create({
            data: {
                title,
                path,
                createdById: req.user.id,
                updatedById: req.user.id,
            },
        });
        return {
            success: true,
            message: "Shortcut created successfully",
            shortcut,
        };
    }
    catch (error) {
        console.error("Error in createShortcut:", error);
        throw error;
    }
}
// ✅ GET All Shortcuts
async function getShortcuts(req) {
    try {
        if (!req.user?.id)
            throw new Error("Unauthorized");
        const shortcuts = await database_1.prisma.shortcut.findMany({
            where: {
                createdById: req.user.id,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        return shortcuts;
    }
    catch (error) {
        console.error("Error in getShortcuts:", error);
        throw error;
    }
}
// ✅ DELETE Shortcut
async function deleteShortcut(req, shortcutId) {
    try {
        if (!req.user?.id)
            throw new Error("Unauthorized");
        await database_1.prisma.shortcut.delete({
            where: {
                id: shortcutId,
            },
        });
        return {
            success: true,
            message: "Shortcut deleted successfully",
        };
    }
    catch (error) {
        console.error("Error in deleteShortcut:", error);
        throw error;
    }
}
//# sourceMappingURL=shortcut.controller.js.map