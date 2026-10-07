import type { ReactNode } from "react";
import { IonFooter, IonIcon } from "@ionic/react";

/** Extended FAB: the screen's creation action, labelled (not a bare "+"). */
export function Fab({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" slot="fixed" className="rc-fab" onClick={onClick}>
      <IonIcon icon={icon} aria-hidden="true" />
      {label}
    </button>
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
  return (
    <IonFooter className="rc-footer">
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
