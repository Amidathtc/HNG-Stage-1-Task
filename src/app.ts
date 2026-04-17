import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initDB } from "./config/database";
import profileRoutes from "./routes/profiles";

// Load env vars (safety net — Vercel should inject them via dashboard)
dotenv.config();

const app = express();

// CORS — required for grading script
app.use(cors({ origin: "*" }));

// Parse JSON bodies
app.use(express.json());

// Health check — responds without DB dependency
app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", message: "Profile API is running" });
});

// Lazy DB initialization middleware (runs once per cold start)
app.use(async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    await initDB();
    next();
  } catch (err) {
    next(err);
  }
});

// Profile routes
app.use("/api/profiles", profileRoutes);

// 404 catch-all
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

// Global error handler — prevents unhandled errors from crashing the function
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err.message || err);
  res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
});

export default app;
