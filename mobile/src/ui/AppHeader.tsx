import type { ReactNode } from "react";
import { IonBackButton, IonHeader } from "@ionic/react";
import { arrowBackOutline } from "ionicons/icons";
import { t } from "../i18n";

interface AppHeaderProps {
  title: ReactNode;
  /** Small line above the title (date, context). */
  eyebrow?: ReactNode;
  /** Top-level screens use the large serif title. */
  large?: boolean;
  /** Pushed screens: renders a back button falling back to this route. */
  backHref?: string;
  actions?: ReactNode;
  /** Search / filters pinned under the title. */
  children?: ReactNode;
}

export default function AppHeader({ title, eyebrow, large, backHref, actions, children }: AppHeaderProps) {
  return (
    <IonHeader className="rc-header">
      <div className={`rc-appbar${large ? " rc-appbar--large" : ""}`}>
        <div className="rc-appbar__row">
          {backHref && (
            <IonBackButton
              className="rc-back"
              defaultHref={backHref}
              icon={arrowBackOutline}
              text=""
              aria-label={t("Retour")}
            />
          )}
          <div className="rc-appbar__titles">
            {eyebrow && <p className="rc-appbar__eyebrow">{eyebrow}</p>}
            <h1 className="rc-appbar__title">{title}</h1>
          </div>
          {actions && <div className="rc-appbar__actions">{actions}</div>}
        </div>
        {children && <div className="rc-appbar__below">{children}</div>}
      </div>
    </IonHeader>
  );
}
