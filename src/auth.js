import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { jwt } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { env } from "./config/env.js";
import { getDb } from "./db.js";
import { User } from "./models/User.js";

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z]).{6,}$/;

let authInstance = null;

function buildAuth() {
  const db = getDb();

  if (!env.authSecret && env.isProduction) {
    throw new Error("BETTER_AUTH_SECRET is required in production");
  }

  return betterAuth({
    appName: "WedPlan",
    baseURL: env.authUrl,
    basePath: "/api/auth",
    secret: env.authSecret || "wedplan-development-secret-change-me-please-32chars",
    database: mongodbAdapter(db, {
      usePlural: true,
      // The in-memory development server is a standalone instance, so
      // multi-document transactions are not available there.
      transaction: false,
    }),
    trustedOrigins: [
      env.clientUrl,
      "https://wed-plan-wedding-planning-platform.vercel.app",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    socialProviders:
      env.googleClientId && env.googleClientSecret
        ? {
            google: {
              clientId: env.googleClientId,
              clientSecret: env.googleClientSecret,
            },
          }
        : {},
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "customer",
          input: false,
        },
        // Accepted only while creating an account, then discarded by the hook
        // below. `role` itself can never be supplied by a client.
        signupRole: { type: "string", required: false, input: true },
        isBlocked: { type: "boolean", required: false, defaultValue: false, input: false },
        businessName: { type: "string", required: false, input: false },
        phone: { type: "string", required: false, input: false },
        bio: { type: "string", required: false, input: false },
        subscriptionPlan: {
          type: "string",
          required: false,
          defaultValue: "free",
          input: false,
        },
        subscriptionExpiresAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    plugins: [
      jwt({
        jwt: {
          expirationTime: "1h",
          issuer: env.authUrl,
          audience: env.authUrl,
          // Keep only the claims the API actually needs. In particular the
          // one-time `signupRole` field must never leak into a session token.
          definePayload: ({ user }) => ({
            email: user.email,
            name: user.name,
            role: user.role,
          }),
        },
      }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email") {
          const password = ctx.body?.password;
          if (typeof password !== "string" || !PASSWORD_RULE.test(password)) {
            throw new APIError("BAD_REQUEST", {
              message:
                "Password must be at least 6 characters and include one uppercase and one lowercase letter",
            });
          }
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const { signupRole, ...rest } = user;
            const role = signupRole === "vendor" ? "vendor" : "customer";
            return {
              data: {
                ...rest,
                role,
                isBlocked: false,
                subscriptionPlan: "free",
              },
            };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await User.findById(session.userId).select("isBlocked").lean();
            if (user?.isBlocked) {
              throw new APIError("FORBIDDEN", {
                message: "This account has been blocked. Please contact support.",
              });
            }
          },
        },
      },
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
      useSecureCookies: env.isProduction,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: env.isProduction ? "none" : "lax",
        secure: env.isProduction,
        path: "/",
      },
    },
  });
}

export function getAuth() {
  if (!authInstance) authInstance = buildAuth();
  return authInstance;
}
