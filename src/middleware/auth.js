import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env.js";
import { User } from "../models/User.js";

let jwks = null;
const getJwks = () => {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${env.authUrl}/api/auth/jwks`));
  }
  return jwks;
};

const readBearer = (req) => {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
};

/** Verify the Better Auth JWT and load the live user record. */
export async function requireAuth(req, res, next) {
  const token = readBearer(req);
  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  let payload;
  try {
    const result = await jwtVerify(token, getJwks(), {
      issuer: env.authUrl,
      audience: env.authUrl,
    });
    payload = result.payload;
  } catch {
    return res.status(401).json({ message: "Invalid or expired session token" });
  }

  const userId = payload.sub || payload.id;
  if (!userId) return res.status(401).json({ message: "Invalid session token" });

  const user = await User.findById(userId);
  if (!user) return res.status(401).json({ message: "Account no longer exists" });
  if (user.isBlocked) {
    return res.status(403).json({ message: "This account has been blocked" });
  }

  req.user = user;
  req.auth = payload;
  return next();
}

/** Role guard - must be used after requireAuth. */
export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Authentication required" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action" });
    }
    return next();
  };
