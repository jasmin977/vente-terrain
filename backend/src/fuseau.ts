// Les bornes « aujourd'hui / ce mois » calculées côté serveur suivent l'heure de
// Tunis, même sur un hébergeur réglé en UTC (Vercel). À importer en premier.
process.env.TZ = process.env.APP_TIMEZONE || "Africa/Tunis";

export {};
