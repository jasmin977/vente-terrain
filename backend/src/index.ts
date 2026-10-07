import "dotenv/config";
import "./fuseau";
import { app } from "./app";

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(port, () => {
  console.log(`API vente terrain démarrée sur http://localhost:${port}`);
});
