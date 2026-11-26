import "dotenv/config";

const bool = (value, fallback = false) => {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT || 5000),
  clientUrl: (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, ""),
  authUrl: (process.env.BETTER_AUTH_URL || "http://localhost:5000").replace(/\/$/, ""),
  publicServerUrl: (process.env.PUBLIC_SERVER_URL || process.env.BETTER_AUTH_URL || "http://localhost:5000").replace(/\/$/, ""),
  mongoUri: process.env.MONGODB_URI || "",
  authSecret: process.env.BETTER_AUTH_SECRET || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripePremiumPriceId: process.env.STRIPE_PREMIUM_PRICE_ID || "",
  imgbbApiKey: process.env.IMGBB_API_KEY || "",
  adminName: process.env.ADMIN_NAME || "WedPlan Admin",
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  autoSeed: bool(process.env.AUTO_SEED, process.env.NODE_ENV !== "production"),
};

export function assertProductionEnv() {
  if (!env.isProduction) return;
  const required = ["authSecret", "mongoUri", "clientUrl", "authUrl"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
  if (env.authSecret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters in production");
  }
}
