// import express from "express";
// import {
//   createShortcut,
//   getShortcuts,
//   deleteShortcut,
// } from "@/controllers/shortcut.controller";
// import { AuthRequest } from "@/types";
// import { resolveTenant } from "@/middleware/tenantContext";
// import { authenticateToken, requireAuth } from "@/middleware/auth";

// const router = express.Router();

// // Apply tenant context resolution to all routes
// router.use(resolveTenant);

// // Apply authentication to all routes
// router.use(authenticateToken);
// router.use(requireAuth);

// router.post("/", async (req: AuthRequest, res) => {
//   const result = await createShortcut(req);
//   res.json(result);
// });

// router.get("/", async (req: AuthRequest, res) => {
//   const result = await getShortcuts(req);
//   res.json(result);
// });

// router.delete("/:id", async (req: AuthRequest, res) => {
//   const result = await deleteShortcut(req, req.params.id);
//   res.json(result);
// });

// export default router;

import express from "express";
import ShortcutController from "@/controllers/shortcut.controller";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", requirePermission(Permissions.BOOKMARK_CREATE), ShortcutController.createShortcut);

router.get("/", requirePermission(Permissions.BOOKMARK_READ), ShortcutController.getShortcuts);

router.delete("/:id", requirePermission(Permissions.BOOKMARK_DELETE), ShortcutController.deleteShortcut);

export default router;
