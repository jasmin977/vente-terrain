import type { ReactNode } from "react";
import { IonContent, IonHeader, IonModal } from "@ionic/react";
import { closeOutline } from "ionicons/icons";
import IconButton from "./IconButton";
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
  children,
}: SheetProps) {
  const full = height === "full";
  return (
    <IonModal
      className={`rc-sheet${full ? "" : " rc-sheet--auto"}`}
      isOpen={isOpen}
      onIonModalWillPresent={onWillPresent}
      onDidDismiss={onDismiss}
      breakpoints={full ? [0, 0.94] : [0, 1]}
      initialBreakpoint={full ? 0.94 : 1}
      expandToScroll={false}
      handle
    >
      <IonHeader>
        <div className="rc-sheet__head">
          <h2 className="rc-sheet__title">{title}</h2>
          <IconButton icon={closeOutline} label={t("Fermer")} variant="filled" size="sm" onClick={onDismiss} />
        </div>
        {toolbar && <div className="rc-sheet__search">{toolbar}</div>}
      </IonHeader>
      {full ? <IonContent>{children}</IonContent> : <div className="rc-sheet__body">{children}</div>}
      {footer && <div className="rc-sheet__footer">{footer}</div>}
    </IonModal>
  );
}
