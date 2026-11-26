import mongoose from "mongoose";

export const SERVICE_CATEGORIES = [
  "Photography & Videography",
  "Wedding Venues",
  "Decoration & Florist",
  "Catering Services",
  "Makeup & Styling",
  "Wedding Fashion",
];

export const SERVICE_STATUSES = ["pending", "approved", "rejected"];

const serviceSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    serviceName: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, enum: SERVICE_CATEGORIES, index: true },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    price: { type: Number, required: true, min: 0 },
    location: { type: String, required: true, trim: true, maxlength: 160 },
    images: {
      type: [String],
      default: [],
      validate: [(value) => value.length <= 8, "A service can have at most 8 images"],
    },
    status: { type: String, enum: SERVICE_STATUSES, default: "pending", index: true },
    isActive: { type: Boolean, default: true },
    rejectionReason: { type: String, default: "" },
  },
  { collection: "services", timestamps: true },
);

serviceSchema.index({ serviceName: "text", description: "text", location: "text" });

export const Service = mongoose.models.Service || mongoose.model("Service", serviceSchema);
