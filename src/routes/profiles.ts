import { Router } from "express";
import {
  createProfile,
  getProfileById,
  getAllProfiles,
  deleteProfile,
} from "../controllers/profileController";
import { searchProfiles } from "../controllers/searchController";
import { exportProfilesCSV } from "../controllers/exportController";
import { authenticate, requireRole, apiVersionCheck } from "../middlewares/auth";
import { generalRateLimiter } from "../middlewares/rateLimit";

const router = Router();

// All profile routes require authentication, API version header, and rate limiting
router.use(authenticate);
router.use(apiVersionCheck);
router.use(generalRateLimiter);

// Profile CRUD
router.post("/", requireRole("admin"), createProfile);
router.get("/", getAllProfiles);

// NLP Search (must be before /:id)
router.get("/search", searchProfiles);

// CSV Export (must be before /:id)
router.get("/export", exportProfilesCSV);

router.get("/:id", getProfileById);
router.delete("/:id", requireRole("admin"), deleteProfile);

export default router;
