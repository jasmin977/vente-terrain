import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Interface de la caisse : chargée par Electron depuis dist/ (chemins relatifs) ; en développement, servie sur 5180.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5180, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true, target: "chrome120" },
});
