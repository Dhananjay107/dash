import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";

const DUPLICATE_KEY_ERROR_CODE = 11000;
const DEFAULT_ERROR_STATUS = 500;
const isDevelopment = process.env.NODE_ENV === "development";

export class AppError extends Error {
  status: number;
  isOperational: boolean;

  constructor(message: string, status: number = DEFAULT_ERROR_STATUS, isOperational: boolean = true) {
    super(message);
    this.status = status;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

interface ErrorResponse {
  success: false;
  message: string;
  errors?: string[];
  stack?: string;
}

function createErrorResponse(message: string, errors?: string[], stack?: string): ErrorResponse {
  const response: ErrorResponse = { success: false, message };
  if (errors) response.errors = errors;
  if (stack && isDevelopment) response.stack = stack;
  return response;
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  console.error("Error:", err);

  if (err instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(err.errors).map((e: any) => e.message);
    res.status(400).json(createErrorResponse("Validation error", messages));
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json(createErrorResponse(`Invalid ${err.path}: ${err.value}`));
    return;
  }

  if (err.code === DUPLICATE_KEY_ERROR_CODE) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    res.status(409).json(createErrorResponse(`${field} already exists`));
    return;
  }

  if (err.name === "JsonWebTokenError") {
    res.status(401).json(createErrorResponse("Invalid token"));
    return;
  }

  if (err.name === "TokenExpiredError") {
    res.status(401).json(createErrorResponse("Token expired"));
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json(createErrorResponse(err.message));
    return;
  }

  const status = err.status || err.statusCode || DEFAULT_ERROR_STATUS;
  const message = err.message || "Internal server error";
  res.status(status).json(createErrorResponse(message, undefined, err.stack));
}
