import { Router } from "express";
import {
  githubLogin,
  githubCallback,
  refreshToken,
  logout,
  whoami,
} from "../controllers/authController";
import { authenticate } from "../middlewares/auth";
import { authRateLimiter } from "../middlewares/rateLimit";

const router = Router();

// Apply rate limiting to all auth routes
router.use(authRateLimiter);

// GitHub OAuth flow
router.get("/github", githubLogin);
router.get("/github/callback", githubCallback);

// Token management
router.post("/refresh", refreshToken);
router.post("/logout", logout);

// Current user info (requires auth)
router.get("/whoami", authenticate, whoami);

export default router;
