import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

export const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const uploadSchema = z.object({
  dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/),
});

// Reçoit une photo prise via la caméra ou choisie dans la galerie (encodée en
// data URL côté mobile) et la sauvegarde sur le serveur pour qu'elle soit
// accessible par tous les appareils (admin et vendeurs), contrairement à un
// chemin de fichier local qui ne serait visible que sur le téléphone l'ayant pris.
uploadsRouter.post("/", (req, res) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Image invalide" });

  const match = parsed.data.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
  if (!match) return res.status(400).json({ error: "Image invalide" });
  const [, mime, base64] = match;
  const ext = EXT_BY_MIME[mime];

  const filename = `${randomUUID()}.${ext}`;
  writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(base64, "base64"));

  const url = `${req.protocol}://${req.get("host")}/uploads/${filename}`;
  res.status(201).json({ url });
});
