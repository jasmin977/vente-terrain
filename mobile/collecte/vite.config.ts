import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";

// Application « Collecte » du PDA : projet à part (sa propre page, son propre APK).
// Le PDA est sous Android 9 : son navigateur intégré peut être ancien, d'où le build « legacy ».
export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react(), legacy({ targets: ["chrome >= 61", "android >= 7"] })],
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5174 },
});
