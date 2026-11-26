import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    plan: { type: String, enum: ["premium"], default: "premium" },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "usd" },
    stripeSessionId: { type: String, required: true, unique: true },
    stripeSubscriptionId: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "expired", "refunded"],
      default: "pending",
      index: true,
    },
    paidAt: { type: Date, default: null },
  },
  { collection: "transactions", timestamps: true },
);

export const Transaction =
  mongoose.models.Transaction || mongoose.model("Transaction", transactionSchema);
