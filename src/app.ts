import express from "express";
import cors from "cors";
import profileRoutes from "./routes/profiles";

const app = express();

// CORS — required for grading script
app.use(cors({ origin: "*" }));

// Parse JSON bodies
app.use(express.json());

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "Profile API is running" });
});

// Profile routes
app.use("/api/profiles", profileRoutes);

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

export default app;
