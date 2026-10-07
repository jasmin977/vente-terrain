import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";
import { prochainNumeroFacture } from "../utils/numero";

export interface LigneFactureInput {
  articleId: string;
  quantite: number;
  prixUnitaire: number;
  tauxTva: number;
}

export interface CreerFactureInput {
  id?: string;
  numero?: string;
  clientId: string;
  date?: Date;
  typeVente: "COMPTANT" | "CREDIT";
  modePaiement?: "ESPECES" | "CHEQUE" | "VIREMENT" | "TPE";
  latitude?: number;
  longitude?: number;
  lignes: LigneFactureInput[];
}

// Logique unique de création de facture, partagée entre la route REST directe
// (routes/factures.ts) et la synchronisation en masse (routes/sync.ts) afin que
// la décrémentation du stock camion et le calcul des totaux restent cohérents
// quel que soit le chemin d'entrée (facture créée en ligne ou rejouée depuis le
// mobile après une période hors-connexion).
export async function creerFacture(vendeurId: string, data: CreerFactureInput) {
  if (data.id) {
    const existing = await prisma.facture.findUnique({ where: { id: data.id } });
    if (existing) return existing;
  }

  const articleIds = data.lignes.map((l) => l.articleId);
  const articles = await prisma.article.findMany({ where: { id: { in: articleIds } } });
  const articleMap = new Map(articles.map((a) => [a.id, a]));

  let montantHT = 0;
  let montantTVA = 0;
  const lignesCalc = data.lignes.map((l) => {
    const article = articleMap.get(l.articleId);
    if (!article) throw new Error(`Article ${l.articleId} introuvable`);
    const ht = l.quantite * l.prixUnitaire;
    const tva = (ht * l.tauxTva) / 100;
    montantHT += ht;
    montantTVA += tva;
    return { ...l, montantHT: ht, montantTTC: ht + tva };
  });
  const montantTTC = montantHT + montantTVA;

  // Deux factures simultanées du même vendeur peuvent viser le même numéro
  // séquentiel : la contrainte d'unicité refuse la seconde, on rejoue alors la
  // transaction entière (Postgres l'a annulée) avec le numéro suivant.
  for (let essai = 1; ; essai++) {
    try {
      return await creerDansTransaction();
    } catch (err) {
      const conflitNumero =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        String(err.meta?.target ?? "").includes("numero");
      if (!conflitNumero || data.numero || essai >= 5) throw err;
    }
  }

  function creerDansTransaction() {
  return prisma.$transaction(async (tx) => {
    // La vente n'est jamais bloquée par le stock théorique du camion : le
    // vendeur ne le connaît pas et le stock réel prime. Le stock camion peut
    // donc devenir négatif ; l'inventaire fait apparaître l'écart à l'admin.
    for (const l of data.lignes) {
      await tx.stockCamion.upsert({
        where: { vendeurId_articleId: { vendeurId, articleId: l.articleId } },
        create: { vendeurId, articleId: l.articleId, quantite: -l.quantite },
        update: { quantite: { decrement: l.quantite } },
      });
    }

    const vendeur = await tx.user.findUniqueOrThrow({ where: { id: vendeurId } });
    const created = await tx.facture.create({
      data: {
        id: data.id,
        numero: data.numero ?? (await prochainNumeroFacture(tx, vendeur.code, data.date ?? new Date())),
        clientId: data.clientId,
        vendeurId,
        date: data.date ?? new Date(),
        typeVente: data.typeVente,
        modePaiement: data.typeVente === "COMPTANT" ? data.modePaiement : null,
        montantHT,
        montantTVA,
        montantTTC,
        latitude: data.latitude,
        longitude: data.longitude,
        lignes: {
          create: lignesCalc.map((l) => ({
            articleId: l.articleId,
            quantite: l.quantite,
            prixUnitaire: l.prixUnitaire,
            tauxTva: l.tauxTva,
            montantHT: l.montantHT,
            montantTTC: l.montantTTC,
          })),
        },
      },
      // vendeur : imprimé sur le ticket juste après la vente.
      include: { lignes: { include: { article: true } }, client: true, vendeur: { select: { id: true, nom: true, code: true } } },
    });

    // Historique camion : la vente porte le numéro de facture et le client.
    for (const l of data.lignes) {
      await tx.mouvementStock.create({
        data: {
          vendeurId,
          articleId: l.articleId,
          sens: "VENTE",
          quantite: l.quantite,
          date: created.date,
          reference: `${created.numero} · ${created.client.nomCommerce}`,
        },
      });
    }

    if (data.typeVente === "COMPTANT" && data.modePaiement) {
      await tx.paiement.create({
        data: {
          clientId: data.clientId,
          factureId: created.id,
          vendeurId,
          montant: montantTTC,
          mode: data.modePaiement,
          date: created.date,
        },
      });
    }

    if (data.latitude !== undefined && data.longitude !== undefined) {
      await tx.visite.create({
        data: {
          vendeurId,
          clientId: data.clientId,
          latitude: data.latitude,
          longitude: data.longitude,
          date: created.date,
        },
      });
    }

    return created;
  });
  }
}
