import { Router } from "express";
import rateLimit from "express-rate-limit";
import { LandingSignupController } from "@/controllers/landingSignupController";

const router = Router();

const signupRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { success: false, error: "Too many signup attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const verifyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, error: "Too many verification attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/signup", signupRateLimit, LandingSignupController.signup);
router.get("/verify-email", verifyRateLimit, LandingSignupController.verifyEmail);
router.post("/complete-registration", signupRateLimit, LandingSignupController.completeRegistration);

export default router;
