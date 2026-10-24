# Caisse (supermarché)

Application de caisse Windows (Electron) pour les sociétés de type **Supermarché**. Elle travaille hors ligne et
envoie ses tickets au serveur VenteTerrain dès qu'il répond.

## Mise en service d'un poste

1. Dans l'application de gestion (admin) : **Sociétés › Modifier › Type : Supermarché**.
2. **Réglages caisse › Postes de caisse** : ajouter la caisse, puis **Générer un code d'appairage** (6 chiffres, 15 min).
3. **Réglages caisse › Caissiers** : un code (4 à 6 chiffres) et des droits par caissier.
4. **Réglages caisse › Touches rapides** : familles et articles passés sans scanner.
5. Sur le PC de caisse : installer `release/Caisse Setup 1.0.0.exe`, saisir l'adresse du serveur et le code.

## Utilisation

- Connexion avec le code du caissier, fond de caisse à l'ouverture.
- Pensée pour un écran tactile et une douchette, sans clavier : pavé numérique et clavier à l'écran partout
  (recherche par nom, n° d'autorisation, comptage du tiroir, adresse du serveur).
- Scan à la douchette, touches rapides, **Rechercher** (nom), **Qté ×** pour la quantité du prochain article.
- Toucher une ligne du ticket : **− / Qté / + / Remise / Supprimer**.
- Avec un clavier branché, des raccourcis restent actifs (non affichés) : F2 quantité, F3 vérif prix, F4 encaisser,
  F5 espèces exact, F6 remise, F8 attente, F9 annuler la ligne, F11 plein écran.
- Règlements : espèces (monnaie rendue), carte (montant affiché en grand + n° d'autorisation obligatoire), chèque,
  ticket restaurant, bon d'achat, ou plusieurs à la fois.
- Retour client, prélèvement / apport, rapport X, clôture Z avec comptage du tiroir.
- Une action sans le droit demande le code d'un responsable.

Les promotions de la société (prix promo, 1 + 1, N + 1, 2ᵉ à −50 %, lot, article offert) s'appliquent seules.
Chaque vente sort du stock du dépôt (lots compris), chaque retour y revient.

## Données locales

`%APPDATA%\Caisse\donnees\` : configuration, session et ticket en cours, file d'envoi. Écritures atomiques avec une
copie `.bak` : une coupure de courant ne perd pas les tickets.

## Développement

```sh
npm install
npm run dev        # interface sur http://localhost:5180
npm run electron   # fenêtre Electron sur le serveur de dev
npm run dist       # installateur Windows dans release/
```

Si `npm run electron` démarre Node au lieu d'Electron, retirer la variable d'environnement `ELECTRON_RUN_AS_NODE`.
