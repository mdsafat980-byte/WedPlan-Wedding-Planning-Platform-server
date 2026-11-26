import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { asyncHandler, HttpError } from "../middleware/error.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.resolve(__dirname, "../../uploads");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) {
      return cb(new HttpError(400, "Only JPG, PNG, WEBP or GIF images are allowed"));
    }
    cb(null, true);
  },
});

// Lightweight in-memory rate limit for the public upload endpoint.
const hits = new Map();
function rateLimit(req, _res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const entry = hits.get(key) || { count: 0, reset: now + 60_000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + 60_000;
  }
  entry.count += 1;
  hits.set(key, entry);
  if (entry.count > 30) {
    return next(new HttpError(429, "Too many uploads. Please try again in a minute."));
  }
  next();
}

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

async function uploadToImgbb(file) {
  const body = new URLSearchParams({
    image: file.buffer.toString("base64"),
    name: `wedplan-${randomUUID()}`,
  });
  const response = await fetch(`https://api.imgbb.com/1/upload?key=${env.imgbbApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.data?.url) {
    throw new HttpError(502, payload?.error?.message || "Image hosting service rejected the upload");
  }
  return payload.data.display_url || payload.data.url;
}

export const uploadRouter = Router();

uploadRouter.post(
  "/",
  rateLimit,
  upload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Please choose an image file to upload");

    if (env.imgbbApiKey) {
      const url = await uploadToImgbb(req.file);
      return res.status(201).json({ url });
    }

    // Local fallback keeps the whole flow testable without an ImgBB key.
    await mkdir(uploadsDir, { recursive: true });
    const extension = EXTENSIONS[req.file.mimetype] || "jpg";
    const filename = `${Date.now()}-${randomUUID()}.${extension}`;
    await writeFile(path.join(uploadsDir, filename), req.file.buffer);
    return res.status(201).json({ url: `${env.publicServerUrl}/uploads/${filename}` });
  }),
);
