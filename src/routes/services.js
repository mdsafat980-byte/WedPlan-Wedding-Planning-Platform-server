import { Router } from "express";
import mongoose from "mongoose";
import { Service } from "../models/Service.js";
import { asyncHandler, HttpError, validate } from "../middleware/error.js";
import { serviceQuery } from "../validators/index.js";
import { escapeRegex, servicePublic } from "../utils/serializers.js";

export const publicServicesRouter = Router();

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
};

publicServicesRouter.get(
  "/",
  validate(serviceQuery, "query"),
  asyncHandler(async (req, res) => {
    const { search, category, location, sort = "newest" } = req.validatedQuery;
    const page = req.validatedQuery.page || 1;
    const limit = req.validatedQuery.limit || 9;

    const filter = { status: "approved", isActive: true };
    if (category) filter.category = category;
    if (location) filter.location = new RegExp(escapeRegex(location), "i");
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ serviceName: rx }, { description: rx }, { location: rx }];
    }

    const [total, services] = await Promise.all([
      Service.countDocuments(filter),
      Service.find(filter)
        .populate("vendorId", "name businessName image subscriptionPlan subscriptionExpiresAt")
        .sort(SORTS[sort] || SORTS.newest)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      items: services.map(servicePublic),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
    });
  }),
);

publicServicesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new HttpError(404, "Service not found");
    }
    const service = await Service.findOne({
      _id: req.params.id,
      status: "approved",
      isActive: true,
    })
      .populate("vendorId", "name businessName image subscriptionPlan subscriptionExpiresAt createdAt")
      .lean();

    if (!service) throw new HttpError(404, "This service is not available or has not been approved yet");

    const related = await Service.find({
      _id: { $ne: service._id },
      status: "approved",
      isActive: true,
      category: service.category,
    })
      .populate("vendorId", "name businessName image subscriptionPlan subscriptionExpiresAt")
      .limit(3)
      .lean();

    res.json({ ...servicePublic(service), related: related.map(servicePublic) });
  }),
);
