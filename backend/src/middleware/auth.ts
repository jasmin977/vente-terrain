import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export interface AuthUser {
  id: string;
  code: string;
  role: "ADMIN" | "VENDEUR";
}

interface JetonPayload extends AuthUser {
  /** Version de session au moment de la connexion (absente des anciens jetons = 0). */
  sv?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Données réservées à l'admin, retirées de TOUTES les réponses envoyées à un
// vendeur (articles, lignes de facture, historique, synchro…) : le prix
// d'achat ne doit pas quitter le serveur pour un vendeur.
const CHAMPS_ADMIN = new Set(["prixAchat"]);

function sansChampsAdmin(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(sansChampsAdmin);
  if (valeur && typeof valeur === "object" && !(valeur instanceof Date)) {
    // Decimal Prisma (et autres objets à toJSON) : sérialisés tels quels.
    if (typeof (valeur as { toJSON?: unknown }).toJSON === "function") return valeur;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valeur)) {
      if (!CHAMPS_ADMIN.has(k)) out[k] = sansChampsAdmin(v);
    }
    return out;
  }
  return valeur;
}

function masquerChampsAdmin(res: Response) {
  const json = res.json.bind(res);
  res.json = (body?: unknown) => json(sansChampsAdmin(body));
}

// Vérifie le jeton PUIS l'état du compte en base : un compte désactivé, ou dont
// le mot de passe a été changé (sessionVersion incrémentée), perd l'accès
// immédiatement au lieu d'attendre l'expiration du jeton. Le rôle est relu en
// base pour qu'un changement soit effectif tout de suite.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentification requise" });
  }
  const token = header.slice("Bearer ".length);
  let payload: JetonPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET as string) as JetonPayload;
  } catch {
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }
  try {
    const compte = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, code: true, role: true, actif: true, sessionVersion: true },
    });
    if (!compte || !compte.actif || compte.sessionVersion !== (payload.sv ?? 0)) {
      return res.status(401).json({ error: "Session expirée, reconnectez-vous" });
    }
    req.user = { id: compte.id, code: compte.code, role: compte.role };
    if (compte.role === "VENDEUR") masquerChampsAdmin(res);
    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Accès réservé à l'administrateur" });
  }
  next();
}
