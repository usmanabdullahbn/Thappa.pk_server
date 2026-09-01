import { Request, Response, NextFunction } from "express";

export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

// Wraps an async route handler so thrown errors reach errorHandler instead of hanging the request.
export function asyncHandler<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err?.name === "ValidationError") {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
    return;
  }

  if (err?.code === 11000) {
    res.status(409).json({ error: { code: "DUPLICATE", message: "A record with this value already exists" } });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
}
