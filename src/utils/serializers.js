import { env } from "../config/env.js";

/** A vendor only counts as premium while the paid period is still valid. */
export function isPremium(user) {
  if (!user || user.subscriptionPlan !== "premium") return false;
  if (!user.subscriptionExpiresAt) return true;
  return new Date(user.subscriptionExpiresAt).getTime() > Date.now();
}

export function effectivePlan(user) {
  return isPremium(user) ? "premium" : "free";
}

export const FREE_ACTIVE_SERVICE_LIMIT = 3;

export function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function absoluteImageUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  return `${env.publicServerUrl}${value.startsWith("/") ? "" : "/"}${value}`;
}

export function servicePublic(service) {
  if (!service) return null;
  const vendor = service.vendorId;
  const vendorDoc = vendor && typeof vendor === "object" && vendor.name !== undefined ? vendor : null;
  return {
    id: String(service._id),
    serviceName: service.serviceName,
    category: service.category,
    description: service.description,
    price: service.price,
    location: service.location,
    images: (service.images || []).map(absoluteImageUrl),
    status: service.status,
    isActive: service.isActive,
    rejectionReason: service.rejectionReason || "",
    vendor: vendorDoc
      ? {
          id: String(vendorDoc._id),
          name: vendorDoc.name,
          businessName: vendorDoc.businessName || vendorDoc.name,
          image: absoluteImageUrl(vendorDoc.image || ""),
          isPremium: isPremium(vendorDoc),
        }
      : vendor
        ? { id: String(vendor) }
        : null,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  };
}

export function bookingPublic(booking) {
  if (!booking) return null;
  const service = booking.serviceId;
  const customer = booking.customerId;
  const vendor = booking.vendorId;
  const asDoc = (value) => (value && typeof value === "object" && value.name !== undefined ? value : null);
  const serviceDoc = service && typeof service === "object" && service.serviceName !== undefined ? service : null;
  const customerDoc = asDoc(customer);
  const vendorDoc = asDoc(vendor);
  return {
    id: String(booking._id),
    serviceId: serviceDoc ? String(serviceDoc._id) : String(service),
    vendorId: vendorDoc ? String(vendorDoc._id) : String(vendor),
    customerId: customerDoc ? String(customerDoc._id) : String(customer),
    eventDate: booking.eventDate,
    eventLocation: booking.eventLocation,
    message: booking.message || "",
    status: booking.status,
    createdAt: booking.createdAt,
    service: serviceDoc
      ? {
          id: String(serviceDoc._id),
          serviceName: serviceDoc.serviceName,
          category: serviceDoc.category,
          price: serviceDoc.price,
          location: serviceDoc.location,
          images: (serviceDoc.images || []).map(absoluteImageUrl),
        }
      : null,
    customer: customerDoc
      ? {
          id: String(customerDoc._id),
          name: customerDoc.name,
          email: customerDoc.email,
          image: absoluteImageUrl(customerDoc.image || ""),
        }
      : null,
    vendor: vendorDoc
      ? {
          id: String(vendorDoc._id),
          name: vendorDoc.name,
          businessName: vendorDoc.businessName || vendorDoc.name,
          image: absoluteImageUrl(vendorDoc.image || ""),
          isPremium: isPremium(vendorDoc),
        }
      : null,
  };
}
