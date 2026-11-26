import mongoose from "mongoose";

/**
 * Mirror of the Better Auth `users` collection.
 * Better Auth owns writes to this collection; the API only reads it and
 * updates profile fields that are explicitly allowed.
 */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    emailVerified: { type: Boolean, default: false },
    image: { type: String, default: "" },
    role: { type: String, enum: ["customer", "vendor", "admin"], default: "customer", index: true },
    isBlocked: { type: Boolean, default: false },
    businessName: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    bio: { type: String, default: "", trim: true },
    subscriptionPlan: { type: String, enum: ["free", "premium"], default: "free" },
    subscriptionExpiresAt: { type: Date, default: null },
  },
  { collection: "users", strict: false, versionKey: false, timestamps: true },
);

export const User = mongoose.models.User || mongoose.model("User", userSchema);

export const publicUser = (user) => {
  if (!user) return null;
  const doc = user.toObject ? user.toObject() : user;
  return {
    id: String(doc._id ?? doc.id),
    name: doc.name,
    email: doc.email,
    image: doc.image || "",
    role: doc.role || "customer",
    isBlocked: Boolean(doc.isBlocked),
    businessName: doc.businessName || "",
    phone: doc.phone || "",
    bio: doc.bio || "",
    subscriptionPlan: doc.subscriptionPlan || "free",
    subscriptionExpiresAt: doc.subscriptionExpiresAt || null,
    createdAt: doc.createdAt || null,
  };
};
