import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IonFooter, IonIcon } from "@ionic/react";
import Button from "./Button";
import { useEcranLarge } from "./useMediaQuery";

/**
 * Web (≥ 768 px) : les boutons posés en bas de l'écran sur téléphone (création, enregistrer, valider…) se placent
 * en haut à droite de la page, dans l'en-tête, à côté des notifications et du compte. Cherche l'emplacement prévu
 * dans l'en-tête de la même page ; pas d'emplacement (feuille, page sans en-tête) : l'élément reste à sa place.
 */
function useEmplacementEntete() {
  const web = useEcranLarge();
  const marqueur = useRef<HTMLSpanElement>(null);
  const [emplacement, setEmplacement] = useState<Element | null>(null);
  useLayoutEffect(() => {
    const m = marqueur.current;
    if (!web || !m || m.closest("ion-modal")) {
      setEmplacement(null);
      return;
    }
    setEmplacement(m.closest(".ion-page")?.querySelector("[data-rc-entete-actions]") ?? null);
  }, [web]);
  return { marqueur, emplacement };
}

/** Extended FAB: the screen's creation action, labelled (not a bare "+"). */
export function Fab({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  const { marqueur, emplacement } = useEmplacementEntete();
  return (
    <>
      <span ref={marqueur} hidden />
      {emplacement ? (
        createPortal(
          <Button icon={icon} onClick={onClick} className="rc-appbar__cta">
            {label}
          </Button>,
          emplacement,
        )
      ) : (
        <button type="button" slot="fixed" className="rc-fab" onClick={onClick}>
          <IonIcon icon={icon} aria-hidden="true" />
          {label}
        </button>
      )}
    </>
  );
}

export function FabSpacer() {
  return <div className="rc-fab-spacer" aria-hidden="true" />;
}

/**
 * Sticky bottom action bar: primary actions live in the thumb zone.
 * `aboveTabs` : la barre est posée au-dessus de la barre d'onglets, qui gère
 * déjà la zone de geste du téléphone — pas de marge de sécurité en double.
 */
export function ActionBar({ children, hint, aboveTabs }: { children: ReactNode; hint?: ReactNode; aboveTabs?: boolean }) {
  const { marqueur, emplacement } = useEmplacementEntete();
  if (emplacement) {
    return (
      <>
        <span ref={marqueur} hidden />
        {createPortal(
          <>
            {hint && <span className="rc-appbar__indice">{hint}</span>}
            <div className="rc-appbar__cta-groupe">{children}</div>
          </>,
          emplacement,
        )}
      </>
    );
  }
  return (
    <IonFooter className="rc-footer">
      <span ref={marqueur} hidden />
      <div className={`rc-actionbar${aboveTabs ? " rc-actionbar--tabs" : ""}`}>
        {children}
        {hint && (
          <p className="rc-actionbar__hint" aria-live="polite">
            {hint}
          </p>
        )}
      </div>
    </IonFooter>
  );
}
