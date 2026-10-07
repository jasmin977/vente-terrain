import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IonAlert, IonIcon } from "@ionic/react";
import { logOutOutline, peopleOutline, printOutline } from "ionicons/icons";
import { useAuth } from "../auth/AuthContext";
import { getPrinterIp, setPrinterIp } from "../lib/printerSettings";
import { initials } from "../utils/labels";
import Sheet from "./Sheet";
import Section, { Group } from "./Section";
import Row from "./Row";
import Tag from "./Tag";
import Button from "./Button";
import Field from "./Field";
import { getLang, setLang, t, type Lang } from "../i18n";
import Segmented from "./Segmented";

/**
 * Replaces the bare logout icon that sat on every top-level screen:
 * shows who is signed in, holds the printer address, and puts logout
 * behind a deliberate, confirmed action.
 */
export default function AccountButton() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [ip, setIp] = useState("");
  const [savedIp, setSavedIp] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    if (open) getPrinterIp().then((v) => {
      setSavedIp(v);
      setIp(v ?? "");
    });
  }, [open]);

  if (!user) return null;

  const ipChanged = ip.trim() !== (savedIp ?? "") && ip.trim() !== "";

  return (
    <>
      <button
        type="button"
        className="rc-iconbtn"
        aria-label={t("Compte : {nom}", { nom: user.nom })}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="rc-avatar" aria-hidden="true">
          {initials(user.nom)}
        </span>
      </button>

      <Sheet isOpen={open} title={t("Compte")} height="auto" onDismiss={() => setOpen(false)}>
        <Section>
          <Group>
            <Row
              leading={
                <span className="rc-avatar rc-avatar--lg" aria-hidden="true">
                  {initials(user.nom)}
                </span>
              }
              title={user.nom}
              meta={t("Code {code}", { code: user.code })}
              trailing={<Tag tone={user.role === "ADMIN" ? "accent" : "neutral"}>{user.role === "ADMIN" ? t("Admin") : t("Vendeur")}</Tag>}
            />
          </Group>
        </Section>

        {user.role === "ADMIN" && (
          <Section label={t("Administration")}>
            <Group>
              <Row
                onClick={() => {
                  setOpen(false);
                  navigate("/vendeurs");
                }}
                leading={
                  <span className="rc-thumb" style={{ width: 40, height: 40 }} aria-hidden="true">
                    <IonIcon icon={peopleOutline} style={{ fontSize: 22, color: "var(--rc-ink)" }} />
                  </span>
                }
                title={t("Gérer les vendeurs")}
                meta={t("Comptes, mots de passe, accès")}
                chevron
              />
            </Group>
          </Section>
        )}

        {/* Libellés dans leur propre langue : retrouvables quelle que soit la langue active. */}
        <Section label={t("Langue")}>
          <Segmented
            label={t("Langue")}
            value={getLang()}
            onChange={(l: Lang) => {
              setOpen(false);
              setLang(l);
            }}
            options={[
              { value: "fr", label: "Français" },
              { value: "ar", label: "العربية" },
            ]}
          />
        </Section>

        <Section label={t("Imprimante")}>
          <Field
            label={t("Adresse IP Wi-Fi")}
            value={ip}
            onChange={setIp}
            inputMode="decimal"
            placeholder="192.168.1.100"
            prefix={<IonIcon icon={printOutline} aria-hidden="true" />}
            hint={t("Visible dans le menu réseau de l'imprimante.")}
            suffix={
              ipChanged ? (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await setPrinterIp(ip.trim());
                    setSavedIp(ip.trim());
                  }}
                >
                  {t("Enregistrer")}
                </Button>
              ) : undefined
            }
          />
        </Section>

        <Section>
          <Button variant="danger" block icon={logOutOutline} onClick={() => setConfirmLogout(true)}>
            {t("Se déconnecter")}
          </Button>
        </Section>
      </Sheet>

      <IonAlert
        isOpen={confirmLogout}
        onDidDismiss={() => setConfirmLogout(false)}
        header={t("Se déconnecter ?")}
        message={t("Vous devrez saisir à nouveau votre code et mot de passe.")}
        buttons={[
          { text: t("Annuler"), role: "cancel" },
          {
            text: t("Se déconnecter"),
            role: "destructive",
            handler: () => {
              setOpen(false);
              logout();
            },
          },
        ]}
      />
    </>
  );
}
