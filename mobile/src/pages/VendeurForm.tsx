import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { Share } from "@capacitor/share";
import { IonAlert, IonContent, IonPage, useIonToast } from "@ionic/react";
import {
  banOutline,
  eyeOffOutline,
  eyeOutline,
  keyOutline,
  refreshOutline,
  shareSocialOutline,
} from "ionicons/icons";
import { createVendeur, getUser, listUsers, setUserPassword, updateUser } from "../api/auth";
import type { UserInput, UserSummary } from "../types/auth";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { formatDate } from "../utils/format";
import { genererMotDePasse, prochainCodeVendeur } from "../utils/password";
import {
  ActionBar,
  AppHeader,
  Button,
  Field,
  Group,
  IconButton,
  Notice,
  PageNotice,
  Section,
  Sheet,
  SkeletonList,
  Tag,
} from "../ui";
import { t } from "../i18n";

const MIN = 4;
const vide: UserInput = { code: "", nom: "", telephone: "", email: "" };

/** Identifiants à transmettre au vendeur juste après création / réinitialisation. */
interface Identifiants {
  code: string;
  password: string;
  nom: string;
}

/** Champ mot de passe avec affichage et génération. */
function MotDePasseField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [visible, setVisible] = useState(false);
  const tropCourt = value.length > 0 && value.length < MIN;
  return (
    <div className="rc-bulk">
      <Field
        label={label}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete="new-password"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        required
        error={tropCourt ? t("{n} caractères minimum", { n: MIN }) : undefined}
        hint={t("{n} caractères minimum. Vous le transmettez au vendeur.", { n: MIN })}
        suffix={
          <IconButton
            icon={visible ? eyeOffOutline : eyeOutline}
            label={visible ? t("Masquer le mot de passe") : t("Afficher le mot de passe")}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          />
        }
      />
      <Button
        variant="secondary"
        size="lg"
        icon={refreshOutline}
        onClick={() => {
          onChange(genererMotDePasse());
          setVisible(true);
        }}
        style={{ alignSelf: "start", marginTop: 26 }}
      >
        {t("Générer")}
      </Button>
    </div>
  );
}

function CarteIdentifiants({ id, titre, onClose }: { id: Identifiants; titre: string; onClose: () => void }) {
  const [toast] = useIonToast();
  const texte = t("Revive Cosmetix — accès vendeur\nNom : {nom}\nCode : {code}\nMot de passe : {mdp}", { nom: id.nom, code: id.code, mdp: id.password });
  const partager = async () => {
    try {
      await Share.share({ title: t("Accès vendeur"), text: texte });
    } catch {
      // partage annulé ou indisponible : on copie à la place
      try {
        await navigator.clipboard.writeText(texte);
        toast({ message: t("Identifiants copiés"), duration: 1800, position: "top", cssClass: "rc-toast" });
      } catch {
        toast({ message: t("Partage indisponible sur cet appareil"), duration: 2500, position: "top", cssClass: "rc-toast" });
      }
    }
  };
  return (
    <div className="rc-creds" role="status">
      <p className="rc-creds__title">{titre}</p>
      <dl className="rc-creds__list">
        <div>
          <dt>{t("Code")}</dt>
          <dd>{id.code}</dd>
        </div>
        <div>
          <dt>{t("Mot de passe")}</dt>
          <dd>{id.password}</dd>
        </div>
      </dl>
      <p className="rc-creds__hint">{t("Notez-le ou envoyez-le maintenant : il ne sera plus affiché.")}</p>
      <div className="rc-actionbar__row">
        <Button variant="primary" icon={shareSocialOutline} onClick={partager}>
          {t("Envoyer au vendeur")}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t("Fermer")}
        </Button>
      </div>
    </div>
  );
}

export default function VendeurForm() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [form, setForm] = useState<UserInput>(vide);
  const [password, setPassword] = useState("");
  const [compte, setCompte] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identifiants, setIdentifiants] = useState<Identifiants | null>(
    (location.state as { identifiants?: Identifiants } | null)?.identifiants ?? null
  );
  const [resetOpen, setResetOpen] = useState(false);
  const [nouveauMdp, setNouveauMdp] = useState("");
  const [confirmAcces, setConfirmAcces] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (isNew) {
          // Propose le prochain code libre (V002, V003…).
          const users = await listUsers();
          setForm((f) => ({ ...f, code: prochainCodeVendeur(users.map((u) => u.code)) }));
        } else {
          const u = await getUser(id!);
          setCompte(u);
          setForm({ code: u.code, nom: u.nom, telephone: u.telephone ?? "", email: u.email ?? "" });
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("Compte introuvable"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  const update = <K extends keyof UserInput>(key: K, value: UserInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const missing = !form.nom.trim()
    ? t("Le nom est obligatoire")
    : !form.code.trim()
      ? t("Le code de connexion est obligatoire")
      : isNew && password.length < MIN
        ? t("Mot de passe : {n} caractères minimum", { n: MIN })
        : null;

  const handleSave = async () => {
    if (missing) return;
    setError(null);
    setSaving(true);
    try {
      if (isNew) {
        const created = await createVendeur({ ...form, password });
        // Affiche une seule fois les identifiants sur la fiche du nouveau vendeur.
        navigate(`/vendeurs/${created.id}`, {
          replace: true,
          state: { identifiants: { code: created.code, password, nom: created.nom } },
        });
      } else {
        const u = await updateUser(id!, form);
        setCompte(u);
        navigate("/vendeurs");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de l'enregistrement"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (nouveauMdp.length < MIN || !compte) return;
    setSaving(true);
    setError(null);
    try {
      await setUserPassword(compte.id, nouveauMdp);
      setIdentifiants({ code: compte.code, password: nouveauMdp, nom: compte.nom });
      setResetOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec du changement de mot de passe"));
    } finally {
      setSaving(false);
    }
  };

  const basculerAcces = async () => {
    if (!compte) return;
    setSaving(true);
    setError(null);
    try {
      setCompte(await updateUser(compte.id, { actif: !compte.actif }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec"));
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== "ADMIN") return <Navigate to="/factures" replace />;

  return (
    <IonPage>
      <AppHeader backHref="/vendeurs" title={isNew ? t("Nouveau vendeur") : compte?.nom ?? t("Vendeur")} />

      <IonContent>
        {error && <PageNotice>{error}</PageNotice>}
        {loading ? (
          <SkeletonList rows={4} />
        ) : (
          <>
            {identifiants && (
              <Section>
                <CarteIdentifiants
                  id={identifiants}
                  titre={isNew || location.state ? t("Compte créé") : t("Nouveau mot de passe enregistré")}
                  onClose={() => {
                    setIdentifiants(null);
                    navigate(location.pathname, { replace: true, state: null });
                  }}
                />
              </Section>
            )}

            {compte && (
              <div className="rc-page-notice">
                <div className="rc-tags" style={{ marginTop: 0 }}>
                  {compte.actif ? <Tag tone="positive" dot>{t("Actif")}</Tag> : <Tag tone="danger">{t("Désactivé")}</Tag>}
                  <Tag>{t("Vendeur")}</Tag>
                  {compte.createdAt && <Tag>{t("Créé le {date}", { date: formatDate(compte.createdAt) })}</Tag>}
                </div>
              </div>
            )}

            <Section label={t("Identité")}>
              <Group pad>
                <div className="rc-fields">
                  <Field
                    label={t("Nom complet")}
                    value={form.nom}
                    onChange={(v) => update("nom", v)}
                    autoCapitalize="words"
                    autoComplete="off"
                    required
                  />
                  <Field
                    label={t("Code de connexion")}
                    value={form.code}
                    onChange={(v) => update("code", v.toUpperCase())}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    hint={t("Le vendeur se connecte avec ce code (ex : V002).")}
                  />
                </div>
              </Group>
            </Section>

            <Section label={t("Contact")}>
              <Group pad>
                <div className="rc-fields">
                  <Field
                    label={t("Téléphone")}
                    type="tel"
                    inputMode="tel"
                    value={form.telephone ?? ""}
                    onChange={(v) => update("telephone", v)}
                  />
                  <Field
                    label={t("Email")}
                    type="email"
                    inputMode="email"
                    autoCapitalize="off"
                    value={form.email ?? ""}
                    onChange={(v) => update("email", v)}
                  />
                </div>
              </Group>
            </Section>

            {isNew ? (
              <Section label={t("Mot de passe")}>
                <Group pad>
                  <MotDePasseField label={t("Mot de passe")} value={password} onChange={setPassword} />
                </Group>
              </Section>
            ) : (
              compte && (
                <Section label={t("Accès")}>
                  <div className="rc-fields">
                    <Button variant="secondary" size="lg" block icon={keyOutline} onClick={() => { setNouveauMdp(""); setResetOpen(true); }}>
                      {t("Définir un nouveau mot de passe")}
                    </Button>
                    {compte.actif ? (
                      <Button variant="danger" block icon={banOutline} disabled={saving} onClick={() => setConfirmAcces(true)}>
                        {t("Désactiver le compte")}
                      </Button>
                    ) : (
                      <>
                        <Notice tone="warning">
                          {t("Compte désactivé : ce vendeur ne peut plus se connecter et n'apparaît plus dans les listes.")}
                        </Notice>
                        <Button variant="secondary" block loading={saving} onClick={basculerAcces}>
                          {t("Réactiver le compte")}
                        </Button>
                      </>
                    )}
                  </div>
                </Section>
              )
            )}
          </>
        )}

        <IonAlert
          isOpen={confirmAcces}
          onDidDismiss={() => setConfirmAcces(false)}
          header={t("Désactiver le compte ?")}
          message={`${compte?.nom ?? t("Ce vendeur")} sera déconnecté immédiatement et ne pourra plus se connecter. Ses factures, son stock camion et ses inventaires sont conservés. Vous pourrez réactiver le compte.`}
          buttons={[
            { text: t("Annuler"), role: "cancel" },
            { text: t("Désactiver"), role: "destructive", handler: basculerAcces },
          ]}
        />
      </IonContent>

      {!loading && (isNew || compte) && (
        <ActionBar hint={missing}>
          <Button size="lg" block loading={saving && !resetOpen} disabled={Boolean(missing)} onClick={handleSave}>
            {isNew ? t("Créer le compte") : t("Enregistrer")}
          </Button>
        </ActionBar>
      )}

      <Sheet isOpen={resetOpen} title={t("Nouveau mot de passe")} height="auto" onDismiss={() => setResetOpen(false)}>
        <Section>
          <div className="rc-fields">
            <MotDePasseField label={t("Nouveau mot de passe")} value={nouveauMdp} onChange={setNouveauMdp} />
            <Notice tone="info">
              {compte?.nom ?? t("Le vendeur")} sera déconnecté de ses appareils et devra utiliser ce nouveau mot de passe.
            </Notice>
            <Button size="lg" block loading={saving} disabled={nouveauMdp.length < MIN} onClick={handleReset}>
              {t("Enregistrer le mot de passe")}
            </Button>
          </div>
        </Section>
      </Sheet>
    </IonPage>
  );
}
