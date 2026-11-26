import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { env } from "./config/env.js";
import { getAuth } from "./auth.js";
import { publicServicesRouter } from "./routes/services.js";
import { profileRouter } from "./routes/profile.js";
import { vendorRouter } from "./routes/vendor.js";
import { customerRouter } from "./routes/customer.js";
import { adminRouter } from "./routes/admin.js";
import { uploadRouter, uploadsDir } from "./routes/upload.js";
import { stripeWebhookHandler, subscriptionRouter } from "./routes/subscription.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  const allowedOrigins = new Set([
    env.clientUrl,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin.replace(/\/$/, ""))) {
          return callback(null, true);
        }
        return callback(new Error("Origin is not allowed by CORS"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // Stripe needs the untouched raw body, so it is mounted before JSON parsing.
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    stripeWebhookHandler,
  );

  // Better Auth also needs the raw request stream.
  let authHandler = null;
  const handleAuth = (req, res, next) => {
    try {
      authHandler ||= toNodeHandler(getAuth());
      return authHandler(req, res);
    } catch (error) {
      return next(error);
    }
  };
  app.all("/api/auth/*splat", handleAuth);
  app.all("/api/auth", handleAuth);

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use("/uploads", express.static(uploadsDir, { maxAge: "7d" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "WedPlan API",
      stripe: Boolean(env.stripeSecretKey && env.stripePremiumPriceId),
      webhook: Boolean(env.stripeWebhookSecret),
      google: Boolean(env.googleClientId && env.googleClientSecret),
      imgbb: Boolean(env.imgbbApiKey),
      time: new Date().toISOString(),
    });
  });

  app.use("/api/services", publicServicesRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/vendor/subscription", subscriptionRouter);
  app.use("/api/vendor", vendorRouter);
  app.use("/api/customer", customerRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/upload", uploadRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
