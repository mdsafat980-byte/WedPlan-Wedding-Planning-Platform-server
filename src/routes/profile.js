import { Router } from "express";
import { User, publicUser } from "../models/User.js";
import { Booking } from "../models/Booking.js";
import { Service } from "../models/Service.js";
import { asyncHandler, HttpError, validate } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { profileInput } from "../validators/index.js";

export const profileRouter = Router();
profileRouter.use(requireAuth);

profileRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(publicUser(req.user));
  }),
);

profileRouter.patch(
  "/",
  validate(profileInput),
  asyncHandler(async (req, res) => {
    // Only whitelisted profile fields can be changed. Role, block status and
    // subscription fields are intentionally not accepted from the client.
    const allowed = ["name", "image", "businessName", "phone", "bio"];
    for (const field of allowed) {
      if (req.body[field] !== undefined) req.user[field] = req.body[field];
    }
    if (req.user.role === "vendor" && !req.user.businessName) {
      req.user.businessName = req.user.name;
    }
    await req.user.save();
    res.json(publicUser(req.user));
  }),
);

/**
 * Google sign-ups cannot pass a role during the OAuth round trip, so a brand
 * new customer account with no activity may choose the vendor role once.
 */
profileRouter.post(
  "/become-vendor",
  asyncHandler(async (req, res) => {
    if (req.user.role === "vendor") return res.json(publicUser(req.user));
    if (req.user.role !== "customer") {
      throw new HttpError(403, "This account cannot be converted to a vendor");
    }
    const [serviceCount, bookingCount] = await Promise.all([
      Service.countDocuments({ vendorId: req.user._id }),
      Booking.countDocuments({ customerId: req.user._id }),
    ]);
    if (serviceCount > 0 || bookingCount > 0) {
      throw new HttpError(400, "Accounts with existing activity cannot change role");
    }
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { role: "vendor", businessName: req.user.businessName || req.user.name },
      { new: true },
    );
    res.json(publicUser(user));
  }),
);
