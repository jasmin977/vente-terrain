import type { ReactNode } from "react";
import { IonContent, IonHeader, IonModal } from "@ionic/react";
import { closeOutline } from "ionicons/icons";
import IconButton from "./IconButton";
import BoutonHaut from "./BoutonHaut";
import { useRetourEnHaut } from "./useRetourEnHaut";
import { useEcranLarge } from "./useMediaQuery";
import { t } from "../i18n";

interface SheetProps {
  isOpen: boolean;
  title: string;
  onDismiss: () => void;
  onWillPresent?: () => void;
  /** Pinned under the title (search). */
  toolbar?: ReactNode;
  /** Pinned at the bottom (confirm action). */
  footer?: ReactNode;
  /** "full" for long, searchable content; "auto" for short menus. */
  height?: "full" | "auto";
  /** Web : boîte de dialogue plus large (tableaux). */
  large?: boolean;
  children: ReactNode;
}

/**
 * Bottom sheet used for every picker/menu. Swipe-down or the close button
 * dismisses it; content stays reachable by thumb.
 */
export default function Sheet({
  isOpen,
  title,
  onDismiss,
  onWillPresent,
  toolbar,
  footer,
  height = "full",
  large,
  children,
}: SheetProps) {
  const full = height === "full";
  const haut = useRetourEnHaut();
  // Écran large : boîte de dialogue centrée (sans poignée ni crans), au lieu d'une feuille qui monte du bas.
  const dialogue = useEcranLarge();
  return (
    <IonModal
      className={`rc-sheet${full ? "" : " rc-sheet--auto"}${large ? " rc-sheet--large" : ""}`}
      isOpen={isOpen}
      onIonModalWillPresent={onWillPresent}
      onDidDismiss={onDismiss}
      {...(dialogue
        ? {}
        : { breakpoints: full ? [0, 0.94] : [0, 1], initialBreakpoint: full ? 0.94 : 1, expandToScroll: false, handle: true })}
    >
      <IonHeader>
        <div className="rc-sheet__head">
          <h2 className="rc-sheet__title">{title}</h2>
          <IconButton icon={closeOutline} label={t("Fermer")} variant="filled" size="sm" onClick={onDismiss} />
        </div>
        {toolbar && <div className="rc-sheet__search">{toolbar}</div>}
      </IonHeader>
      {full ? (
        <IonContent {...haut.contenu}>
          {children}
          <BoutonHaut visible={haut.visible} onClick={haut.remonter} />
        </IonContent>
      ) : <div className="rc-sheet__body ion-content-scroll-host">{children}</div>}
      {footer && <div className="rc-sheet__footer">{footer}</div>}
    </IonModal>
  );
}
