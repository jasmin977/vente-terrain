import { lazy, Suspense, useEffect, useRef } from "react";
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
import ArticlesACompleter from "./ArticlesACompleter";
import Categories from "./Categories";
import Peremptions from "./Peremptions";
// Le plan 3D embarque three.js : chargé seulement quand on l'ouvre.
const Entrepot3D = lazy(() => import("./Entrepot3D"));
import ChargementForm from "./ChargementForm";
import StockDocumentDetail from "./StockDocumentDetail";
import CamionArticleHistorique from "./CamionArticleHistorique";
import Factures from "./Factures";
import VentesFactures from "./VentesFactures";
import VentesTransformation from "./VentesTransformation";
import FactureForm from "./FactureForm";
import FactureDetail from "./FactureDetail";
import Inventaires from "./Inventaires";
import InventaireDetail from "./InventaireDetail";
import Vendeurs from "./Vendeurs";
import AchatsListe from "./AchatsListe";
import Fournisseurs from "./Fournisseurs";
import ReglementsFournisseurs from "./ReglementsFournisseurs";
import ImpressionEffets from "./ImpressionEffets";
import Promotions from "./Promotions";
import CaisseVentes from "./caisse/CaisseVentes";
import CaissePostes from "./caisse/CaissePostes";
import Caissiers from "./caisse/Caissiers";
import CaisseTouches from "./caisse/CaisseTouches";
import PromotionForm from "./PromotionForm";
import Depenses from "./Depenses";
import Journal from "./Journal";
import AchatsTransformation from "./AchatsTransformation";
import VendeurForm from "./VendeurForm";
import { useAuth } from "../auth/AuthContext";
import BarreLaterale from "../components/BarreLaterale";
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
        { tab: "factures", href: "/factures", label: t("B° Livraison"), icon: documentTextOutline, iconOn: documentText },
        { tab: "clients", href: "/clients", label: t("Clients"), icon: peopleOutline, iconOn: people },
        { tab: "stock", href: "/stock", label: t("Stock"), icon: carOutline, iconOn: car },
        { tab: "inventaires", href: "/inventaires", label: t("Inventaires"), icon: clipboardOutline, iconOn: clipboard },
      ]
    : [
        { tab: "factures", href: "/factures", label: t("B° Livraison"), icon: documentTextOutline, iconOn: documentText },
        { tab: "articles", href: "/articles", label: t("Articles"), icon: cubeOutline, iconOn: cube },
        { tab: "clients", href: "/clients", label: t("Clients"), icon: peopleOutline, iconOn: people },
      ];

  return (
    <>
    {/* Web (≥ 768 px) : menu latéral avec sous-menus ; la barre d'onglets du bas est celle du téléphone. */}
    <BarreLaterale />
    <IonTabs>
      <IonRouterOutlet>
        <Route path="/tableau-de-bord" element={<Dashboard />} />
        <Route path="/factures" element={<Factures />} />
        <Route path="/factures/new" element={<FactureForm />} />
        <Route path="/factures/:id" element={<FactureDetail />} />
        <Route path="/ventes/factures" element={<VentesFactures />} />
        <Route path="/ventes/transformation" element={<VentesTransformation />} />
        <Route path="/articles" element={<Articles />} />
        <Route path="/articles/:id" element={<ArticleForm />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientForm />} />
        <Route path="/clients/:id/historique" element={<ClientHistorique />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/stock/chargement" element={<ChargementForm kind="chargement" />} />
        <Route path="/stock/entree" element={<ChargementForm kind="entree" />} />
        <Route path="/stock/retour" element={<ChargementForm kind="retour" />} />
        <Route path="/stock/a-completer" element={<ArticlesACompleter />} />
        <Route path="/stock/categories" element={<Categories />} />
        <Route path="/stock/peremptions" element={<Peremptions />} />
        <Route
          path="/stock/entrepot"
          element={
            <Suspense fallback={null}>
              <Entrepot3D />
            </Suspense>
          }
        />
        <Route path="/stock/chargements/:id" element={<StockDocumentDetail kind="chargement" />} />
        <Route path="/stock/camion/:vendeurId/articles/:articleId" element={<CamionArticleHistorique />} />
        <Route path="/inventaires" element={<Inventaires />} />
        <Route path="/inventaires/:id" element={<InventaireDetail />} />
        <Route path="/vendeurs" element={<Vendeurs />} />
        <Route path="/achats/bl" element={<AchatsListe key="BL" type="BL" />} />
        <Route path="/achats/factures" element={<AchatsListe key="FACTURE" type="FACTURE" />} />
        <Route path="/achats/entrees" element={<AchatsListe key="ENTREE" type="ENTREE" />} />
        <Route path="/achats/transformation" element={<AchatsTransformation />} />
        <Route path="/fournisseurs" element={<Fournisseurs />} />
        <Route path="/fournisseurs/reglements" element={<ReglementsFournisseurs />} />
        <Route path="/fournisseurs/impression" element={<ImpressionEffets />} />
        <Route path="/promotions" element={<Promotions />} />
        <Route path="/promotions/:id" element={<PromotionForm />} />
        <Route path="/depenses" element={<Depenses />} />
        <Route path="/caisse" element={<CaisseVentes key="synthese" vue="synthese" />} />
        <Route path="/caisse/tickets" element={<CaisseVentes key="tickets" vue="tickets" />} />
        <Route path="/caisse/clotures" element={<CaisseVentes key="clotures" vue="clotures" />} />
        <Route path="/caisse/postes" element={<CaissePostes />} />
        <Route path="/caisse/caissiers" element={<Caissiers />} />
        <Route path="/caisse/touches" element={<CaisseTouches />} />
        <Route path="/editions/ventes" element={<Journal key="ventes" type="ventes" />} />
        <Route path="/editions/achats" element={<Journal key="achats" type="achats" />} />
        <Route path="/editions/stock" element={<Journal key="stock" type="stock" />} />
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
    </>
  );
}
