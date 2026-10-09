import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IonAlert, IonIcon } from "@ionic/react";
import { keyOutline, logOutOutline, peopleOutline, printOutline } from "ionicons/icons";
import { useAuth } from "../auth/AuthContext";
import { getPrinterIp, setPrinterIp } from "../lib/printerSettings";
import { initials } from "../utils/labels";
import Sheet from "./Sheet";
import Section, { Group } from "./Section";
import Row from "./Row";
import Tag from "./Tag";
import Button from "./Button";
import Field from "./Field";
import { getLang, setLang, t, tn, type Lang } from "../i18n";
import SyncButton from "../components/SyncButton";
import SocieteLogo from "../components/SocieteLogo";
import { useSociete } from "../societe/SocieteContext";
import MonMotDePasseSheet from "../components/MonMotDePasseSheet";
import { useEtatSync } from "../offline/sync";
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
  const [monMotDePasse, setMonMotDePasse] = useState(false);
  const { file } = useEtatSync();
  const { societe, changer } = useSociete();

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
      {user.role === "VENDEUR" && <SyncButton />}
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

        {societe && (
          <Section label={t("Société")}>
            <Group>
              <Row
                thumb
                leading={<SocieteLogo nom={societe.nom} logo={societe.logo} />}
                title={societe.nom}
                meta={societe.activite ?? societe.code}
                {...(user.role === "ADMIN"
                  ? {
                      chevron: true,
                      onClick: () => {
                        setOpen(false);
                        changer();
                      },
                    }
                  : {})}
              />
            </Group>
            {user.role === "ADMIN" && <p className="rc-footnote rc-sync__note">{t("Touchez pour changer de société ou en créer une.")}</p>}
          </Section>
        )}

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
              <Row
                onClick={() => {
                  setOpen(false);
                  setMonMotDePasse(true);
                }}
                leading={
                  <span className="rc-thumb" style={{ width: 40, height: 40 }} aria-hidden="true">
                    <IonIcon icon={keyOutline} style={{ fontSize: 22, color: "var(--rc-ink)" }} />
                  </span>
                }
                title={t("Changer mon mot de passe")}
                meta={t("Mot de passe du compte administrateur")}
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

      <MonMotDePasseSheet isOpen={monMotDePasse} onDismiss={() => setMonMotDePasse(false)} />

      <IonAlert
        isOpen={confirmLogout}
        onDidDismiss={() => setConfirmLogout(false)}
        header={t("Se déconnecter ?")}
        message={
          file.length > 0
            ? `${t("Vous devrez saisir à nouveau votre code et mot de passe.")} ${tn(
                file.length,
                "{n} action pas encore envoyée reste sur ce téléphone : elle partira à votre prochaine connexion.",
                "{n} actions pas encore envoyées restent sur ce téléphone : elles partiront à votre prochaine connexion."
              )}`
            : t("Vous devrez saisir à nouveau votre code et mot de passe.")
        }
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
