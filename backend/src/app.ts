import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { authRouter } from "./routes/auth";
import { articlesRouter } from "./routes/articles";
import { clientsRouter } from "./routes/clients";
import { facturesRouter } from "./routes/factures";
import { facturesVenteRouter } from "./routes/facturesVente";
import { stockRouter } from "./routes/stock";
import { stockHistoriqueRouter } from "./routes/stockHistorique";
import { inventairesRouter } from "./routes/inventaires";
import { retoursRouter } from "./routes/retours";
import { paiementsRouter } from "./routes/paiements";
import { creditsRouter } from "./routes/credits";
import { visitesRouter } from "./routes/visites";
import { rapportsRouter } from "./routes/rapports";
import { tableauDeBordRouter } from "./routes/tableauDeBord";
import { syncRouter } from "./routes/sync";
import { uploadsRouter, UPLOADS_DIR } from "./routes/uploads";
import { societesRouter } from "./routes/societes";
import { comptesBancairesRouter } from "./routes/comptesBancaires";
import { pdaRouter } from "./routes/pda";
import { promotionsRouter } from "./routes/promotions";
import { caisseRouter } from "./routes/caisse";
import { caisseAdminRouter } from "./routes/caisseAdmin";
import { categoriesRouter } from "./routes/categories";
import { entrepotRouter } from "./routes/entrepot";
import { notificationsRouter } from "./routes/notifications";
import { fournisseursRouter } from "./routes/fournisseurs";
import { achatsRouter } from "./routes/achats";
import { depensesRouter } from "./routes/depenses";
import { collectesRouter } from "./routes/collectes";
import { journauxRouter } from "./routes/journaux";
import { reglementsFournisseursRouter } from "./routes/reglementsFournisseurs";

export const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/uploads", express.static(UPLOADS_DIR));

app.use("/api/auth", authRouter);
app.use("/api/articles", articlesRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/factures-vente", facturesVenteRouter);
app.use("/api/factures", facturesRouter);
app.use("/api/stock", stockRouter);
app.use("/api/stock", stockHistoriqueRouter);
app.use("/api/inventaires", inventairesRouter);
app.use("/api/retours", retoursRouter);
app.use("/api/paiements", paiementsRouter);
app.use("/api/credits", creditsRouter);
app.use("/api/visites", visitesRouter);
app.use("/api/rapports", rapportsRouter);
app.use("/api/tableau-de-bord", tableauDeBordRouter);
app.use("/api/sync", syncRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/societes", societesRouter);
app.use("/api/comptes-bancaires", comptesBancairesRouter);
// Scan Stock (dépôt) : sans compte, réseau local seulement.
app.use("/api/pda", pdaRouter);
app.use("/api/promotions", promotionsRouter);
// Supermarché : application de caisse (clé de caisse) et réglages de l'admin.
app.use("/api/caisse", caisseRouter);
app.use("/api/caisse-admin", caisseAdminRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/entrepot", entrepotRouter);
app.use("/api/fournisseurs", fournisseursRouter);
app.use("/api/achats", achatsRouter);
app.use("/api/depenses", depensesRouter);
app.use("/api/collectes", collectesRouter);
app.use("/api/journaux", journauxRouter);
app.use("/api/reglements-fournisseurs", reglementsFournisseursRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erreur serveur" });
});
