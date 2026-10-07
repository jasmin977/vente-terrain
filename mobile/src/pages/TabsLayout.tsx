import { useEffect, useRef } from "react";
import { Route, useLocation, useNavigate } from "react-router-dom";
import { IonIcon, IonLabel, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from "@ionic/react";
import {
  car,
  carOutline,
  clipboard,
  clipboardOutline,
  cube,
  cubeOutline,
  documentText,
  documentTextOutline,
  people,
  peopleOutline,
  statsChart,
  statsChartOutline,
} from "ionicons/icons";
import Dashboard from "./Dashboard";
import Articles from "./Articles";
import ArticleForm from "./ArticleForm";
import Clients from "./Clients";
import ClientForm from "./ClientForm";
import ClientHistorique from "./ClientHistorique";
import Stock from "./Stock";
import ChargementForm from "./ChargementForm";
import StockDocumentDetail from "./StockDocumentDetail";
import CamionArticleHistorique from "./CamionArticleHistorique";
import Factures from "./Factures";
import FactureForm from "./FactureForm";
import FactureDetail from "./FactureDetail";
import Inventaires from "./Inventaires";
import InventaireDetail from "./InventaireDetail";
import Vendeurs from "./Vendeurs";
import VendeurForm from "./VendeurForm";
import { useAuth } from "../auth/AuthContext";
import { t } from "../i18n";
import { accueil } from "../utils/navigation";
import { demarrerSyncAuto } from "../offline/sync";

const TOP_LEVEL = ["/tableau-de-bord", "/factures", "/articles", "/clients", "/stock", "/inventaires"];

// Ionic garde les vues montées : un <Navigate> se redéclenche à chaque rendu
// et renverrait vers /factures depuis n'importe quel écran. Cette redirection
// ne s'exécute qu'une fois, au montage.
function RedirectOnce({ to }: { to: string }) {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current(to, { replace: true });
  }, [to]);
  return null;
}

export default function TabsLayout() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { pathname } = useLocation();

  // Vendeur : envoi automatique des actions faites hors ligne (retour du réseau,
  // retour dans l'app, toutes les deux minutes tant qu'il en reste).
  const vendeurId = user?.role === "VENDEUR" ? user.id : null;
  useEffect(() => (vendeurId ? demarrerSyncAuto() : undefined), [vendeurId]);

  // La barre d'onglets n'apparaît que sur les écrans racines : sur un écran
  // poussé (formulaire, détail) elle cède la place à la barre d'action
  // collante et au bouton retour, ce qui évite les appuis accidentels.
  const path = pathname.replace(/\/+$/, "") || "/";
  const isTopLevel = TOP_LEVEL.includes(path);
  const active = TOP_LEVEL.find((p) => path === p || path.startsWith(`${p}/`));

  // Admin : tableau de bord en premier ; le catalogue d'articles est dans Stock
  // (vue « Articles »). Stock et inventaires lui sont réservés (le vendeur ne
  // voit pas le stock de son camion).
  const tabs = isAdmin
    ? [
        { tab: "tableau-de-bord", href: "/tableau-de-bord", label: t("Accueil"), icon: statsChartOutline, iconOn: statsChart },
        { tab: "factures", href: "/factures", label: t("Factures"), icon: documentTextOutline, iconOn: documentText },
        { tab: "clients", href: "/clients", label: t("Clients"), icon: peopleOutline, iconOn: people },
        { tab: "stock", href: "/stock", label: t("Stock"), icon: carOutline, iconOn: car },
        { tab: "inventaires", href: "/inventaires", label: t("Inventaires"), icon: clipboardOutline, iconOn: clipboard },
      ]
    : [
        { tab: "factures", href: "/factures", label: t("Factures"), icon: documentTextOutline, iconOn: documentText },
        { tab: "articles", href: "/articles", label: t("Articles"), icon: cubeOutline, iconOn: cube },
        { tab: "clients", href: "/clients", label: t("Clients"), icon: peopleOutline, iconOn: people },
      ];

  return (
    <IonTabs>
      <IonRouterOutlet>
        <Route path="/tableau-de-bord" element={<Dashboard />} />
        <Route path="/factures" element={<Factures />} />
        <Route path="/factures/new" element={<FactureForm />} />
        <Route path="/factures/:id" element={<FactureDetail />} />
        <Route path="/articles" element={<Articles />} />
        <Route path="/articles/:id" element={<ArticleForm />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientForm />} />
        <Route path="/clients/:id/historique" element={<ClientHistorique />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/stock/chargement" element={<ChargementForm kind="chargement" />} />
        <Route path="/stock/entree" element={<ChargementForm kind="entree" />} />
        <Route path="/stock/entrees/:id" element={<StockDocumentDetail kind="entree" />} />
        <Route path="/stock/chargements/:id" element={<StockDocumentDetail kind="chargement" />} />
        <Route path="/stock/camion/:vendeurId/articles/:articleId" element={<CamionArticleHistorique />} />
        <Route path="/inventaires" element={<Inventaires />} />
        <Route path="/inventaires/:id" element={<InventaireDetail />} />
        <Route path="/vendeurs" element={<Vendeurs />} />
        <Route path="/vendeurs/:id" element={<VendeurForm />} />
        <Route path="/" element={<RedirectOnce to={accueil(user?.role)} />} />
      </IonRouterOutlet>
      <IonTabBar slot="bottom" className={isTopLevel ? undefined : "rc-tabbar-hidden"}>
        {tabs.map((t) => (
          <IonTabButton key={t.tab} tab={t.tab} href={t.href}>
            <IonIcon icon={active === t.href ? t.iconOn : t.icon} aria-hidden="true" />
            <IonLabel>{t.label}</IonLabel>
          </IonTabButton>
        ))}
      </IonTabBar>
    </IonTabs>
  );
}
