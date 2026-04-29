import rateLimit from "express-rate-limit";

// ─── Auth Rate Limiter: 10 req/min ───────────────────────────

export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      status: "error",
      message: "Too many requests. Please wait before trying again.",
    });
  },
});

// ─── General Rate Limiter: 60 req/min per user ───────────────

export const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Key by authenticated user ID if available, otherwise by IP
    return req.user?.id || req.ip || "unknown";
  },
  handler: (_req, res) => {
    res.status(429).json({
      status: "error",
      message: "Rate limit exceeded. Please slow down.",
    });
  },
});
