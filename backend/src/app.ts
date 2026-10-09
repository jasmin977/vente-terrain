import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { authRouter } from "./routes/auth";
import { articlesRouter } from "./routes/articles";
import { clientsRouter } from "./routes/clients";
import { facturesRouter } from "./routes/factures";
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

export const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/uploads", express.static(UPLOADS_DIR));

app.use("/api/auth", authRouter);
app.use("/api/articles", articlesRouter);
app.use("/api/clients", clientsRouter);
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

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erreur serveur" });
});
