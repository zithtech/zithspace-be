import { Router } from "express";
import { JiraController } from "./jira.controller";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();
const controller = new JiraController();

// Callback from Atlassian (cannot have auth headers)
router.get("/callback", controller.callback.bind(controller));

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.get("/connect", controller.connect.bind(controller));
router.get("/status", controller.getStatus.bind(controller));
router.get("/projects", controller.getProjects.bind(controller));
router.get("/issue-types", controller.getIssueTypes.bind(controller));
router.post("/issue", controller.createIssue.bind(controller));
router.get("/filters", controller.getFilters.bind(controller));
router.get("/statuses", controller.getStatuses.bind(controller));
router.get("/users", controller.getUsers.bind(controller));
router.post("/sprints", controller.getSprints.bind(controller));
router.post("/tickets/preview", controller.previewTickets.bind(controller));

router.get("/zukvo/statuses", controller.getZukvoStatuses.bind(controller));
router.get("/zukvo/users", controller.getZukvoUsers.bind(controller));

router.post("/disconnect", controller.disconnect.bind(controller));
router.post("/migrations", controller.startMigration.bind(controller));
router.get("/migrations/:migrationId", controller.getMigrationProgress.bind(controller));

export default router;
