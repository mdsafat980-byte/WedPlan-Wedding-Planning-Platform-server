import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function validate(schema, source = "body") {
  return (req, _res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      // Express 5 exposes req.query as a read-only getter.
      if (source === "query") req.validatedQuery = parsed;
      else req[source] = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.issues[0]?.message || "Invalid request data";
        return next(new HttpError(400, message, error.issues));
      }
      next(error);
    }
  };
}

export function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} was not found` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, _next) {
  if (error?.name === "ValidationError") {
    const first = Object.values(error.errors || {})[0];
    return res.status(400).json({ message: first?.message || "Invalid data" });
  }
  if (error?.name === "CastError") {
    return res.status(400).json({ message: `Invalid ${error.path}` });
  }
  if (error?.code === 11000) {
    return res.status(409).json({ message: "A record with these details already exists" });
  }
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Request body must be valid JSON" });
  }

  const status = error?.status || 500;
  if (status >= 500) console.error("[api]", error);
  res.status(status).json({
    message: status >= 500 ? "Internal server error" : error.message,
    ...(error.details ? { details: error.details } : {}),
  });
}
