// Processus principal de la caisse (Electron) : fenêtre plein écran, stockage local des données (fichiers JSON
// écrits de façon atomique dans le dossier de l'application) et impression des tickets sur l'imprimante Windows.
const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const DEV_URL = process.env.CAISSE_DEV_URL;
const DOSSIER = path.join(app.getPath("userData"), "donnees");
const CLE_VALIDE = /^[a-z0-9-]{1,40}$/;

// Une seule caisse ouverte à la fois sur le PC (deux fenêtres écriraient les mêmes fichiers).
if (!app.requestSingleInstanceLock()) app.quit();

let fenetre = null;

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 640,
    fullscreen: !DEV_URL,
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
    title: "Caisse",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  if (DEV_URL) fenetre.loadURL(DEV_URL);
  else fenetre.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  // Pas de navigation ni de nouvelle fenêtre : un lien externe s'ouvre dans le navigateur.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  fenetre.webContents.on("will-navigate", (e, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) e.preventDefault();
  });
  fenetre.webContents.on("before-input-event", (_e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") fenetre.setFullScreen(!fenetre.isFullScreen());
    if (DEV_URL && input.control && input.shift && input.key.toLowerCase() === "i") fenetre.webContents.toggleDevTools();
  });
  fenetre.on("closed", () => (fenetre = null));
}

app.on("second-instance", () => {
  if (fenetre) {
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.focus();
  }
});

app.whenReady().then(() => {
  fs.mkdirSync(DOSSIER, { recursive: true });
  creerFenetre();
});
app.on("window-all-closed", () => app.quit());

// ---------------------------------------------------------------- Stockage local

const fichier = (cle) => {
  if (!CLE_VALIDE.test(cle)) throw new Error("Clé de stockage invalide");
  return path.join(DOSSIER, `${cle}.json`);
};

ipcMain.handle("stockage:lire", (_e, cle) => {
  const f = fichier(cle);
  for (const candidat of [f, `${f}.bak`]) {
    try {
      return JSON.parse(fs.readFileSync(candidat, "utf8"));
    } catch {
      // absent ou illisible : on essaie la copie précédente
    }
  }
  return null;
});

// Écriture atomique : fichier temporaire écrit et vidé sur le disque, puis renommé. L'ancienne version est gardée
// en .bak : une coupure de courant pendant l'écriture ne perd jamais les tickets.
ipcMain.handle("stockage:ecrire", (_e, cle, valeur) => {
  const f = fichier(cle);
  const tmp = `${f}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, JSON.stringify(valeur));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (fs.existsSync(f)) fs.copyFileSync(f, `${f}.bak`);
  fs.renameSync(tmp, f);
  return true;
});

// ---------------------------------------------------------------- Application

ipcMain.handle("app:info", () => ({ version: app.getVersion(), dossier: DOSSIER, dev: Boolean(DEV_URL) }));
ipcMain.handle("app:quitter", () => app.quit());
ipcMain.handle("app:pleinEcran", () => {
  if (fenetre) fenetre.setFullScreen(!fenetre.isFullScreen());
});

// ---------------------------------------------------------------- Impression

ipcMain.handle("impression:imprimantes", async () => {
  if (!fenetre) return [];
  const liste = await fenetre.webContents.getPrintersAsync();
  return liste.map((p) => ({ nom: p.name, parDefaut: Boolean(p.isDefault) }));
});

// Ticket (HTML 80 mm) imprimé sans boîte de dialogue sur l'imprimante choisie (sinon celle par défaut).
ipcMain.handle("impression:imprimer", async (_e, html, imprimante) => {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await new Promise((resolve) => {
      w.webContents.print(
        { silent: true, printBackground: true, deviceName: imprimante || undefined, margins: { marginType: "none" } },
        (ok, raison) => resolve(ok ? { ok: true } : { ok: false, erreur: raison || "Impression impossible" }),
      );
    });
  } finally {
    setTimeout(() => w.destroy(), 1000);
  }
});
