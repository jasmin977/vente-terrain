import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "../auth/AuthContext";
import SceneEntrepot from "./SceneEntrepot";

/** Délai sans activité avant la veille : 10 minutes. */
const DELAI_VEILLE_MS = 10 * 60_000;

const EVENEMENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "wheel",
  "touchstart",
  "pointerdown",
] as const;

/** Écran de veille (administrateur, version web) : un entrepôt animé apparaît après un moment sans souris ni clavier. */
export default function VeilleEcran() {
  const { user } = useAuth();
  const actif = user?.role === "ADMIN" && !Capacitor.isNativePlatform();
  const [veille, setVeille] = useState(false);
  const minuteur = useRef<number>(0);
  const veilleRef = useRef(false);

  useEffect(() => {
    if (!actif) {
      veilleRef.current = false;
      setVeille(false);
      return;
    }
    const armer = () => {
      window.clearTimeout(minuteur.current);
      minuteur.current = window.setTimeout(() => {
        veilleRef.current = true;
        setVeille(true);
      }, DELAI_VEILLE_MS);
    };
    const activite = (e: Event) => {
      if (veilleRef.current) {
        // Le geste qui réveille n'agit pas sur l'écran en dessous.
        if (e.type !== "mousemove") e.preventDefault();
        e.stopPropagation();
        veilleRef.current = false;
        setVeille(false);
      }
      armer();
    };
    EVENEMENTS.forEach((n) =>
      window.addEventListener(n, activite, { capture: true, passive: false }),
    );
    armer();
    return () => {
      window.clearTimeout(minuteur.current);
      EVENEMENTS.forEach((n) =>
        window.removeEventListener(n, activite, { capture: true }),
      );
    };
  }, [actif]);

  if (!actif || !veille) return null;
  return (
    <div className="rc-veille" role="presentation" aria-hidden="true">
      <span className="rc-veille__orbe rc-veille__orbe--1" />
      <span className="rc-veille__orbe rc-veille__orbe--2" />
      <SceneEntrepot />
    </div>
  );
}
