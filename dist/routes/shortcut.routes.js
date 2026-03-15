"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const shortcut_controller_1 = require("@/controllers/shortcut.controller");
const router = express_1.default.Router();
router.post("/", async (req, res) => {
    const result = await (0, shortcut_controller_1.createShortcut)(req);
    res.json(result);
});
router.get("/", async (req, res) => {
    const result = await (0, shortcut_controller_1.getShortcuts)(req);
    res.json(result);
});
router.delete("/:id", async (req, res) => {
    const result = await (0, shortcut_controller_1.deleteShortcut)(req, req.params.id);
    res.json(result);
});
exports.default = router;
//# sourceMappingURL=shortcut.routes.js.map