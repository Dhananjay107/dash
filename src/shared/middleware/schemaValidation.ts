import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";

/**
 * Schema Validation Middleware
 * Validates data against Mongoose schemas before database operations
 */

export function validateSchema(modelName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get the model
      const Model = mongoose.model(modelName);

      // Validate the request body against the schema
      const doc = new Model(req.body);
      const validationError = doc.validateSync();

      if (validationError) {
        const errors: Record<string, string> = {};
        if (validationError.errors) {
          Object.keys(validationError.errors).forEach((key) => {
            errors[key] = validationError.errors[key].message;
          });
        }
        return res.status(400).json({
          message: "Validation failed",
          errors,
        });
      }

      next();
    } catch (error: any) {
      return res.status(500).json({
        message: "Schema validation error",
        error: error.message,
      });
    }
  };
}

/**
 * Validate ObjectId format
 */
export function validateObjectId(paramName: string = "id") {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = req.params[paramName];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: `Invalid ${paramName} format`,
      });
    }

    next();
  };
}

/**
 * Validate required fields
 */
export function validateRequiredFields(fields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing: string[] = [];

    fields.forEach((field) => {
      if (!req.body[field] && req.body[field] !== 0 && req.body[field] !== false) {
        missing.push(field);
      }
    });

    if (missing.length > 0) {
      return res.status(400).json({
        message: "Missing required fields",
        missing,
      });
    }

    next();
  };
}

