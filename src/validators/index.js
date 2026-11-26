import { z } from "zod";
import { SERVICE_CATEGORIES, SERVICE_STATUSES } from "../models/Service.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");
const imageUrl = z.string().min(1, "Image is required").max(2048);

export const serviceInput = z.object({
  serviceName: z.string().trim().min(3, "Service name must be at least 3 characters").max(120),
  category: z.enum(SERVICE_CATEGORIES),
  description: z.string().trim().min(30, "Description must be at least 30 characters").max(5000),
  price: z.coerce.number().min(0, "Price cannot be negative").max(10_000_000),
  location: z.string().trim().min(2, "Location is required").max(160),
  images: z.array(imageUrl).min(1, "At least one service image is required").max(8),
});

export const serviceQuery = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  location: z.string().trim().max(120).optional(),
  sort: z.enum(["newest", "oldest", "price_asc", "price_desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(24).optional(),
});

export const bookingInput = z.object({
  serviceId: objectId,
  eventDate: z
    .string()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "Event date is invalid")
    .refine((value) => new Date(value).getTime() >= Date.now() - 60_000, "Event date must be in the future"),
  eventLocation: z.string().trim().min(3, "Event location is required").max(200),
  message: z.string().trim().max(1500).optional().default(""),
});

export const bookingAction = z.object({
  status: z.enum(["accepted", "rejected"]),
});

export const profileInput = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80).optional(),
  image: z.string().max(2048).optional(),
  businessName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  bio: z.string().trim().max(600).optional(),
});

export const blockInput = z.object({
  isBlocked: z.boolean(),
});

export const adminServiceInput = z
  .object({
    status: z.enum(SERVICE_STATUSES).optional(),
    isActive: z.boolean().optional(),
    rejectionReason: z.string().trim().max(400).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const availabilityInput = z.object({
  isActive: z.boolean(),
});

export const idParam = z.object({ id: objectId });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
