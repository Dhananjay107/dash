import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

export function validateRequired(fields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing: string[] = [];
    for (const field of fields) {
      if (!req.body[field] && req.body[field] !== 0) {
        missing.push(field);
      }
    }
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`,
        missing,
      });
    }
    next();
  };
}

// Express-validator middleware handler
export function validateRequest(req: Request, res: Response, next: NextFunction) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePhone(phone: string): boolean {
  const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
  return phoneRegex.test(phone);
}

export function validateDate(date: string): boolean {
  const d = new Date(date);
  return d instanceof Date && !isNaN(d.getTime());
}

export function validatePositiveNumber(value: number): boolean {
  return typeof value === "number" && value >= 0;
}

export function validateEnum<T extends string>(value: string, allowedValues: T[]): value is T {
  return allowedValues.includes(value as T);
}

