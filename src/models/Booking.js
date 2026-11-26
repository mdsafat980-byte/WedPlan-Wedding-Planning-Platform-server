import mongoose from "mongoose";

export const BOOKING_STATUSES = ["pending", "accepted", "rejected", "cancelled"];

const bookingSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    eventDate: { type: Date, required: true },
    eventLocation: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, default: "", trim: true, maxlength: 1500 },
    status: { type: String, enum: BOOKING_STATUSES, default: "pending", index: true },
  },
  { collection: "bookings", timestamps: true },
);

// One active request per service and event date.
bookingSchema.index(
  { serviceId: 1, eventDate: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["pending", "accepted"] } } },
);

export const Booking = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
