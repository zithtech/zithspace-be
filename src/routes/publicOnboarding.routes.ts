import express from "express";
import { getPublicInvite, submitPublicInvite } from "@/controllers/onboardingInviteController";

// Public, UNAUTHENTICATED onboarding routes. The invite token in the URL is the
// only credential — it resolves the tenant + draft employee server-side. No
// auth/tenant middleware here by design. Mounted at /api/public/onboarding.
const router = express.Router();

const asyncHandler = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.get("/:token", asyncHandler(getPublicInvite));
router.post("/:token", asyncHandler(submitPublicInvite));

export default router;
