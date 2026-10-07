import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";

export const authRouter = Router();

const loginSchema = z.object({
  code: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Code et mot de passe requis" });
  }
  const { code, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { code } });
  if (!user || !user.actif) {
    return res.status(401).json({ error: "Identifiants invalides" });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Identifiants invalides" });
  }

  // sv = version de session : voir requireAuth (déconnexion à la désactivation
  // ou au changement de mot de passe).
  const token = jwt.sign(
    { id: user.id, code: user.code, role: user.role, sv: user.sessionVersion },
    process.env.JWT_SECRET as string,
    { expiresIn: (process.env.JWT_EXPIRES_IN || "12h") as jwt.SignOptions["expiresIn"] }
  );

  res.json({
    token,
    user: { id: user.id, code: user.code, nom: user.nom, role: user.role },
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
  res.json({ id: user.id, code: user.code, nom: user.nom, role: user.role, telephone: user.telephone });
});

// ---------------------------------------------------------------- Gestion des comptes (admin)
// Module 10 - Administration : l'admin crée et gère les comptes vendeurs. Un
// compte n'est jamais supprimé (factures, stock et inventaires y sont liés) :
// il est désactivé, ce qui bloque la connexion et le retire des listes.

const userSelect = {
  id: true,
  code: true,
  nom: true,
  email: true,
  telephone: true,
  role: true,
  actif: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const MOT_DE_PASSE_MIN = 4;

// Champs texte facultatifs : une chaîne vide efface la valeur.
const optionnel = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const createUserSchema = z.object({
  code: z.string().trim().min(1, "Code requis").max(30),
  nom: z.string().trim().min(1, "Nom requis").max(120),
  email: optionnel.refine((v) => !v || z.string().email().safeParse(v).success, "Email invalide"),
  telephone: optionnel,
  password: z.string().min(MOT_DE_PASSE_MIN, `Mot de passe : ${MOT_DE_PASSE_MIN} caractères minimum`),
  role: z.enum(["ADMIN", "VENDEUR"]).default("VENDEUR"),
});

const updateUserSchema = z.object({
  code: z.string().trim().min(1, "Code requis").max(30).optional(),
  nom: z.string().trim().min(1, "Nom requis").max(120).optional(),
  email: optionnel.refine((v) => !v || z.string().email().safeParse(v).success, "Email invalide"),
  telephone: optionnel,
  actif: z.boolean().optional(),
});

const passwordSchema = z.object({
  password: z.string().min(MOT_DE_PASSE_MIN, `Mot de passe : ${MOT_DE_PASSE_MIN} caractères minimum`),
});

// Premier message d'erreur de validation, lisible tel quel dans l'app.
const premiereErreur = (err: z.ZodError) => err.issues[0]?.message ?? "Données invalides";

function erreurUnicite(res: Response, err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const champ = String((err.meta?.target as string[] | undefined)?.[0] ?? "");
    return res
      .status(409)
      .json({ error: champ === "email" ? "Cet email est déjà utilisé par un autre compte" : "Ce code est déjà utilisé par un autre compte" });
  }
  console.error(err);
  return res.status(500).json({ error: "Erreur serveur" });
}

authRouter.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({ select: userSelect, orderBy: { nom: "asc" } });
  res.json(users);
});

authRouter.get("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
  if (!user) return res.status(404).json({ error: "Compte introuvable" });
  res.json(user);
});

authRouter.post("/users", requireAuth, requireAdmin, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: premiereErreur(parsed.error) });
  const { password, ...rest } = parsed.data;
  try {
    const user = await prisma.user.create({
      data: { ...rest, passwordHash: await bcrypt.hash(password, 10) },
      select: userSelect,
    });
    res.status(201).json(user);
  } catch (err) {
    erreurUnicite(res, err);
  }
});

authRouter.put("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: premiereErreur(parsed.error) });
  const data = parsed.data;
  if (req.params.id === req.user!.id && data.actif === false) {
    return res.status(400).json({ error: "Vous ne pouvez pas désactiver votre propre compte" });
  }
  try {
    const existant = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existant) return res.status(404).json({ error: "Compte introuvable" });
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...data,
        // Désactivation : les sessions ouvertes sont coupées immédiatement.
        ...(data.actif === false && existant.actif ? { sessionVersion: { increment: 1 } } : {}),
      },
      select: userSelect,
    });
    res.json(user);
  } catch (err) {
    erreurUnicite(res, err);
  }
});

// Nouveau mot de passe défini par l'admin ; le vendeur est déconnecté de ses
// appareils et devra utiliser le nouveau mot de passe.
authRouter.post("/users/:id/password", requireAuth, requireAdmin, async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: premiereErreur(parsed.error) });
  try {
    const existant = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existant) return res.status(404).json({ error: "Compte introuvable" });
    await prisma.user.update({
      where: { id: req.params.id },
      data: {
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
        // Pas de déconnexion forcée quand l'admin change son propre mot de passe.
        ...(req.params.id !== req.user!.id ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
