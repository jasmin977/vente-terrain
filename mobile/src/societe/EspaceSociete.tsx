import { useEffect, useRef } from "react";
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
export default function EspaceSociete() {
  const { user } = useAuth();
  const { societe, accueil, generation } = useSociete();
  const navigate = useNavigate();
  const premiere = useRef(generation);

  // Nouvelle société ouverte : retour à l'écran d'accueil de l'app.
  useEffect(() => {
    if (generation !== premiere.current) navigate(pageAccueil(user?.role), { replace: true });
  }, [generation, navigate, user?.role]);

  if (user?.role === "ADMIN" && !societe) return <Societes />;
  if (accueil && societe) return <AccueilSociete societe={societe} />;
  return <TabsLayout key={generation} />;
}
