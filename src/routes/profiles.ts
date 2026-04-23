import { Router } from "express";
import {
  createProfile,
  getProfileById,
  getAllProfiles,
  deleteProfile,
} from "../controllers/profileController";
import { searchProfiles } from "../controllers/searchController";

const router = Router();

router.post("/", createProfile);
router.get("/", getAllProfiles);

// NLP Search Endpoint (must be before /:id)
router.get("/search", searchProfiles);

router.get("/:id", getProfileById);
router.delete("/:id", deleteProfile);

export default router;
