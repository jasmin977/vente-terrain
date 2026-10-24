// Pont entre l'interface de la caisse et le processus principal : seulement ces fonctions sont exposées.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("caisseApp", {
  lire: (cle) => ipcRenderer.invoke("stockage:lire", cle),
  ecrire: (cle, valeur) => ipcRenderer.invoke("stockage:ecrire", cle, valeur),
  info: () => ipcRenderer.invoke("app:info"),
  quitter: () => ipcRenderer.invoke("app:quitter"),
  pleinEcran: () => ipcRenderer.invoke("app:pleinEcran"),
  imprimantes: () => ipcRenderer.invoke("impression:imprimantes"),
  imprimer: (html, imprimante) => ipcRenderer.invoke("impression:imprimer", html, imprimante),
});
