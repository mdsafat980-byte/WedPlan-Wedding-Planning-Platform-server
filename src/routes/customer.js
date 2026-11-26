import { Router } from "express";
import { Booking } from "../models/Booking.js";
import { Service } from "../models/Service.js";
import { asyncHandler, HttpError, validate } from "../middleware/error.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { bookingInput, idParam } from "../validators/index.js";
import { bookingPublic } from "../utils/serializers.js";

export const customerRouter = Router();
customerRouter.use(requireAuth, requireRole("customer"));

const populateBooking = (query) =>
  query
    .populate("serviceId", "serviceName category price location images")
    .populate("customerId", "name email image")
    .populate("vendorId", "name businessName image subscriptionPlan subscriptionExpiresAt");

customerRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const counts = await Booking.aggregate([
      { $match: { customerId: req.user._id } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const byStatus = Object.fromEntries(counts.map((row) => [row._id, row.count]));
    res.json({
      total: counts.reduce((sum, row) => sum + row.count, 0),
      pending: byStatus.pending || 0,
      accepted: byStatus.accepted || 0,
      rejected: byStatus.rejected || 0,
      cancelled: byStatus.cancelled || 0,
    });
  }),
);

customerRouter.get(
  "/bookings",
  asyncHandler(async (req, res) => {
    const bookings = await populateBooking(Booking.find({ customerId: req.user._id }))
      .sort({ createdAt: -1 })
      .lean();
    res.json({ items: bookings.map(bookingPublic) });
  }),
);

customerRouter.get(
  "/bookings/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const booking = await populateBooking(
      Booking.findOne({ _id: req.params.id, customerId: req.user._id }),
    ).lean();
    if (!booking) throw new HttpError(404, "Booking not found");
    res.json(bookingPublic(booking));
  }),
);

customerRouter.post(
  "/bookings",
  validate(bookingInput),
  asyncHandler(async (req, res) => {
    const service = await Service.findOne({
      _id: req.body.serviceId,
      status: "approved",
      isActive: true,
    });
    if (!service) throw new HttpError(404, "This service is not available for booking");

    if (String(service.vendorId) === String(req.user._id)) {
      throw new HttpError(403, "You cannot book your own service");
    }

    const eventDate = new Date(req.body.eventDate);
    eventDate.setUTCHours(0, 0, 0, 0);

    const duplicate = await Booking.findOne({
      serviceId: service._id,
      eventDate,
      status: { $in: ["pending", "accepted"] },
    });
    if (duplicate) {
      throw new HttpError(
        409,
        "An active booking request already exists for this service on the selected date",
      );
    }

    const booking = await Booking.create({
      serviceId: service._id,
      vendorId: service.vendorId,
      customerId: req.user._id,
      eventDate,
      eventLocation: req.body.eventLocation,
      message: req.body.message || "",
      status: "pending",
    });

    const populated = await populateBooking(Booking.findById(booking._id)).lean();
    res.status(201).json(bookingPublic(populated));
  }),
);

customerRouter.patch(
  "/bookings/:id/cancel",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const booking = await Booking.findOne({
      _id: req.params.id,
      customerId: req.user._id,
      status: "pending",
    });
    if (!booking) {
      throw new HttpError(404, "Only your own pending booking requests can be cancelled");
    }
    booking.status = "cancelled";
    await booking.save();
    const populated = await populateBooking(Booking.findById(booking._id)).lean();
    res.json(bookingPublic(populated));
  }),
);
