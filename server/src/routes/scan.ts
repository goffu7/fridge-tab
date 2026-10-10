import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { readReceipt } from "../ai/receipt";
import { HttpError } from "../http";

export const scan = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const limit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 40, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many scans. Wait a few minutes." } });

scan.post("/", limit, upload.single("image"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "Attach a receipt photo.");
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(req.file.mimetype)) throw new HttpError(400, "Use a JPG, PNG, WebP or HEIC photo.");
  res.json(await readReceipt(req.file.buffer, req.file.mimetype));
});
