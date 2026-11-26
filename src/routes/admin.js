import { Router } from "express";
import { User, publicUser } from "../models/User.js";
import { Service } from "../models/Service.js";
import { Booking } from "../models/Booking.js";
import { Transaction } from "../models/Transaction.js";
import { asyncHandler, HttpError, validate } from "../middleware/error.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { adminServiceInput, blockInput, idParam } from "../validators/index.js";
import { escapeRegex, servicePublic } from "../utils/serializers.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [users, vendors, customers, totalServices, pendingServices, transactions, paid] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: "vendor" }),
        User.countDocuments({ role: "customer" }),
        Service.countDocuments(),
        Service.countDocuments({ status: "pending" }),
        Transaction.countDocuments(),
        Transaction.aggregate([
          { $match: { status: "paid" } },
          { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]),
      ]);

    res.json({
      users,
      vendors,
      customers,
      totalServices,
      pendingServices,
      transactions,
      paidTransactions: paid[0]?.count || 0,
      revenue: (paid[0]?.total || 0) / 100,
    });
  }),
);

adminRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || "").trim();
    const role = String(req.query.role || "").trim();
    const filter = {};
    if (role && ["customer", "vendor", "admin"].includes(role)) filter.role = role;
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: rx }, { email: rx }, { businessName: rx }];
    }
    const users = await User.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ items: users.map(publicUser) });
  }),
);

adminRouter.get(
  "/users/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).lean();
    if (!user) throw new HttpError(404, "User not found");
    const [services, bookings] = await Promise.all([
      Service.countDocuments({ vendorId: user._id }),
      Booking.countDocuments({
        $or: [{ customerId: user._id }, { vendorId: user._id }],
      }),
    ]);
    res.json({ ...publicUser(user), serviceCount: services, bookingCount: bookings });
  }),
);

adminRouter.patch(
  "/users/:id/block",
  validate(idParam, "params"),
  validate(blockInput),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new HttpError(404, "User not found");
    if (String(user._id) === String(req.user._id)) {
      throw new HttpError(400, "You cannot block your own admin account");
    }
    if (user.role === "admin" && req.body.isBlocked) {
      throw new HttpError(403, "Admin accounts cannot be blocked from the dashboard");
    }
    user.isBlocked = req.body.isBlocked;
    await user.save();
    res.json(publicUser(user));
  }),
);

adminRouter.get(
  "/services",
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim();
    const category = String(req.query.category || "").trim();
    const filter = {};
    if (["pending", "approved", "rejected"].includes(status)) filter.status = status;
    if (category) filter.category = category;
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ serviceName: rx }, { location: rx }];
    }
    const services = await Service.find(filter)
      .populate("vendorId", "name businessName email image subscriptionPlan subscriptionExpiresAt")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ items: services.map(servicePublic) });
  }),
);

adminRouter.patch(
  "/services/:id",
  validate(idParam, "params"),
  validate(adminServiceInput),
  asyncHandler(async (req, res) => {
    const service = await Service.findById(req.params.id);
    if (!service) throw new HttpError(404, "Service not found");

    if (req.body.status === "approved" && !service.isActive) {
      throw new HttpError(400, "Activate the service before approving it");
    }

    if (req.body.status === "approved") {
      const vendor = await User.findById(service.vendorId);
      if (!vendor) throw new HttpError(404, "Vendor account no longer exists");
      if (vendor.isBlocked) {
        throw new HttpError(403, "Services from blocked vendors cannot be approved");
      }
      const premium =
        vendor.subscriptionPlan === "premium" &&
        (!vendor.subscriptionExpiresAt || new Date(vendor.subscriptionExpiresAt) > new Date());
      if (!premium) {
        const approvedCount = await Service.countDocuments({
          vendorId: vendor._id,
          status: "approved",
          isActive: true,
          _id: { $ne: service._id },
        });
        if (approvedCount >= 3) {
          throw new HttpError(
            403,
            "This vendor is on the Free plan and already has 3 active approved services",
          );
        }
      }
    }

    if (req.body.status) service.status = req.body.status;
    if (typeof req.body.isActive === "boolean") service.isActive = req.body.isActive;
    if (typeof req.body.rejectionReason === "string") {
      service.rejectionReason = req.body.rejectionReason;
    }
    await service.save();

    const populated = await service.populate(
      "vendorId",
      "name businessName email image subscriptionPlan subscriptionExpiresAt",
    );
    res.json(servicePublic(populated));
  }),
);

adminRouter.delete(
  "/services/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) throw new HttpError(404, "Service not found");
    await Booking.deleteMany({ serviceId: service._id });
    res.json({ message: "Service deleted" });
  }),
);

adminRouter.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const filter = {};
    const status = String(req.query.status || "").trim();
    if (["pending", "paid", "failed", "expired", "refunded"].includes(status)) {
      filter.status = status;
    }
    const transactions = await Transaction.find(filter)
      .populate("vendorId", "name email businessName image")
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      items: transactions.map((transaction) => ({
        id: String(transaction._id),
        vendor: transaction.vendorId
          ? {
              id: String(transaction.vendorId._id),
              name: transaction.vendorId.name,
              email: transaction.vendorId.email,
              businessName: transaction.vendorId.businessName || "",
            }
          : null,
        plan: transaction.plan,
        amount: transaction.amount / 100,
        currency: transaction.currency,
        status: transaction.status,
        stripeSessionId: transaction.stripeSessionId,
        stripeSubscriptionId: transaction.stripeSubscriptionId,
        createdAt: transaction.createdAt,
        paidAt: transaction.paidAt,
      })),
    });
  }),
);
