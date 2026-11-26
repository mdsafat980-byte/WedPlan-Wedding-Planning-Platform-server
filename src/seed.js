import { ObjectId } from "mongodb";
import { hashPassword } from "better-auth/crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase, getDb } from "./db.js";
import { User } from "./models/User.js";
import { Service } from "./models/Service.js";
import { Booking } from "./models/Booking.js";
import { Transaction } from "./models/Transaction.js";

const img = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

const DEMO = {
  admin: {
    name: env.adminName || "WedPlan Admin",
    email: (env.adminEmail || "admin@wedplan.com").toLowerCase(),
    password: env.adminPassword || "Admin123",
    role: "admin",
  },
  vendor1: {
    name: "Amelia Hart",
    email: "vendor@wedplan.com",
    password: "Vendor123",
    role: "vendor",
    businessName: "Evergreen Events",
    phone: "+1 415 555 0134",
    bio: "Full-service wedding design studio creating timeless celebrations across Northern California.",
    image: img("photo-1494790108377-be9c29b29330"),
    subscriptionPlan: "premium",
    subscriptionExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  },
  vendor2: {
    name: "Priya Sen",
    email: "bloom@wedplan.com",
    password: "Vendor123",
    role: "vendor",
    businessName: "Bloom & Vine",
    phone: "+1 512 555 0198",
    bio: "Garden-inspired florals and bridal beauty for intimate weddings.",
    image: img("photo-1534528741775-53994a69daeb"),
    subscriptionPlan: "free",
    subscriptionExpiresAt: null,
  },
  vendor3: {
    name: "Marcus Reed",
    email: "golden@wedplan.com",
    password: "Vendor123",
    role: "vendor",
    businessName: "Golden Hour Studio",
    phone: "+1 312 555 0107",
    bio: "Catering and couture partners for celebrations with a modern edge.",
    image: img("photo-1507003211169-0a1dd7228f2d"),
    subscriptionPlan: "free",
    subscriptionExpiresAt: null,
  },
  customer1: {
    name: "Sofia Bennett",
    email: "customer@wedplan.com",
    password: "Customer123",
    role: "customer",
    phone: "+1 206 555 0177",
    image: img("photo-1517841905240-472988babdf9"),
    subscriptionPlan: "free",
    subscriptionExpiresAt: null,
  },
  customer2: {
    name: "Daniel Cho",
    email: "daniel@example.com",
    password: "Customer123",
    role: "customer",
    phone: "+1 646 555 0122",
    image: img("photo-1500648767791-00dcc994a43e"),
    subscriptionPlan: "free",
    subscriptionExpiresAt: null,
  },
};

async function upsertUser(db, data, { forcePassword = false } = {}) {
  const now = new Date();
  const email = data.email.toLowerCase();
  const existing = await db.collection("users").findOne({ email });
  const userId = existing?._id || new ObjectId();
  const doc = {
    name: data.name,
    email,
    emailVerified: true,
    image: data.image || "",
    role: data.role,
    isBlocked: existing?.isBlocked ?? false,
    businessName: data.businessName || "",
    phone: data.phone || "",
    bio: data.bio || "",
    subscriptionPlan: data.subscriptionPlan || "free",
    subscriptionExpiresAt: data.subscriptionExpiresAt || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (existing) {
    await db.collection("users").updateOne({ _id: userId }, { $set: doc });
  } else {
    await db.collection("users").insertOne({ _id: userId, ...doc });
  }

  const account = await db.collection("accounts").findOne({
    userId,
    providerId: "credential",
  });
  if (!account) {
    await db.collection("accounts").insertOne({
      _id: new ObjectId(),
      accountId: userId.toHexString(),
      providerId: "credential",
      userId,
      password: await hashPassword(data.password),
      createdAt: now,
      updatedAt: now,
    });
  } else if (forcePassword) {
    await db.collection("accounts").updateOne(
      { _id: account._id },
      { $set: { password: await hashPassword(data.password), updatedAt: now } },
    );
  }

  return userId;
}

const services = (v1, v2, v3) => [
  {
    vendorId: v1,
    serviceName: "The Glass Garden Estate",
    category: "Wedding Venues",
    description:
      "A light-filled glasshouse set among olive trees, with a private garden ceremony lawn, candlelit reception hall and a dedicated planning team for up to 180 guests.",
    price: 4800,
    location: "Sonoma, California",
    images: [img("photo-1519167758481-83f550bb49b3"), img("photo-1519225421980-715cb0215aed")],
    status: "approved",
    isActive: true,
  },
  {
    vendorId: v1,
    serviceName: "Golden Hour Wedding Films",
    category: "Photography & Videography",
    description:
      "Documentary-style photography and cinematic films with a calm, unobtrusive approach. Includes an engagement session, two photographers and a highlight film.",
    price: 2400,
    location: "Portland, Oregon",
    images: [img("photo-1519741497674-611481863552"), img("photo-1465495976277-4387d4b0b4c6")],
    status: "approved",
    isActive: true,
  },
  {
    vendorId: v1,
    serviceName: "Evergreen Ceremony Design",
    category: "Decoration & Florist",
    description:
      "A complete ceremony design package with a seasonal floral arch, aisle arrangements, welcome signage and a styled sweetheart table, installed and removed by our team.",
    price: 3200,
    location: "Napa Valley, California",
    images: [img("photo-1507504031003-b417219a0fde"), img("photo-1478146896981-b80fe463b330")],
    status: "approved",
    isActive: true,
  },
  {
    vendorId: v1,
    serviceName: "Candlelight Reception Styling",
    category: "Decoration & Florist",
    description:
      "Warm, romantic reception styling with taper candles, textured linens, brass accents and low garden florals. Designed for long tables of up to 80 guests.",
    price: 1850,
    location: "San Francisco, California",
    images: [img("photo-1464366400600-7168b8af9bc3"), img("photo-1519225421980-715cb0215aed")],
    status: "approved",
    isActive: true,
  },
  {
    vendorId: v1,
    serviceName: "Vineyard Sunset Elopement",
    category: "Wedding Venues",
    description:
      "An intimate vineyard elopement for up to 20 guests, including a sunset ceremony site, sparkling toast, grazing table and a two-night stay in the estate cottage.",
    price: 2900,
    location: "Healdsburg, California",
    images: [img("photo-1522673607200-164d1b6ce486")],
    status: "pending",
    isActive: true,
  },
  {
    vendorId: v2,
    serviceName: "Petals & Poetry Bouquets",
    category: "Decoration & Florist",
    description:
      "Romantic, garden-gathered bouquets and boutonnieres using seasonal blooms. Includes bridal bouquet, four bridesmaid bouquets and delivery on the wedding morning.",
    price: 850,
    location: "Austin, Texas",
    images: [img("photo-1507504031003-b417219a0fde"), img("photo-1478146896981-b80fe463b330")],
    status: "approved",
    isActive: true,
  },
  {
    vendorId: v2,
    serviceName: "Aster Bridal Beauty",
    category: "Makeup & Styling",
    description:
      "Soft, luminous bridal makeup and a relaxed styling session at your venue. Includes a trial, lashes and touch-up kit for the full wedding day.",
    price: 680,
    location: "Miami, Florida",
    images: [img("photo-1522337360788-8b13dee7a37e"), img("photo-1487412947147-5cebf100ffc2")],
    status: "approved",
    isActive: true,
  },
  {
    vendorId: v2,
    serviceName: "Bloom Bar Floral Workshop",
    category: "Decoration & Florist",
    description:
      "A guided flower bar for welcome parties and bridal showers. Guests build their own arrangements while our florists style the space and keep the blooms flowing.",
    price: 1200,
    location: "Austin, Texas",
    images: [img("photo-1478146896981-b80fe463b330")],
    status: "pending",
    isActive: true,
  },
  {
    vendorId: v3,
    serviceName: "The Velvet Table Catering",
    category: "Catering Services",
    description:
      "Seasonal, produce-led wedding catering with family-style service, dietary accommodations and a dedicated captain. Price shown is per guest for a four-course menu.",
    price: 92,
    location: "New York, New York",
    images: [img("photo-1555244162-803834f70033"), img("photo-1464366400600-7168b8af9bc3")],
    status: "approved",
    isActive: true,
  },
  {
    vendorId: v3,
    serviceName: "Maison Alan Bridal Couture",
    category: "Wedding Fashion",
    description:
      "Modern bridal tailoring with private appointments, hand-finished alterations and a curated selection of silk gowns and occasion wear.",
    price: 1200,
    location: "Chicago, Illinois",
    images: [img("photo-1594552072238-b8a33785b261"), img("photo-1546032996-6dfacbacbf3f")],
    status: "approved",
    isActive: true,
  },
  {
    vendorId: v3,
    serviceName: "Rustic Barn Celebration",
    category: "Wedding Venues",
    description:
      "A restored timber barn with string lights and a courtyard for relaxed country weddings. Listing pending review while insurance documents are updated.",
    price: 2200,
    location: "Hudson Valley, New York",
    images: [img("photo-1515934751635-c81c6bc9a2d8")],
    status: "rejected",
    isActive: false,
    rejectionReason: "Please upload current venue insurance and capacity documentation.",
  },
];

export async function seedDatabase({ reset = false, silent = false, adminOnly = false } = {}) {
  const db = getDb();
  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  if (reset && !adminOnly) {
    await Promise.all(
      ["users", "sessions", "accounts", "verifications", "jwks", "services", "bookings", "transactions"].map(
        (name) => db.collection(name).deleteMany({}).catch(() => null),
      ),
    );
    log("[seed] cleared existing collections");
  }

  const adminId = await upsertUser(db, DEMO.admin, { forcePassword: true });

  if (adminOnly) {
    log(`[seed] admin account ready: ${DEMO.admin.email}`);
    return { adminId };
  }

  const v1 = await upsertUser(db, DEMO.vendor1);
  const v2 = await upsertUser(db, DEMO.vendor2);
  const v3 = await upsertUser(db, DEMO.vendor3);
  const c1 = await upsertUser(db, DEMO.customer1);
  const c2 = await upsertUser(db, DEMO.customer2);

  let serviceDocs = await Service.find().select("_id serviceName").lean();
  if (serviceDocs.length === 0) {
    serviceDocs = await Service.insertMany(services(v1, v2, v3));
    log(`[seed] inserted ${serviceDocs.length} services`);
  }

  const byName = (name) => serviceDocs.find((service) => service.serviceName === name);
  const bookingCount = await Booking.countDocuments();
  if (bookingCount === 0) {
    const day = (offset) => {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() + offset);
      return date;
    };
    await Booking.insertMany([
      {
        serviceId: byName("The Glass Garden Estate")._id,
        vendorId: v1,
        customerId: c1,
        eventDate: day(30),
        eventLocation: "Sonoma, California",
        message: "We would love a garden ceremony at 4pm followed by dinner in the glasshouse.",
        status: "accepted",
      },
      {
        serviceId: byName("Petals & Poetry Bouquets")._id,
        vendorId: v2,
        customerId: c1,
        eventDate: day(45),
        eventLocation: "Austin, Texas",
        message: "Soft blush and cream tones please. No lilies.",
        status: "pending",
      },
      {
        serviceId: byName("The Velvet Table Catering")._id,
        vendorId: v3,
        customerId: c1,
        eventDate: day(60),
        eventLocation: "New York, New York",
        message: "80 guests, with vegetarian and gluten-free options.",
        status: "rejected",
      },
      {
        serviceId: byName("Golden Hour Wedding Films")._id,
        vendorId: v1,
        customerId: c2,
        eventDate: day(20),
        eventLocation: "Portland, Oregon",
        message: "Looking for a documentary style with a 5 minute highlight film.",
        status: "pending",
      },
      {
        serviceId: byName("Maison Alan Bridal Couture")._id,
        vendorId: v3,
        customerId: c2,
        eventDate: day(90),
        eventLocation: "Chicago, Illinois",
        message: "Initial fitting appointment for a custom silk gown.",
        status: "cancelled",
      },
    ]);
    log("[seed] inserted demo bookings");
  }

  if ((await Transaction.countDocuments()) === 0) {
    await Transaction.create([
      {
        vendorId: v1,
        plan: "premium",
        amount: 4900,
        currency: "usd",
        stripeSessionId: "seed_checkout_premium_evergreen",
        stripeSubscriptionId: "seed_sub_evergreen",
        status: "paid",
        paidAt: new Date(),
      },
      {
        vendorId: v2,
        plan: "premium",
        amount: 4900,
        currency: "usd",
        stripeSessionId: "seed_checkout_expired_bloom",
        status: "expired",
      },
    ]);
    log("[seed] inserted demo transactions");
  }

  // Keep the premium demo vendor active.
  await User.findByIdAndUpdate(v1, {
    subscriptionPlan: "premium",
    subscriptionExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  });

  log("[seed] demo accounts:");
  log(`  admin    ${DEMO.admin.email} / ${DEMO.admin.password}`);
  log(`  vendor   ${DEMO.vendor1.email} / ${DEMO.vendor1.password} (premium)`);
  log(`  vendor   ${DEMO.vendor2.email} / ${DEMO.vendor2.password} (free)`);
  log(`  customer ${DEMO.customer1.email} / ${DEMO.customer1.password}`);

  return { adminId, v1, v2, v3, c1, c2 };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  connectDatabase()
    .then(() => seedDatabase({ reset: process.argv.includes("--reset") }))
    .then(() => disconnectDatabase())
    .then(() => process.exit(0))
    .catch(async (error) => {
      console.error("[seed] failed:", error);
      await disconnectDatabase().catch(() => null);
      process.exit(1);
    });
}
