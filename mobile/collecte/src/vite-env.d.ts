/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Adresse du serveur proposée à la première connexion (ex. http://10.0.0.139:3000). */
  readonly VITE_SERVEUR_COLLECTE?: string;
}
