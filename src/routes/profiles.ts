import { Router } from "express";
import {
  createProfile,
  getProfileById,
  getAllProfiles,
  deleteProfile,
} from "../controllers/profileController";

const router = Router();

router.post("/", createProfile);
router.get("/", getAllProfiles);
router.get("/:id", getProfileById);
router.delete("/:id", deleteProfile);

export default router;
