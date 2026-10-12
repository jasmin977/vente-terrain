import { useCallback, useRef, useState } from "react";
import type { ScrollDetail } from "@ionic/core";

/**
 * Bouton « retour en haut » d'une longue liste : apparaît dès qu'on a défilé de `seuil` pixels.
 * `contenu` se répand sur l'<IonContent> qui défile ; `visible` et `remonter` vont au <BoutonHaut>.
 */
export function useRetourEnHaut(seuil = 700) {
  const ref = useRef<HTMLIonContentElement>(null);
  const [visible, setVisible] = useState(false);
  // Un état identique ne redessine rien : l'évènement de défilement reste peu coûteux.
  const surDefilement = useCallback((e: CustomEvent<ScrollDetail>) => setVisible(e.detail.scrollTop > seuil), [seuil]);
  const remonter = useCallback(() => {
    void ref.current?.scrollToTop(350);
  }, []);
  return { contenu: { ref, scrollEvents: true, onIonScroll: surDefilement }, visible, remonter };
}
