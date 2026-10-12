import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import AccueilSociete from "../components/AccueilSociete";
import Societes from "../pages/Societes";
import TabsLayout from "../pages/TabsLayout";
import { accueil as pageAccueil } from "../utils/navigation";
import { useSociete } from "./SocieteContext";

/**
 * Application d'une société :
 * - admin sans société ouverte → choix de la société ;
 * - ouverture d'une société → écran d'accueil avec son logo ;
 * - puis les onglets, recréés à chaque société (aucune donnée de la précédente).
 */
// Survit à la recréation du routeur (et donc de ce composant).
let generationAffichee = 0;

export default function EspaceSociete() {
  const { user } = useAuth();
  const { societe, accueil, generation } = useSociete();
  const navigate = useNavigate();

  // Nouvelle société ouverte (le routeur vient d'être recréé) : retour à
  // l'écran d'accueil de l'app.
  useEffect(() => {
    if (generation === generationAffichee) return;
    generationAffichee = generation;
    navigate(pageAccueil(user?.role), { replace: true });
  }, [generation, navigate, user?.role]);

  if (user?.role === "ADMIN" && !societe) return <Societes />;
  if (accueil && societe) return <AccueilSociete societe={societe} />;
  return <TabsLayout />;
}
