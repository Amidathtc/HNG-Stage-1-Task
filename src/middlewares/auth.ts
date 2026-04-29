import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// ─── Extend Express Request ──────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        github_id: string;
        username: string;
        email: string;
        avatar_url: string;
        role: "admin" | "analyst";
        is_active: boolean;
      };
    }
  }
}

// ─── JWT Authentication Middleware ───────────────────────────

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Support both Authorization header (CLI) and cookie (web)
  const authHeader = req.headers["authorization"];
  const cookieToken = req.cookies?.access_token;

  let token: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (cookieToken) {
    token = cookieToken;
  }

  if (!token) {
    res.status(401).json({
      status: "error",
      message: "Authentication required",
    });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET not configured");

    const decoded = jwt.verify(token, secret) as any;
    req.user = {
      id: decoded.id,
      github_id: decoded.github_id,
      username: decoded.username,
      email: decoded.email,
      avatar_url: decoded.avatar_url,
      role: decoded.role,
      is_active: decoded.is_active,
    };

    // Reject inactive users
    if (!req.user.is_active) {
      res.status(403).json({
        status: "error",
        message: "Account is inactive",
      });
      return;
    }

    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      res.status(401).json({
        status: "error",
        message: "Access token expired",
      });
    } else {
      res.status(401).json({
        status: "error",
        message: "Invalid access token",
      });
    }
  }
}

// ─── Role-based Access Control Middleware ────────────────────

export function requireRole(role: "admin" | "analyst") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
      return;
    }

    // admin has full access; analyst is read-only
    if (role === "admin" && req.user.role !== "admin") {
      res.status(403).json({
        status: "error",
        message: "Admin access required",
      });
      return;
    }

    next();
  };
}

// ─── API Version Check Middleware ────────────────────────────

export function apiVersionCheck(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const version = req.headers["x-api-version"];
  if (!version || version !== "1") {
    res.status(400).json({
      status: "error",
      message: "API version header required",
    });
    return;
  }
  next();
}
