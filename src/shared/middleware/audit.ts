import { Request, Response, NextFunction } from "express";
import { AuditLog } from "../../audit/audit.model";

// Lightweight audit logger for medical / financial operations
export async function audit(req: Request, _res: Response, next: NextFunction) {
  // Only log write operations
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    try {
      await AuditLog.create({
        userId: req.user?.sub,
        method: req.method,
        path: req.path,
        body: req.body,
      });
    } catch (e) {
      console.error("Audit log failed", e);
    }
  }
  next();
}


