import { Router } from "express";
import { Service } from "../models/Service.js";
import { Booking } from "../models/Booking.js";
import { asyncHandler, HttpError, validate } from "../middleware/error.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { FREE_ACTIVE_SERVICE_LIMIT, isPremium, servicePublic } from "../utils/serializers.js";
import { serviceInput, availabilityInput, idParam } from "../validators/index.js";

export const vendorRouter = Router();
vendorRouter.use(requireAuth, requireRole("vendor"));

const vendorServiceFields =
  "name businessName image subscriptionPlan subscriptionExpiresAt";

vendorRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const [totalServices, activeServices, pendingBookings, acceptedBookings, pendingServices] =
      await Promise.all([
        Service.countDocuments({ vendorId: req.user._id }),
        Service.countDocuments({ vendorId: req.user._id, isActive: true, status: "approved" }),
        Booking.countDocuments({ vendorId: req.user._id, status: "pending" }),
        Booking.countDocuments({ vendorId: req.user._id, status: "accepted" }),
        Service.countDocuments({ vendorId: req.user._id, status: "pending" }),
      ]);

    res.json({
      totalServices,
      activeServices,
      pendingBookings,
      acceptedBookings,
      pendingServices,
      plan: isPremium(req.user) ? "premium" : "free",
      subscriptionPlan: req.user.subscriptionPlan,
      subscriptionExpiresAt: req.user.subscriptionExpiresAt,
      freeLimit: FREE_ACTIVE_SERVICE_LIMIT,
      canPublishMore:
        isPremium(req.user) || activeServices < FREE_ACTIVE_SERVICE_LIMIT,
      businessName: req.user.businessName || "",
    });
  }),
);

vendorRouter.get(
  "/services",
  asyncHandler(async (req, res) => {
    const services = await Service.find({ vendorId: req.user._id })
      .populate("vendorId", vendorServiceFields)
      .sort({ createdAt: -1 })
      .lean();
    res.json({ items: services.map(servicePublic) });
  }),
);

vendorRouter.post(
  "/services",
  validate(serviceInput),
  asyncHandler(async (req, res) => {
    if (!isPremium(req.user)) {
      const publishedCount = await Service.countDocuments({
        vendorId: req.user._id,
        isActive: true,
        status: { $in: ["pending", "approved"] },
      });
      if (publishedCount >= FREE_ACTIVE_SERVICE_LIMIT) {
        throw new HttpError(
          403,
          `Free vendors can publish up to ${FREE_ACTIVE_SERVICE_LIMIT} active services. Upgrade to Premium for unlimited listings.`,
        );
      }
    }

    const service = await Service.create({
      ...req.body,
      vendorId: req.user._id,
      status: "pending",
      isActive: true,
    });
    const populated = await service.populate("vendorId", vendorServiceFields);
    res.status(201).json(servicePublic(populated));
  }),
);

vendorRouter.put(
  "/services/:id",
  validate(idParam, "params"),
  validate(serviceInput),
  asyncHandler(async (req, res) => {
    const service = await Service.findOne({ _id: req.params.id, vendorId: req.user._id });
    if (!service) throw new HttpError(404, "Service not found");

    Object.assign(service, req.body, {
      status: "pending",
      rejectionReason: "",
    });
    await service.save();
    const populated = await service.populate("vendorId", vendorServiceFields);
    res.json(servicePublic(populated));
  }),
);

vendorRouter.patch(
  "/services/:id/availability",
  validate(idParam, "params"),
  validate(availabilityInput),
  asyncHandler(async (req, res) => {
    const service = await Service.findOne({ _id: req.params.id, vendorId: req.user._id });
    if (!service) throw new HttpError(404, "Service not found");

    if (req.body.isActive && !isPremium(req.user)) {
      const activeCount = await Service.countDocuments({
        vendorId: req.user._id,
        isActive: true,
        status: "approved",
        _id: { $ne: service._id },
      });
      if (activeCount >= FREE_ACTIVE_SERVICE_LIMIT) {
        throw new HttpError(
          403,
          `Free vendors can keep up to ${FREE_ACTIVE_SERVICE_LIMIT} active services. Upgrade to Premium to activate more.`,
        );
      }
    }

    service.isActive = req.body.isActive;
    await service.save();
    const populated = await service.populate("vendorId", vendorServiceFields);
    res.json(servicePublic(populated));
  }),
);

vendorRouter.delete(
  "/services/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const service = await Service.findOneAndDelete({
      _id: req.params.id,
      vendorId: req.user._id,
    });
    if (!service) throw new HttpError(404, "Service not found");
    await Booking.deleteMany({ serviceId: service._id });
    res.json({ message: "Service deleted" });
  }),
);

vendorRouter.get(
  "/bookings",
  asyncHandler(async (req, res) => {
    const { bookingPublic } = await import("../utils/serializers.js");
    const bookings = await Booking.find({ vendorId: req.user._id })
      .populate("serviceId", "serviceName category price location images")
      .populate("customerId", "name email image")
      .populate("vendorId", "name businessName image subscriptionPlan subscriptionExpiresAt")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ items: bookings.map(bookingPublic) });
  }),
);

vendorRouter.patch(
  "/bookings/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const status = req.body?.status;
    if (!["accepted", "rejected"].includes(status)) {
      throw new HttpError(400, "Status must be either accepted or rejected");
    }
    const booking = await Booking.findOne({
      _id: req.params.id,
      vendorId: req.user._id,
      status: "pending",
    });
    if (!booking) {
      throw new HttpError(404, "Pending booking request not found for your services");
    }
    booking.status = status;
    await booking.save();

    const populated = await booking.populate([
      { path: "serviceId", select: "serviceName category price location images" },
      { path: "customerId", select: "name email image" },
      { path: "vendorId", select: "name businessName image subscriptionPlan subscriptionExpiresAt" },
    ]);
    const { bookingPublic } = await import("../utils/serializers.js");
    res.json(bookingPublic(populated));
  }),
);
