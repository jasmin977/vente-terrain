import type { ReactNode } from "react";
import { IonIcon } from "@ionic/react";
import { alertCircle, informationCircle, warning } from "ionicons/icons";
import { t } from "../i18n";

/* ---------- Notice: inline error / warning / info, optional retry ---------- */
interface NoticeProps {
  children: ReactNode;
  tone?: "danger" | "warning" | "info";
  actionLabel?: string;
  onAction?: () => void;
}

const noticeIcon = { danger: alertCircle, warning: warning, info: informationCircle };

export function Notice({ children, tone = "danger", actionLabel, onAction }: NoticeProps) {
  return (
    <div className={`rc-notice rc-notice--${tone}`} role={tone === "info" ? "status" : "alert"}>
      <IonIcon icon={noticeIcon[tone]} aria-hidden="true" />
      <div className="rc-notice__body">{children}</div>
      {actionLabel && onAction && (
        <button type="button" className="rc-notice__action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** Page-level notice with standard gutter spacing. */
export function PageNotice(props: NoticeProps) {
  return (
    <div className="rc-page-notice">
      <Notice {...props} />
    </div>
  );
}

/* ---------- Empty state ---------- */
interface EmptyStateProps {
  icon: string;
  title: string;
  message?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="rc-empty">
      <span className="rc-empty__icon" aria-hidden="true">
        <IonIcon icon={icon} />
      </span>
      <p className="rc-empty__title">{title}</p>
      {message && <p className="rc-empty__msg">{message}</p>}
      {action && <div className="rc-empty__action">{action}</div>}
    </div>
  );
}

/* ---------- Skeleton list: stable layout while loading ---------- */
export function SkeletonList({ rows = 6, thumb = false }: { rows?: number; thumb?: boolean }) {
  return (
    <div className="rc-list" aria-busy="true" aria-label={t("Chargement")}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="rc-skel-row" key={i}>
          {thumb && <span className="rc-skel" style={{ width: 48, height: 48, borderRadius: 10 }} />}
          <span className="rc-skel-row__body">
            <span className="rc-skel" style={{ width: `${55 + ((i * 17) % 30)}%`, height: 14 }} />
            <span className="rc-skel" style={{ width: `${30 + ((i * 11) % 20)}%`, height: 11 }} />
          </span>
          <span className="rc-skel" style={{ width: 72, height: 14 }} />
        </div>
      ))}
    </div>
  );
}

export function Spinner({ label = "Chargement" }: { label?: string }) {
  return <span className="rc-spinner" role="status" aria-label={label} />;
}
