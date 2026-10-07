import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

export const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

// En production (Vercel), le disque n'est pas persistant : les photos vont dans
// Vercel Blob dès que BLOB_READ_WRITE_TOKEN est défini. En local, sur le disque.
const blobActif = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

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
uploadsRouter.post("/", async (req, res) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Image invalide" });

  const match = parsed.data.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
  if (!match) return res.status(400).json({ error: "Image invalide" });
  const [, mime, base64] = match;
  const ext = EXT_BY_MIME[mime];

  const filename = `${randomUUID()}.${ext}`;
  const contenu = Buffer.from(base64, "base64");

  if (blobActif) {
    try {
      const blob = await put(`articles/${filename}`, contenu, { access: "public", contentType: mime });
      return res.status(201).json({ url: blob.url });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Échec de l'envoi de la photo" });
    }
  }

  mkdirSync(UPLOADS_DIR, { recursive: true });
  writeFileSync(path.join(UPLOADS_DIR, filename), contenu);
  const url = `${req.protocol}://${req.get("host")}/uploads/${filename}`;
  res.status(201).json({ url });
});
