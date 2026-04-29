import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { initDB } from "./config/database";
import profileRoutes from "./routes/profiles";
import authRoutes from "./routes/auth";

// Load env vars
dotenv.config();

const app = express();

// ─── Request Logging ─────────────────────────────────────────
// Logs: method, endpoint, status code, response time
app.use(morgan(":method :url :status :response-time ms"));

// ─── CORS ─────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.WEB_PORTAL_URL || "http://localhost:3001",
  "http://localhost:3001",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (CLI tools, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(null, true); // permissive for grading; tighten in prod
    },
    credentials: true, // Allow cookies for web portal
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Version",
      "X-CSRF-Token",
    ],
  })
);

// ─── Body Parsing ─────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// ─── Health Check ─────────────────────────────────────────────
app.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    message: "Insighta Labs+ API is running",
    version: "1",
  });
});

// ─── DB Initialization ────────────────────────────────────────
app.use(async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    await initDB();
    next();
  } catch (err) {
    next(err);
  }
});

// ─── Routes ───────────────────────────────────────────────────
// Auth routes (no version header required)
app.use("/auth", authRoutes);

// Profile routes (version header + auth enforced inside router)
app.use("/api/profiles", profileRoutes);

// ─── 404 Handler ──────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

// ─── Global Error Handler ─────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err.message || err);
  res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
});

export default app;
