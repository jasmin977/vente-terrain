import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { IonIcon } from "@ionic/react";
import {
  car,
  carOutline,
  chevronDown,
  clipboard,
  clipboardOutline,
  cube,
  cubeOutline,
  documentText,
  documentTextOutline,
  peopleCircle,
  peopleCircleOutline,
  people,
  peopleOutline,
  statsChart,
  statsChartOutline,
} from "ionicons/icons";
import SocieteLogo from "./SocieteLogo";
import { useAuth } from "../auth/AuthContext";
import { useSociete } from "../societe/SocieteContext";
import { t } from "../i18n";

interface SousEntree {
  /** Valeur du paramètre d'adresse (?lieu=…, ?vue=…) que choisit cette entrée. */
  valeur: string;
  label: string;
  /** Écran à part (au lieu d'un paramètre d'adresse), ex. le plan 3D du dépôt. */
  chemin?: string;
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
  /** Paramètre ajouté à l'adresse de l'entrée elle-même (ex. Articles = /stock?lieu=articles). */
  parametre?: string;
  sous?: SousEntree[];
}

const ecran = (chemin: string, pathname: string) => pathname === chemin || pathname.startsWith(`${chemin}/`);

/** Les écrans du catalogue d'articles (liste, catégories, à compléter) appartiennent à l'entrée « Articles ». */
const dansCatalogue = (pathname: string, params: URLSearchParams) =>
  (ecran("/stock", pathname) && (params.get("lieu") === "articles" ? pathname === "/stock" : pathname.startsWith("/stock/categories") || pathname.startsWith("/stock/a-completer"))) ||
  ecran("/articles", pathname);

/**
 * Menu du web (à partir de 768 px) : remplace la barre d'onglets du téléphone. Les choix que le
 * téléphone fait avec des onglets dans la page (Dépôt / Camion, Clients / Crédits) sont ici des
 * sous-menus ; la page les lit dans l'adresse (?lieu=…, ?vue=…).
 */
export default function BarreLaterale() {
  const { user } = useAuth();
  const { societe } = useSociete();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const params = new URLSearchParams(search);
  const admin = user?.role === "ADMIN";

  const clients: Entree = {
    id: "clients",
    label: t("Clients"),
    icon: peopleOutline,
    iconOn: people,
    chemin: "/clients",
    cle: "vue",
    sous: [
      { valeur: "clients", label: t("Clients") },
      { valeur: "credits", label: t("Crédits") },
    ],
  };
  const livraison: Entree = { id: "factures", label: t("B° Livraison"), icon: documentTextOutline, iconOn: documentText, chemin: "/factures" };

  const entrees: Entree[] = admin
    ? [
        { id: "accueil", label: t("Accueil"), icon: statsChartOutline, iconOn: statsChart, chemin: "/tableau-de-bord" },
        livraison,
        clients,
        {
          id: "stock",
          label: t("Stock"),
          icon: carOutline,
          iconOn: car,
          chemin: "/stock",
          cle: "lieu",
          sous: [
            { valeur: "depot", label: t("Dépôt") },
            { valeur: "camion", label: t("Camion") },
            { valeur: "entrepot", label: t("Entrepôt 3D"), chemin: "/stock/entrepot" },
          ],
        },
        { id: "articles", label: t("Articles"), icon: cubeOutline, iconOn: cube, chemin: "/stock", parametre: "lieu=articles" },
        {
          id: "inventaires",
          label: t("Inventaires"),
          icon: clipboardOutline,
          iconOn: clipboard,
          chemin: "/inventaires",
          cle: "lieu",
          sous: [
            { valeur: "depot", label: t("Dépôt") },
            { valeur: "camion", label: t("Camion") },
          ],
        },
        { id: "vendeurs", label: t("Vendeurs"), icon: peopleCircleOutline, iconOn: peopleCircle, chemin: "/vendeurs" },
      ]
    : [livraison, { id: "articles", label: t("Articles"), icon: cubeOutline, iconOn: cube, chemin: "/articles" }, clients];

  const entreeActive = (e: Entree) => {
    if (e.id === "articles") return dansCatalogue(pathname, params);
    if (e.id === "stock") return ecran("/stock", pathname) && !dansCatalogue(pathname, params);
    return ecran(e.chemin, pathname);
  };
  /** Sous-entrée courante : le paramètre d'adresse, ou la première par défaut. */
  const sousActive = (e: Entree, s: SousEntree) => {
    if (!e.cle || !e.sous) return false;
    if (s.chemin) return pathname.replace(/\/+$/, "") === s.chemin;
    const valeur = params.get(e.cle);
    const courante = e.sous.some((x) => x.valeur === valeur) ? valeur : e.sous[0].valeur;
    return pathname.replace(/\/+$/, "") === e.chemin && s.valeur === courante;
  };

  const aller = (e: Entree, s?: SousEntree) => {
    if (s?.chemin) return navigate(s.chemin);
    const requete = s && e.cle ? `?${e.cle}=${s.valeur}` : e.parametre ? `?${e.parametre}` : "";
    navigate(`${e.chemin}${requete}`);
  };

  return (
    <nav className="rc-sidenav" aria-label={t("Navigation principale")}>
      {societe && (
        <div className="rc-sidenav__brand">
          <SocieteLogo nom={societe.nom} logo={societe.logo} size={40} />
          <p className="rc-sidenav__nom">{societe.nom}</p>
        </div>
      )}
      <ul className="rc-sidenav__liste">
        {entrees.map((e) => {
          const active = entreeActive(e);
          const deplie = Boolean(e.sous) && (active || ouverts.has(e.id));
          return (
            <li key={e.id}>
              <button
                type="button"
                className={`rc-sidenav__entree${active ? " rc-sidenav__entree--active" : ""}`}
                aria-current={active && !e.sous ? "page" : undefined}
                aria-expanded={e.sous ? deplie : undefined}
                onClick={() => {
                  if (e.sous) {
                    setOuverts(new Set([e.id])); // un seul sous-menu ouvert à la fois
                    // Déjà dans la section : on garde le sous-menu courant ; sinon on ouvre le premier.
                    if (!active) aller(e, e.sous[0]);
                  } else aller(e);
                }}
              >
                <IonIcon icon={active ? e.iconOn : e.icon} aria-hidden="true" />
                <span className="rc-sidenav__libelle">{e.label}</span>
                {e.sous && <IonIcon className={`rc-sidenav__chevron${deplie ? " rc-sidenav__chevron--ouvert" : ""}`} icon={chevronDown} aria-hidden="true" />}
              </button>
              {e.sous && deplie && (
                <ul className="rc-sidenav__sous">
                  {e.sous.map((s) => {
                    const choisie = active && sousActive(e, s);
                    return (
                      <li key={s.valeur}>
                        <button
                          type="button"
                          className={`rc-sidenav__sous-entree${choisie ? " rc-sidenav__sous-entree--active" : ""}`}
                          aria-current={choisie ? "page" : undefined}
                          onClick={() => aller(e, s)}
                        >
                          {s.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
