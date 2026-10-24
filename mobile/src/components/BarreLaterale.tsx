import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { IonIcon } from "@ionic/react";
import {
  alertCircleOutline,
  arrowUndoOutline,
  barChartOutline,
  business,
  businessOutline,
  carOutline,
  cart,
  cartOutline,
  cashOutline,
  chevronDown,
  clipboard,
  clipboardOutline,
  cube,
  cubeOutline,
  documentText,
  documentTextOutline,
  enterOutline,
  exitOutline,
  folderOpenOutline,
  layers,
  layersOutline,
  listOutline,
  peopleCircle,
  pricetags,
  pricetagsOutline,
  peopleCircleOutline,
  people,
  peopleOutline,
  print,
  printOutline,
  receipt,
  receiptOutline,
  statsChart,
  statsChartOutline,
  storefront,
  storefrontOutline,
  swapHorizontalOutline,
  walletOutline,
  wallet,
  cardOutline,
  calculator,
  calculatorOutline,
  desktopOutline,
  gridOutline,
  lockClosedOutline,
  personCircleOutline,
  settings,
  settingsOutline,
} from "ionicons/icons";
import SocieteLogo from "./SocieteLogo";
import { useAuth } from "../auth/AuthContext";
import { useSociete } from "../societe/SocieteContext";
import { t } from "../i18n";

interface SousEntree {
  /** Valeur du paramètre d'adresse (?lieu=…, ?vue=…) que choisit cette entrée. */
  valeur: string;
  label: string;
  icon: string;
  /** Écran à part (au lieu d'un paramètre d'adresse), ex. le plan 3D du dépôt. */
  chemin?: string;
  /** Adresse complète de la sous-entrée (ex. « lieu=depot&vue=entrees ») quand elle règle plusieurs paramètres. */
  requete?: string;
}

interface Entree {
  id: string;
  label: string;
  icon: string;
  iconOn: string;
  /** Page ouverte par l'entrée (sans paramètre). */
  chemin: string;
  /** Paramètre d'adresse des sous-entrées (« lieu », « vue »). */
  cle?: string;
  sous?: SousEntree[];
}

interface Groupe {
  /** Titre de la rubrique (absent : en tête du menu). */
  titre?: string;
  entrees: Entree[];
}

const ecran = (chemin: string, pathname: string) => pathname === chemin || pathname.startsWith(`${chemin}/`);

/** Les écrans du catalogue d'articles (liste, catégories, à compléter) appartiennent à l'entrée « Articles ». */
const dansCatalogue = (pathname: string, params: URLSearchParams) =>
  (ecran("/stock", pathname) && (params.get("lieu") === "articles" ? pathname === "/stock" : pathname.startsWith("/stock/categories") || pathname.startsWith("/stock/a-completer"))) ||
  ecran("/articles", pathname);

/** Les écrans du stock camion (liste, historique d'un article, chargement, retour) appartiennent à l'entrée « Camion ». */
const dansCamion = (pathname: string, params: URLSearchParams) =>
  pathname.startsWith("/stock/camion") ||
  pathname.startsWith("/stock/chargement") ||
  pathname.startsWith("/stock/retour") ||
  (pathname.replace(/\/+$/, "") === "/stock" && params.get("lieu") === "camion");

/**
 * Menu du web (à partir de 768 px) : remplace la barre d'onglets du téléphone. Rubriques dans l'ordre d'un ERP :
 * pilotage, commercial, approvisionnement, logistique, rapports. Une entrée à sous-menu s'ouvre et se ferme au clic,
 * sans changer d'écran ; ce sont les sous-entrées qui mènent aux pages (la page lit ?lieu=…, ?vue=… dans l'adresse).
 */
export default function BarreLaterale() {
  const { user } = useAuth();
  const { societe } = useSociete();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  // Ouvert / fermé choisi au clic ; sans choix, le sous-menu de la rubrique courante est ouvert.
  const [bascules, setBascules] = useState<Record<string, boolean>>({});
  const params = new URLSearchParams(search);
  const admin = user?.role === "ADMIN";

  const bonsVente = { label: t("Liste des B° Livraison"), icon: documentTextOutline };
  const factures = { label: t("Liste des factures"), icon: receiptOutline };
  const transformation = { label: t("Transformer BL en facture"), icon: swapHorizontalOutline };

  const groupes: Groupe[] = admin
    ? [
        {
          entrees: [{ id: "accueil", label: t("Tableau de bord"), icon: statsChartOutline, iconOn: statsChart, chemin: "/tableau-de-bord" }],
        },
        {
          titre: t("Commercial"),
          entrees: [
            {
              id: "ventes",
              label: t("Ventes"),
              icon: receiptOutline,
              iconOn: receipt,
              chemin: "/factures",
              cle: "vue",
              sous: [
                { valeur: "bl", ...bonsVente, chemin: "/factures" },
                { valeur: "factures", ...factures, chemin: "/ventes/factures" },
                { valeur: "transformation", ...transformation, chemin: "/ventes/transformation" },
              ],
            },
            {
              id: "clients",
              label: t("Clients"),
              icon: peopleOutline,
              iconOn: people,
              chemin: "/clients",
              cle: "vue",
              sous: [
                { valeur: "clients", label: t("Liste des clients"), icon: listOutline },
                { valeur: "credits", label: t("Liste des crédits"), icon: cardOutline },
              ],
            },
            {
              // Promotions : prix promo et ventes en lot, appliquées d'elles-mêmes sur les BL pendant leur période.
              id: "promotions",
              label: t("Promotions"),
              icon: pricetagsOutline,
              iconOn: pricetags,
              chemin: "/promotions",
              cle: "vue",
              sous: [{ valeur: "liste", label: t("Liste des promotions"), icon: listOutline, chemin: "/promotions" }],
            },
            {
              id: "vendeurs",
              label: t("Vendeurs"),
              icon: peopleCircleOutline,
              iconOn: peopleCircle,
              chemin: "/vendeurs",
              cle: "vue",
              sous: [{ valeur: "liste", label: t("Liste des vendeurs"), icon: listOutline, chemin: "/vendeurs" }],
            },
          ],
        },
        // Supermarché : les caisses du magasin (ventes au comptoir, puis réglages des postes, caissiers et touches).
        ...(societe?.type === "SUPERMARCHE"
          ? [
              {
                titre: t("Magasin"),
                entrees: [
                  {
                    id: "caisse",
                    label: t("Caisse"),
                    icon: calculatorOutline,
                    iconOn: calculator,
                    chemin: "/caisse",
                    cle: "vue",
                    sous: [
                      { valeur: "synthese", label: t("Synthèse des ventes"), icon: statsChartOutline, chemin: "/caisse" },
                      { valeur: "tickets", label: t("Tickets de caisse"), icon: receiptOutline, chemin: "/caisse/tickets" },
                      { valeur: "clotures", label: t("Clôtures de caisse"), icon: lockClosedOutline, chemin: "/caisse/clotures" },
                    ],
                  },
                  {
                    id: "reglages-caisse",
                    label: t("Réglages caisse"),
                    icon: settingsOutline,
                    iconOn: settings,
                    chemin: "/caisse/postes",
                    cle: "vue",
                    sous: [
                      { valeur: "postes", label: t("Postes de caisse"), icon: desktopOutline, chemin: "/caisse/postes" },
                      { valeur: "caissiers", label: t("Caissiers"), icon: personCircleOutline, chemin: "/caisse/caissiers" },
                      { valeur: "touches", label: t("Touches rapides"), icon: gridOutline, chemin: "/caisse/touches" },
                    ],
                  },
                ],
              },
            ]
          : []),
        {
          titre: t("Approvisionnement"),
          entrees: [
            {
              id: "achats",
              label: t("Achats"),
              icon: cartOutline,
              iconOn: cart,
              chemin: "/achats",
              cle: "vue",
              sous: [
                { valeur: "bl", ...bonsVente, chemin: "/achats/bl" },
                { valeur: "factures", ...factures, chemin: "/achats/factures" },
                { valeur: "transformation", ...transformation, chemin: "/achats/transformation" },
              ],
            },
            {
              id: "fournisseurs",
              label: t("Fournisseurs"),
              icon: storefrontOutline,
              iconOn: storefront,
              chemin: "/fournisseurs",
              cle: "vue",
              sous: [
                { valeur: "liste", label: t("Liste des fournisseurs"), icon: listOutline, chemin: "/fournisseurs" },
                { valeur: "reglements", label: t("Liste des règlements"), icon: cashOutline, chemin: "/fournisseurs/reglements" },
                { valeur: "impression", label: t("Impression traite / chèque"), icon: printOutline, chemin: "/fournisseurs/impression" },
              ],
            },
            {
              id: "depenses",
              label: t("Dépenses"),
              icon: walletOutline,
              iconOn: wallet,
              chemin: "/depenses",
              cle: "vue",
              sous: [{ valeur: "liste", label: t("Liste des dépenses"), icon: listOutline, chemin: "/depenses" }],
            },
          ],
        },
        {
          titre: t("Logistique"),
          entrees: [
            // Plan 3D du dépôt : accès direct (aussi depuis Stock du dépôt et le tableau de bord).
            { id: "plan", label: t("Plan du dépôt"), icon: layersOutline, iconOn: layers, chemin: "/stock/entrepot" },
            {
              id: "articles",
              label: t("Articles"),
              icon: cubeOutline,
              iconOn: cube,
              chemin: "/stock",
              cle: "lieu",
              sous: [
                { valeur: "liste", label: t("Liste des articles"), icon: listOutline, requete: "lieu=articles" },
                { valeur: "categories", label: t("Liste des catégories"), icon: folderOpenOutline, chemin: "/stock/categories" },
                { valeur: "a-completer", label: t("Articles à compléter"), icon: alertCircleOutline, chemin: "/stock/a-completer" },
              ],
            },
            {
              // Le dépôt et les camions, et leurs bons (entrée = achat sans papier, sortie = chargement d'un camion,
              // retour = camion → dépôt). Un chargement n'apparaît qu'une fois : c'est le B° Sortie du dépôt.
              id: "stock",
              label: t("Stock"),
              icon: businessOutline,
              iconOn: business,
              chemin: "/stock",
              cle: "vue",
              sous: [
                { valeur: "depot", label: t("Stock du dépôt"), icon: businessOutline, requete: "lieu=depot&vue=stock" },
                { valeur: "camion", label: t("Stock des camions"), icon: carOutline, requete: "lieu=camion" },
                { valeur: "entrees", label: t("Liste des B° Entrée"), icon: enterOutline, chemin: "/achats/entrees" },
                { valeur: "sorties", label: t("Liste des B° Sortie"), icon: exitOutline, requete: "lieu=depot&vue=sorties" },
                { valeur: "retours", label: t("Liste des B° Retour"), icon: arrowUndoOutline, requete: "lieu=depot&vue=retours" },
              ],
            },
            {
              id: "inventaires",
              label: t("Inventaires"),
              icon: clipboardOutline,
              iconOn: clipboard,
              chemin: "/inventaires",
              cle: "lieu",
              sous: [
                { valeur: "depot", label: t("Inventaires du dépôt"), icon: businessOutline },
                { valeur: "camion", label: t("Inventaires des camions"), icon: carOutline },
              ],
            },
          ],
        },
        {
          titre: t("Rapports"),
          entrees: [
            {
              // Journaux des ventes, des achats et du stock (par période, par type de document, à imprimer).
              id: "editions",
              label: t("Éditions"),
              icon: printOutline,
              iconOn: print,
              chemin: "/editions",
              cle: "vue",
              sous: [
                { valeur: "ventes", label: t("Journal des ventes"), icon: barChartOutline, chemin: "/editions/ventes" },
                { valeur: "achats", label: t("Journal des achats"), icon: cartOutline, chemin: "/editions/achats" },
                { valeur: "stock", label: t("Journal du stock"), icon: businessOutline, chemin: "/editions/stock" },
              ],
            },
          ],
        },
      ]
    : [
        {
          entrees: [
            { id: "factures", label: t("Liste des B° Livraison"), icon: documentTextOutline, iconOn: documentText, chemin: "/factures" },
            { id: "articles", label: t("Liste des articles"), icon: cubeOutline, iconOn: cube, chemin: "/articles" },
            {
              id: "clients",
              label: t("Clients"),
              icon: peopleOutline,
              iconOn: people,
              chemin: "/clients",
              cle: "vue",
              sous: [
                { valeur: "clients", label: t("Liste des clients"), icon: listOutline },
                { valeur: "credits", label: t("Liste des crédits"), icon: cardOutline },
              ],
            },
          ],
        },
      ];

  const entreeActive = (e: Entree) => {
    if (e.id === "articles") return dansCatalogue(pathname, params);
    if (e.id === "ventes") return ecran("/factures", pathname) || ecran("/ventes", pathname);
    if (e.id === "stock") return (ecran("/stock", pathname) && !dansCatalogue(pathname, params) && !ecran("/stock/entrepot", pathname)) || ecran("/achats/entrees", pathname);
    if (e.id === "caisse") return ["/caisse", "/caisse/tickets", "/caisse/clotures"].includes(pathname.replace(/\/+$/, ""));
    if (e.id === "reglages-caisse") return ["/caisse/postes", "/caisse/caissiers", "/caisse/touches"].some((c) => ecran(c, pathname));
    if (e.id === "achats") return ecran("/achats", pathname) && !ecran("/achats/entrees", pathname);
    return ecran(e.chemin, pathname);
  };
  /** Sous-entrée courante : le paramètre d'adresse, ou la première par défaut. */
  const sousActive = (e: Entree, s: SousEntree) => {
    if (!e.cle || !e.sous) return false;
    if (s.chemin) return pathname.replace(/\/+$/, "") === s.chemin || (e.sous.length === 1 && ecran(s.chemin, pathname));
    if (e.id === "stock" && s.valeur === "camion") return dansCamion(pathname, params);
    if (e.id === "stock" && s.valeur === "depot" && dansCamion(pathname, params)) return false;
    // Détail ou création d'un bon de livraison : on est encore dans « B° Livraison ».
    if (e.id === "ventes" && s.valeur === "bl" && ecran("/factures", pathname)) return true;
    // Fiche d'un article : on est encore dans « Liste ».
    if (e.id === "articles" && s.valeur === "liste" && ecran("/articles", pathname)) return true;
    if (s.requete) {
      // Sous-entrée courante : celle dont tous les paramètres sont dans l'adresse, sinon la première.
      const correspond = (x: SousEntree) => Boolean(x.requete) && [...new URLSearchParams(x.requete)].every(([k, v]) => params.get(k) === v);
      return pathname.replace(/\/+$/, "") === e.chemin && (e.sous.find(correspond) ?? e.sous[0]) === s;
    }
    const valeur = params.get(e.cle);
    const courante = e.sous.some((x) => x.valeur === valeur) ? valeur : e.sous[0].valeur;
    return pathname.replace(/\/+$/, "") === e.chemin && s.valeur === courante;
  };

  const aller = (e: Entree, s?: SousEntree) => {
    if (s?.chemin) return navigate(s.chemin);
    const requete = s?.requete ? `?${s.requete}` : s && e.cle ? `?${e.cle}=${s.valeur}` : "";
    navigate(`${e.chemin}${requete}`);
  };

  const rendreEntree = (e: Entree) => {
    const active = entreeActive(e);
    const deplie = Boolean(e.sous) && (bascules[e.id] ?? active);
    return (
      <li key={e.id}>
        <button
          type="button"
          className={`rc-sidenav__entree${active ? " rc-sidenav__entree--active" : ""}`}
          // Menu replié : le libellé est masqué, le bouton garde son nom pour les lecteurs d'écran.
          aria-label={e.label}
          aria-current={active && !e.sous ? "page" : undefined}
          aria-expanded={e.sous ? deplie : undefined}
          onClick={() => (e.sous ? setBascules((b) => ({ ...b, [e.id]: !deplie })) : aller(e))}
        >
          <IonIcon icon={active ? e.iconOn : e.icon} aria-hidden="true" />
          <span className="rc-sidenav__libelle">{e.label}</span>
          {e.sous && <IonIcon className={`rc-sidenav__chevron${deplie ? " rc-sidenav__chevron--ouvert" : ""}`} icon={chevronDown} aria-hidden="true" />}
        </button>
        {e.sous && (
          // Tiroir animé : toujours rendu, il s'ouvre et se ferme en hauteur (grille 0fr → 1fr).
          <div className={`rc-sidenav__tiroir${deplie ? " rc-sidenav__tiroir--ouvert" : ""}`} aria-hidden={!deplie}>
            <ul className="rc-sidenav__sous">
              {e.sous.map((s, i) => {
                const choisie = active && sousActive(e, s);
                return (
                  <li key={s.valeur} style={{ "--rc-rang": i } as React.CSSProperties}>
                    <button
                      type="button"
                      tabIndex={deplie ? undefined : -1}
                      className={`rc-sidenav__sous-entree${choisie ? " rc-sidenav__sous-entree--active" : ""}`}
                      aria-current={choisie ? "page" : undefined}
                      onClick={() => aller(e, s)}
                    >
                      <IonIcon icon={s.icon} aria-hidden="true" />
                      <span>{s.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </li>
    );
  };

  return (
    <nav className="rc-sidenav" aria-label={t("Navigation principale")}>
      {societe && (
        <div className="rc-sidenav__brand">
          <SocieteLogo nom={societe.nom} logo={societe.logo} size={40} />
          <p className="rc-sidenav__nom">{societe.nom}</p>
        </div>
      )}
      {groupes.map((g, i) => (
        <div key={g.titre ?? i} className="rc-sidenav__groupe">
          {g.titre && <p className="rc-sidenav__groupe-titre">{g.titre}</p>}
          <ul className="rc-sidenav__liste">{g.entrees.map(rendreEntree)}</ul>
        </div>
      ))}
    </nav>
  );
}
