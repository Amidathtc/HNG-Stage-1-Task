import { Router } from "express";
import multer from "multer";
import {
  createProfile,
  getProfileById,
  getAllProfiles,
  deleteProfile,
} from "../controllers/profileController";
import { searchProfiles } from "../controllers/searchController";
import { exportProfilesCSV } from "../controllers/exportController";
import { ingestCSV } from "../controllers/ingestController";
import { authenticate, requireRole, apiVersionCheck } from "../middlewares/auth";
import { generalRateLimiter } from "../middlewares/rateLimit";

const router = Router();

// All profile routes require authentication, API version header, and rate limiting
router.use(authenticate);
router.use(apiVersionCheck);
router.use(generalRateLimiter);

// Multer — store file in memory (buffer), max 50MB
// We stream from the buffer so we never write to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
});

// Profile CRUD
router.post("/", requireRole("admin"), createProfile);
router.get("/", getAllProfiles);

// NLP Search (must be before /:id)
router.get("/search", searchProfiles);

// CSV Export (must be before /:id)
router.get("/export", exportProfilesCSV);

// CSV Ingestion — admin only, streams the uploaded file
router.post("/ingest", requireRole("admin"), upload.single("file"), ingestCSV);

router.get("/:id", getProfileById);
router.delete("/:id", requireRole("admin"), deleteProfile);

export default router;
