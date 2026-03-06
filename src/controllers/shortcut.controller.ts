import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

// ✅ CREATE Shortcut
export async function createShortcut(req: AuthRequest) {
  try {
    if (!req.user?.id) throw new Error("Unauthorized");

    const { name, path } = req.body;

    const shortcut = await prisma.shortcut.create({
      data: {
        title: name,
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
  } catch (error) {
    console.error("Error in createShortcut:", error);
    throw error;
  }
}

// ✅ GET All Shortcuts
export async function getShortcuts(req: AuthRequest) {
  try {
    if (!req.tenantId || !req.user) {
      throw new Error("Tenant context and authentication required");
    }

    const shortcuts = await prisma.shortcut.findMany({
      where: {
        createdById: req.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return shortcuts;
  } catch (error) {
    console.error("Error in getShortcuts:", error);
    throw error;
  }
}

// ✅ DELETE Shortcut
export async function deleteShortcut(req: AuthRequest, shortcutId: string) {
  try {
    if (!req.user?.id) throw new Error("Unauthorized");

    await prisma.shortcut.delete({
      where: {
        id: shortcutId,
      },
    });

    return {
      success: true,
      message: "Shortcut deleted successfully",
    };
  } catch (error) {
    console.error("Error in deleteShortcut:", error);
    throw error;
  }
}
