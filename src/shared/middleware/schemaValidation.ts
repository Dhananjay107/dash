import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";

const DEFAULT_PARAM_NAME = "id";

export function validateSchema(modelName: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const Model = mongoose.model(modelName);
      const doc = new Model(req.body);
      const validationError = doc.validateSync();

      if (validationError) {
        const errors: Record<string, string> = {};
        
        if (validationError.errors) {
          Object.keys(validationError.errors).forEach((key) => {
            errors[key] = validationError.errors[key].message;
          });
        }

        res.status(400).json({
          message: "Validation failed",
          errors,
        });
        return;
      }

      next();
    } catch (error: any) {
      res.status(500).json({
        message: "Schema validation error",
        error: error.message,
      });
    }
  };
}

export function validateObjectId(paramName: string = DEFAULT_PARAM_NAME) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = req.params[paramName];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        message: `Invalid ${paramName} format`,
      });
      return;
    }

    next();
  };
}

export function validateRequiredFields(fields: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missing = fields.filter(
      (field) => !req.body[field] && req.body[field] !== 0 && req.body[field] !== false
    );

    if (missing.length > 0) {
      res.status(400).json({
        message: "Missing required fields",
        missing,
      });
      return;
    }

    next();
  };
}
