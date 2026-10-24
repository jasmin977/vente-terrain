import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  IonAlert,
  IonContent,
  IonIcon,
  IonPage,
  useIonViewWillEnter,
} from "@ionic/react";
import {
  addOutline,
  cardOutline,
  checkmarkDoneOutline,
  createOutline,
  documentTextOutline,
  gridOutline,
  refreshOutline,
  saveOutline,
  starOutline,
  trashOutline,
} from "ionicons/icons";
import { ApiError } from "../api/client";
import {
  enregistrerGabarit,
  listComptesBancaires,
  modifierCompteBancaire,
  supprimerCompteBancaire,
} from "../api/comptesBancaires";
import { useAuth } from "../auth/AuthContext";
import { useSociete } from "../societe/SocieteContext";
import ApercuEffet from "../components/effets/ApercuEffet";
import CompteBancaireSheet from "../components/effets/CompteBancaireSheet";
import ImpressionEffetSheet from "../components/effets/ImpressionEffetSheet";
import type {
  ChampGabarit,
  CompteBancaire,
  GabaritEffet,
  TypeEffet,
  ValeursEffet,
} from "../types/effet";
import {
  AccountButton,
  AppHeader,
  Button,
  EmptyState,
  Field,
  IconButton,
  Notice,
  PageNotice,
  PickerField,
  PickerSheet,
  Row,
  Section,
  Segmented,
  Tag,
} from "../ui";
import {
  champsDe,
  gabaritDe,
  gabaritParDefaut,
  imprimerPage,
  pageEffet,
  ribLisible,
  textesEffet,
} from "../utils/effets";
import { toLocalDateString } from "../utils/format";
import { t } from "../i18n";

type Vue = "imprimer" | "reglage" | "comptes";
const nombre = (v: string) => Number(v.replace(",", ".")) || 0;

/**
 * Fournisseurs › Impression traite / chèque : imprimer un effet hors règlement, régler la position du texte sur
 * le papier de chaque banque (une fois), et gérer les comptes bancaires de la société.
 */
export default function ImpressionEffets() {
  const { user } = useAuth();
  const { societe } = useSociete();
  const [vue, setVue] = useState<Vue>("imprimer");
  const [comptes, setComptes] = useState<CompteBancaire[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [libre, setLibre] = useState<TypeEffet | null>(null);
  const [edition, setEdition] = useState<CompteBancaire | "nouveau" | null>(
    null,
  );
  const [aSupprimer, setASupprimer] = useState<CompteBancaire | null>(null);

  const charger = useCallback(async () => {
    try {
      setComptes(await listComptesBancaires());
    } catch (err) {
      setComptes([]);
      setErreur(
        err instanceof ApiError
          ? err.message
          : t("Impossible de charger les comptes bancaires"),
      );
    }
  }, []);
  useEffect(() => {
    void charger();
  }, [charger]);
  useIonViewWillEnter(() => void charger(), [charger]);

  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;

  const parDefaut = async (c: CompteBancaire) => {
    await modifierCompteBancaire(c.id, {
      banque: c.banque,
      agence: c.agence,
      rib: c.rib,
      titulaire: c.titulaire,
      ville: c.ville,
      parDefaut: true,
    });
    await charger();
  };

  return (
    <IonPage>
      <AppHeader
        large
        eyebrow={t("Fournisseurs")}
        title={t("Impression traite / chèque")}
        actions={<AccountButton />}
      >
        <Segmented
          label={t("Affichage")}
          variant="onglets"
          value={vue}
          onChange={setVue}
          options={[
            { value: "imprimer", label: t("Imprimer") },
            { value: "reglage", label: t("Réglage du papier") },
            { value: "comptes", label: t("Comptes bancaires") },
          ]}
        />
      </AppHeader>
      <IonContent>
        {erreur && <PageNotice>{erreur}</PageNotice>}
        {info && (
          <PageNotice
            tone="info"
            icon={checkmarkDoneOutline}
            actionLabel={t("Fermer")}
            onAction={() => setInfo(null)}
          >
            {info}
          </PageNotice>
        )}

        {vue === "imprimer" && (
          <Section label={t("Imprimer un effet")}>
            <p className="rc-footnote rc-effets__intro">
              {t(
                "Après un règlement fournisseur par chèque ou traite, l'impression est proposée directement, déjà remplie. Ici, vous imprimez un effet qui n'est pas lié à un règlement.",
              )}
            </p>
            <div className="rc-effets__choix">
              <button
                type="button"
                className="rc-effets__tuile"
                onClick={() => setLibre("TRAITE")}
              >
                <span className="rc-effets__icone" aria-hidden="true">
                  <IonIcon icon={documentTextOutline} />
                </span>
                <strong>{t("Imprimer une traite")}</strong>
                <span>{t("Lettre de change · 176 × 115 mm par défaut")}</span>
              </button>
              <button
                type="button"
                className="rc-effets__tuile"
                onClick={() => setLibre("CHEQUE")}
              >
                <span className="rc-effets__icone" aria-hidden="true">
                  <IonIcon icon={cardOutline} />
                </span>
                <strong>{t("Imprimer un chèque")}</strong>
                <span>{t("175 × 80 mm par défaut")}</span>
              </button>
            </div>
          </Section>
        )}

        {vue === "reglage" &&
          (comptes && comptes.length === 0 ? (
            <EmptyState
              icon={cardOutline}
              title={t("Aucun compte bancaire.")}
              message={t(
                "Le réglage se fait pour les chèques et les traites de chaque compte : ajoutez d'abord le compte de la société.",
              )}
              action={
                <Button icon={addOutline} onClick={() => setEdition("nouveau")}>
                  {t("Ajouter un compte bancaire")}
                </Button>
              }
            />
          ) : (
            comptes && (
              <ReglagePapier
                comptes={comptes}
                payeur={societe?.nom ?? ""}
                onEnregistre={(c) => {
                  setComptes((l) =>
                    (l ?? []).map((x) => (x.id === c.id ? c : x)),
                  );
                  setInfo(t("Réglage enregistré."));
                }}
              />
            )
          ))}

        {vue === "comptes" && (
          <Section
            label={t("Comptes bancaires de la société")}
            aside={comptes ? `${comptes.length}` : undefined}
          >
            {comptes && comptes.length === 0 ? (
              <EmptyState
                icon={cardOutline}
                title={t("Aucun compte bancaire.")}
                message={t(
                  "La banque, l'agence et le RIB sont imprimés sur les chèques et les traites.",
                )}
              />
            ) : (
              <div className="rc-list">
                {(comptes ?? []).map((c) => (
                  <Row
                    key={c.id}
                    title={`${c.banque}${c.agence ? ` · ${c.agence}` : ""}`}
                    meta={`${ribLisible(c.rib)}${
                      c.titulaire ? ` · ${c.titulaire}` : ""
                    }${c.ville ? ` · ${c.ville}` : ""}`}
                    trailing={
                      <span className="rc-effets__actions">
                        {c.parDefaut ? (
                          <Tag tone="accent" dot>
                            {t("Par défaut")}
                          </Tag>
                        ) : (
                          <Button
                            variant="ghost"
                            icon={starOutline}
                            onClick={() => void parDefaut(c)}
                          >
                            {t("Par défaut")}
                          </Button>
                        )}
                        <IconButton
                          icon={createOutline}
                          label={t("Modifier")}
                          onClick={() => setEdition(c)}
                        />
                        <IconButton
                          icon={trashOutline}
                          tone="danger"
                          label={t("Supprimer")}
                          onClick={() => setASupprimer(c)}
                        />
                      </span>
                    }
                  />
                ))}
              </div>
            )}
            <div className="rc-effets__ajout">
              <Button icon={addOutline} onClick={() => setEdition("nouveau")}>
                {t("Ajouter un compte bancaire")}
              </Button>
            </div>
          </Section>
        )}

        <ImpressionEffetSheet
          isOpen={libre !== null}
          type={libre ?? "TRAITE"}
          typeModifiable
          onDismiss={() => setLibre(null)}
        />
        <CompteBancaireSheet
          isOpen={edition !== null}
          compte={edition === "nouveau" ? null : edition}
          titulairePropose={societe?.nom}
          onDismiss={() => setEdition(null)}
          onEnregistre={() => {
            setInfo(t("Compte bancaire enregistré."));
            void charger();
          }}
        />
        <IonAlert
          isOpen={aSupprimer !== null}
          onDidDismiss={() => setASupprimer(null)}
          header={t("Supprimer ce compte ?")}
          message={
            aSupprimer
              ? `${aSupprimer.banque} · ${ribLisible(aSupprimer.rib)}`
              : undefined
          }
          buttons={[
            { text: t("Non"), role: "cancel" },
            {
              text: t("Supprimer"),
              role: "destructive",
              handler: () => {
                if (aSupprimer)
                  void supprimerCompteBancaire(aSupprimer.id).then(charger);
              },
            },
          ]}
        />
      </IonContent>
    </IonPage>
  );
}

// ---------------------------------------------------------------- Réglage du papier

/** Valeurs d'exemple pour voir chaque champ à sa place pendant le réglage. */
function exemple(payeur: string): ValeursEffet {
  const d = new Date();
  const ech = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return {
    numero: "",
    montant: 5381.8,
    ordre: "Société Laitière du Sahel",
    dateCreation: toLocalDateString(d),
    lieu: "Msaken",
    echeance: toLocalDateString(ech),
    payeur: payeur || "Ma société",
    monnaie: "Dinars",
  };
}

function ReglagePapier({
  comptes,
  payeur,
  onEnregistre,
}: {
  comptes: CompteBancaire[];
  payeur: string;
  onEnregistre: (c: CompteBancaire) => void;
}) {
  const [compteId, setCompteId] = useState(
    comptes.find((c) => c.parDefaut)?.id ?? comptes[0]?.id,
  );
  const [type, setType] = useState<TypeEffet>("TRAITE");
  const compte = comptes.find((c) => c.id === compteId) ?? comptes[0];
  const [g, setG] = useState<GabaritEffet>(() =>
    gabaritDe("TRAITE", compte?.gabarits?.TRAITE),
  );
  const [selection, setSelection] = useState<string | null>(null);
  const [pickerCompte, setPickerCompte] = useState(false);
  const [modifie, setModifie] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Changer de compte ou d'effet recharge son réglage enregistré.
  useEffect(() => {
    setG(gabaritDe(type, compte?.gabarits?.[type]));
    setSelection(null);
    setModifie(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compteId, type]);

  const textes = useMemo(
    () =>
      textesEffet(
        type,
        g,
        exemple(compte?.titulaire || payeur),
        compte ?? null,
      ),
    [type, g, compte, payeur],
  );
  const changer = (maj: Partial<GabaritEffet>) => {
    setG((x) => ({ ...x, ...maj }));
    setModifie(true);
  };
  const changerChamp = (cle: string, maj: Partial<ChampGabarit>) => {
    setG((x) => ({
      ...x,
      champs: { ...x.champs, [cle]: { ...x.champs[cle], ...maj } },
    }));
    setModifie(true);
  };
  const champ = selection ? g.champs[selection] : null;
  const definition = champsDe(type).find((d) => d.cle === selection);

  const enregistrer = async () => {
    if (!compte) return;
    setEnCours(true);
    setErreur(null);
    try {
      onEnregistre(await enregistrerGabarit(compte.id, type, g));
      setModifie(false);
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.message
          : t("Impossible d'enregistrer le réglage"),
      );
    } finally {
      setEnCours(false);
    }
  };

  // Déplacement au clavier du champ choisi : flèches = 0,5 mm, Maj + flèche = 2 mm.
  const auClavier = (e: React.KeyboardEvent) => {
    if (!selection || !champ) return;
    const pas = e.shiftKey ? 2 : 0.5;
    const d = {
      ArrowLeft: [-pas, 0],
      ArrowRight: [pas, 0],
      ArrowUp: [0, -pas],
      ArrowDown: [0, pas],
    }[e.key];
    if (!d) return;
    e.preventDefault();
    changerChamp(selection, {
      x: Math.round((champ.x + d[0]) * 4) / 4,
      y: Math.round((champ.y + d[1]) * 4) / 4,
    });
  };

  return (
    <div className="rc-effets__reglage">
      {erreur && <PageNotice>{erreur}</PageNotice>}
      <div className="rc-effets__barre">
        <PickerField
          label={t("Compte")}
          value={
            compte ? `${compte.banque} · ${ribLisible(compte.rib)}` : undefined
          }
          placeholder={t("Choisir le compte")}
          onOpen={() => setPickerCompte(true)}
        />
        <Segmented
          label={t("Effet")}
          value={type}
          onChange={setType}
          options={[
            { value: "TRAITE", label: t("Traite") },
            { value: "CHEQUE", label: t("Chèque") },
          ]}
        />
      </div>

      <Notice tone="info">
        {t(
          "Chaque texte s'imprime dans sa case : il s'y centre, rapetisse ou passe à la ligne pour ne jamais en sortir. Cliquez une case pour la choisir, faites-la glisser (ou flèches du clavier) et agrandissez-la par son coin. Puis « Test sur papier blanc » : posez la feuille sur une vraie traite à contre-jour et corrigez le calage X / Y si tout est décalé.",
        )}
      </Notice>

      <div className="rc-effets__papier">
        <fieldset className="rc-effets__groupe">
          <legend>{t("Papier")}</legend>
          <div className="rc-effets__grille">
            <Field label={t("Largeur")} inputMode="decimal" value={g.largeur} suffix="mm" onChange={(v) => changer({ largeur: nombre(v) || g.largeur })} />
            <Field label={t("Hauteur")} inputMode="decimal" value={g.hauteur} suffix="mm" onChange={(v) => changer({ hauteur: nombre(v) || g.hauteur })} />
          </div>
        </fieldset>
        <fieldset className="rc-effets__groupe">
          <legend>{t("Calage de l'imprimante")}</legend>
          <div className="rc-effets__grille">
            <Field label={t("Vers la droite")} inputMode="decimal" value={g.decalageX} suffix="mm" onChange={(v) => changer({ decalageX: nombre(v) })} />
            <Field label={t("Vers le bas")} inputMode="decimal" value={g.decalageY} suffix="mm" onChange={(v) => changer({ decalageY: nombre(v) })} />
          </div>
        </fieldset>
        <fieldset className="rc-effets__groupe">
          <legend>{t("Impression")}</legend>
          <div className="rc-effets__choix-ligne">
            <span>{t("Page")}</span>
            <Segmented
              label={t("Page")}
              value={g.papier}
              onChange={(papier) => changer({ papier })}
              options={[
                { value: "EFFET", label: t("Format effet") },
                { value: "A4", label: "A4" },
              ]}
            />
          </div>
          <div className="rc-effets__choix-ligne">
            <span>{t("Sens")}</span>
            <Segmented
              label={t("Sens")}
              value={g.rotation ? "retourne" : "normal"}
              onChange={(v) => changer({ rotation: v === "retourne" })}
              options={[
                { value: "normal", label: t("Normal") },
                { value: "retourne", label: "180°" },
              ]}
            />
          </div>
        </fieldset>
      </div>

      <div className="rc-effets__outils">
        <Button
          variant="ghost"
          icon={refreshOutline}
          onClick={() => {
            setG(gabaritParDefaut(type));
            setModifie(true);
          }}
        >
          {t("Cases par défaut")}
        </Button>
      </div>

      <div
        className="rc-effets__plan"
        tabIndex={0}
        onKeyDown={auClavier}
        aria-label={t("Plan du papier : flèches pour déplacer le champ choisi")}
      >
        <ApercuEffet
          type={type}
          gabarit={g}
          textes={textes}
          editable
          selection={selection}
          onSelect={setSelection}
          onChanger={(cle, maj) => changerChamp(cle, maj)}
        />
      </div>

      <div className="rc-effets__champs">
        {champsDe(type).map((d) => (
          <button
            key={d.cle}
            type="button"
            className={`rc-effets__puce${
              selection === d.cle ? " rc-effets__puce--active" : ""
            }${g.champs[d.cle]?.masque ? " rc-effets__puce--masque" : ""}`}
            onClick={() => setSelection(d.cle)}
          >
            {t(d.libelle)}
          </button>
        ))}
      </div>

      {champ && definition && (
        <div className="rc-effets__inspecteur">
          <div className="rc-effets__inspecteur-tete">
            <strong>{t(definition.libelle)}</strong>
            <Segmented
              label={t("Imprimé")}
              value={champ.masque ? "non" : "oui"}
              onChange={(v) => changerChamp(selection!, { masque: v === "non" })}
              options={[
                { value: "oui", label: t("Imprimé") },
                { value: "non", label: t("Masqué") },
              ]}
            />
          </div>
          <fieldset className="rc-effets__groupe">
            <legend>{t("Position et taille de la case")}</legend>
            <div className="rc-effets__grille rc-effets__grille--4">
              <Field label="X" inputMode="decimal" value={champ.x} suffix="mm" onChange={(v) => changerChamp(selection!, { x: nombre(v) })} />
              <Field label="Y" inputMode="decimal" value={champ.y} suffix="mm" onChange={(v) => changerChamp(selection!, { y: nombre(v) })} />
              <Field label={t("Largeur")} inputMode="decimal" value={champ.largeur} suffix="mm" onChange={(v) => changerChamp(selection!, { largeur: Math.max(2, nombre(v)) })} />
              <Field label={t("Hauteur")} inputMode="decimal" value={champ.hauteur} suffix="mm" onChange={(v) => changerChamp(selection!, { hauteur: Math.max(2, nombre(v)) })} />
            </div>
          </fieldset>
          <fieldset className="rc-effets__groupe">
            <legend>{t("Texte")}</legend>
            <div className="rc-effets__grille rc-effets__grille--4">
              <Field
                label={t("Taille max")}
                inputMode="decimal"
                value={champ.taille}
                suffix="pt"
                onChange={(v) => changerChamp(selection!, { taille: Math.min(24, Math.max(5, nombre(v) || 10)) })}
              />
              <Field
                label={t("Lignes")}
                inputMode="numeric"
                value={champ.lignes ?? 1}
                onChange={(v) => changerChamp(selection!, { lignes: Math.min(8, Math.max(1, Math.round(nombre(v)) || 1)) })}
              />
              <div className="rc-effets__alignement">
                <span>{t("Alignement")}</span>
                <Segmented
                  label={t("Alignement")}
                  value={champ.alignement ?? "centre"}
                  onChange={(alignement) => changerChamp(selection!, { alignement })}
                  options={[
                    { value: "gauche", label: t("Gauche") },
                    { value: "centre", label: t("Centre") },
                    { value: "droite", label: t("Droite") },
                  ]}
                />
              </div>
            </div>
            <p className="rc-footnote">{t("Le texte est réduit automatiquement s'il ne tient pas dans la case.")}</p>
          </fieldset>
        </div>
      )}

      <div className="rc-effets__pied">
        <Button
          variant="secondary"
          icon={gridOutline}
          onClick={() =>
            void imprimerPage(
              pageEffet(type, g, textes, {
                test: true,
                origine: window.location.origin,
              }),
            )
          }
        >
          {t("Test sur papier blanc")}
        </Button>
        <Button
          icon={saveOutline}
          loading={enCours}
          disabled={!modifie}
          onClick={enregistrer}
        >
          {modifie ? t("Enregistrer le réglage") : t("Réglage enregistré")}
        </Button>
      </div>

      <PickerSheet
        isOpen={pickerCompte}
        title={t("Compte")}
        value={compteId}
        onDismiss={() => setPickerCompte(false)}
        onSelect={(id) => {
          setCompteId(id);
          setPickerCompte(false);
        }}
        options={comptes.map((c) => ({
          value: c.id,
          label: `${c.banque}${c.agence ? ` ${c.agence}` : ""}`,
          meta: ribLisible(c.rib),
        }))}
      />
    </div>
  );
}
