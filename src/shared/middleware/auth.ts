import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config";

export interface AuthUser {
  sub: string;
  role: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

const BEARER_PREFIX = "Bearer ";
const BEARER_PREFIX_LENGTH = BEARER_PREFIX.length;

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  
  if (!header?.startsWith(BEARER_PREFIX)) {
    res.status(401).json({ message: "Missing or invalid authorization header" });
    return;
  }

  const token = header.substring(BEARER_PREFIX_LENGTH);

  try {
    // Verify token, but ignore expiration errors since tokens never expire
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as AuthUser;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
}

export function requireRole(roles: string[]) {
  const allowedRoles = new Set(roles);
  
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthenticated" });
      return;
    }
    
    if (!allowedRoles.has(req.user.role)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    
    next();
  };
}
