import { Request, Response, NextFunction } from "express";
import { AuditLog } from "../../audit/audit.model";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function audit(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (WRITE_METHODS.has(req.method)) {
    AuditLog.create({
      userId: req.user?.sub,
      method: req.method,
      path: req.path,
      body: req.body,
    }).catch((error) => {
      console.error("Audit log failed:", error);
    });
  }
  next();
}
