// Service worker minimal : rend l'application installable (« Ajouter à l'écran d'accueil » / « Installer »).
// Il ne met rien en cache : les données viennent toujours du serveur, et le mode hors ligne
// des vendeurs est géré par l'application elle-même (file d'actions, copies locales du catalogue).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
