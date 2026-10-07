// Point d'entrée Vercel : l'application Express sert toutes les routes
// (voir vercel.json). En local, c'est src/index.ts qui lance le serveur.
import "../src/fuseau";
import { app } from "../src/app";

export default app;
