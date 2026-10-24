import { useCallback, useEffect, useState } from "react";
import { IonContent, IonIcon, IonPage, useIonViewWillEnter } from "@ionic/react";
import { addOutline, desktopOutline, keyOutline, linkOutline, trashOutline, unlinkOutline } from "ionicons/icons";
import { ApiError } from "../../api/client";
import { codeAppairage, creerPoste, dissocierPoste, enregistrerParametres, getParametres, listPostes, modifierPoste, supprimerPoste } from "../../api/caisse";
import type { PosteCaisse } from "../../types/caisse";
import { AccountButton, AppHeader, Button, EmptyState, Fab, Field, Notice, PageNotice, Sheet, TableauDonnees, Tag } from "../../ui";
import type { ColonneDonnees } from "../../ui";
import { formatDateTime, formatTime } from "../../utils/format";
import { t, tn } from "../../i18n";
import GardeSupermarche from "./GardeSupermarche";

/** Code affiché par groupes de 3 chiffres : 148 712. */
const codeLisible = (c: string) => `${c.slice(0, 3)} ${c.slice(3)}`;

function Etat({ p }: { p: PosteCaisse }) {
  if (!p.actif) return <Tag tone="neutral">{t("Désactivée")}</Tag>;
  if (p.codeAppairage) return <Tag tone="warning" dot>{t("Code en attente")}</Tag>;
  if (p.appaireeLe) return <Tag tone="positive" dot>{t("Appairée")}</Tag>;
  return <Tag tone="neutral" dot>{t("Non appairée")}</Tag>;
}

/** Réglages communs aux caisses de la société : commission retenue sur les tickets restaurant. */
function ParametresCaisse() {
  const [taux, setTaux] = useState("");
  const [enregistre, setEnregistre] = useState<number | null>(null);
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    void getParametres()
      .then((p) => {
        setTaux(String(p.commissionTicketResto).replace(".", ","));
        setEnregistre(p.commissionTicketResto);
      })
      .catch(() => undefined);
  }, []);
  const valeur = Number(taux.replace(",", "."));
  const valide = taux.trim() !== "" && Number.isFinite(valeur) && valeur >= 0 && valeur <= 50;
  const enregistrer = async () => {
    setEnCours(true);
    setMessage(null);
    try {
      const p = await enregistrerParametres({ commissionTicketResto: valeur });
      setEnregistre(p.commissionTicketResto);
      setMessage({ texte: t("Enregistré : vaut pour les prochaines ventes."), ok: true });
    } catch (err) {
      setMessage({ texte: err instanceof ApiError ? err.message : t("Échec de l'enregistrement"), ok: false });
    } finally {
      setEnCours(false);
    }
  };
  return (
    <section className="rc-caisse-param">
      <div>
        <strong>{t("Commission ticket restaurant")}</strong>
        <p className="rc-footnote">
          {t("Retenue par l'émetteur quand le magasin se fait rembourser les tickets restaurant (souvent 10 %). Les tickets cadeaux n'en ont pas. Chaque vente garde le taux du jour.")}
        </p>
      </div>
      <div className="rc-caisse-param__saisie">
        <Field label={t("Commission")} hideLabel value={taux} onChange={setTaux} inputMode="decimal" staticSuffix="%" error={taux && !valide ? t("0 à 50 %") : null} />
        <Button variant="secondary" loading={enCours} disabled={!valide || enCours || valeur === enregistre} onClick={() => void enregistrer()}>
          {t("Enregistrer")}
        </Button>
      </div>
      {message && <Notice tone={message.ok ? "info" : "danger"}>{message.texte}</Notice>}
    </section>
  );
}

/**
 * Caisse › Postes de caisse (TPV) : l'admin ajoute les caisses du magasin, puis associe chaque PC de caisse à son
 * poste avec un code d'appairage à usage unique (saisi une fois dans l'application de caisse).
 */
export default function CaissePostes() {
  const [postes, setPostes] = useState<PosteCaisse[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<PosteCaisse | "nouveau" | null>(null);
  const [nom, setNom] = useState("");
  const [numero, setNumero] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreurFiche, setErreurFiche] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setPostes(await listPostes());
      setErreur(null);
    } catch (err) {
      setPostes([]);
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les caisses"));
    }
  }, []);
  useEffect(() => {
    void charger();
  }, [charger]);
  useIonViewWillEnter(() => void charger(), [charger]);

  const poste = ouvert && ouvert !== "nouveau" ? (postes?.find((p) => p.id === ouvert.id) ?? ouvert) : null;
  const action = async (fn: () => Promise<unknown>, fermer = false) => {
    setEnCours(true);
    setErreurFiche(null);
    try {
      await fn();
      await charger();
      if (fermer) setOuvert(null);
    } catch (err) {
      setErreurFiche(err instanceof ApiError ? err.message : t("Échec de l'opération"));
    } finally {
      setEnCours(false);
    }
  };
  const remplacer = (p: PosteCaisse) => setPostes((l) => (l ?? []).map((x) => (x.id === p.id ? { ...x, ...p } : x)));

  const colonnes: ColonneDonnees<PosteCaisse>[] = [
    { id: "numero", titre: t("N°"), rendu: (p) => <strong>{p.numero}</strong>, tri: (p) => p.numero, largeur: "70px" },
    { id: "nom", titre: t("Caisse"), principale: true, souple: true, rendu: (p) => p.nom, tri: (p) => p.nom },
    { id: "etat", titre: t("État"), rendu: (p) => <Etat p={p} />, tri: (p) => (p.appaireeLe ? 1 : 0), largeur: "160px" },
    {
      id: "session",
      titre: t("Session"),
      rendu: (p) => (p.sessionOuverte ? t("Ouverte par {n} à {h}", { n: p.sessionOuverte.caissier.nom, h: formatTime(p.sessionOuverte.ouverteLe) }) : "—"),
      largeur: "220px",
    },
    { id: "sync", titre: t("Dernier envoi"), rendu: (p) => (p.derniereSyncLe ? formatDateTime(p.derniereSyncLe) : "—"), tri: (p) => p.derniereSyncLe ?? "", largeur: "170px" },
  ];

  return (
    <IonPage className="rc-page--large">
      <AppHeader large eyebrow={t("Caisse")} title={t("Postes de caisse")} actions={<AccountButton />} />
      <IonContent>
        <GardeSupermarche>
          <Fab
            icon={addOutline}
            label={t("Nouvelle caisse")}
            onClick={() => {
              setNom(t("Caisse {n}", { n: (postes?.length ?? 0) + 1 }));
              setNumero("");
              setErreurFiche(null);
              setOuvert("nouveau");
            }}
          />
          <div className="rc-transfo">
            {erreur && <PageNotice>{erreur}</PageNotice>}
            {postes && postes.length === 0 ? (
              <EmptyState
                icon={desktopOutline}
                title={t("Aucune caisse.")}
                message={t("Ajoutez les caisses du magasin, puis associez chaque PC de caisse avec son code d'appairage.")}
              />
            ) : (
              <div className="rc-transfo__zone">
                <TableauDonnees
                  label={t("Postes de caisse")}
                  lignes={postes ?? []}
                  colonnes={colonnes}
                  cle={(p) => p.id}
                  onOuvrir={(p) => {
                    setNom(p.nom);
                    setNumero(String(p.numero));
                    setErreurFiche(null);
                    setOuvert(p);
                  }}
                  triInitial={{ colonne: "numero" }}
                  pied={<strong>{tn(postes?.length ?? 0, "{n} caisse", "{n} caisses")}</strong>}
                />
              </div>
            )}
            <ParametresCaisse />
          </div>

          <Sheet
            isOpen={ouvert !== null}
            title={poste ? t("Caisse n° {n}", { n: poste.numero }) : t("Nouvelle caisse")}
            height="auto"
            onDismiss={() => setOuvert(null)}
            footer={
              <Button
                size="lg"
                block
                loading={enCours}
                disabled={!nom.trim() || enCours}
                onClick={() =>
                  void action(async () => {
                    const body = { nom: nom.trim(), ...(numero ? { numero: Number(numero) } : {}) };
                    if (poste) await modifierPoste(poste.id, body);
                    else await creerPoste(body);
                  }, true)
                }
              >
                {poste ? t("Enregistrer") : t("Créer la caisse")}
              </Button>
            }
          >
            <div className="rc-fields rc-sheet__form">
              {erreurFiche && <Notice>{erreurFiche}</Notice>}
              <Field label={t("Nom")} value={nom} onChange={setNom} placeholder={t("ex : Caisse 1, Caisse rapide")} />
              <Field
                label={t("Numéro")}
                value={numero}
                onChange={(v) => setNumero(v.replace(/\D/g, "").slice(0, 3))}
                inputMode="numeric"
                hint={poste ? t("Imprimé sur les tickets (C{n}-…).", { n: numero || poste.numero }) : t("Vide : le numéro suivant.")}
              />

              {poste && (
                <>
                  <div className="rc-caisse-appairage">
                    {poste.codeAppairage ? (
                      <>
                        <span>{t("Code d'appairage")}</span>
                        <strong className="rc-caisse-appairage__code">{codeLisible(poste.codeAppairage)}</strong>
                        <small>
                          {t("Saisissez ce code dans l'application de caisse du PC. Valable jusqu'à {h}, une seule fois.", {
                            h: formatTime(poste.codeExpireLe!),
                          })}
                        </small>
                      </>
                    ) : poste.appaireeLe ? (
                      <>
                        <span>
                          <IonIcon icon={linkOutline} /> {t("PC de caisse associé le {d}", { d: formatDateTime(poste.appaireeLe) })}
                        </span>
                        <small>{t("Nouveau PC ou application réinstallée : générez un nouveau code (l'ancien PC perd l'accès).")}</small>
                      </>
                    ) : (
                      <>
                        <span>{t("Aucun PC de caisse associé")}</span>
                        <small>{t("Générez un code puis saisissez-le dans l'application de caisse.")}</small>
                      </>
                    )}
                    <div className="rc-caisse-appairage__actions">
                      <Button variant="secondary" icon={keyOutline} disabled={enCours} onClick={() => void action(async () => remplacer(await codeAppairage(poste.id)))}>
                        {poste.codeAppairage ? t("Nouveau code") : t("Générer un code d'appairage")}
                      </Button>
                      {poste.appaireeLe && (
                        <Button
                          variant="ghost"
                          icon={unlinkOutline}
                          disabled={enCours}
                          onClick={() => {
                            if (window.confirm(t("Dissocier le PC de la caisse « {n} » ? Il ne pourra plus envoyer de tickets.", { n: poste.nom })))
                              void action(() => dissocierPoste(poste.id));
                          }}
                        >
                          {t("Dissocier")}
                        </Button>
                      )}
                    </div>
                  </div>

                  <label className="rc-caisse-case">
                    <input type="checkbox" checked={poste.actif} disabled={enCours} onChange={(e) => void action(() => modifierPoste(poste.id, { actif: e.target.checked }))} />
                    <span>
                      <strong>{t("Caisse active")}</strong>
                      <small>{t("Désactivée, la caisse ne peut plus ouvrir de session ni envoyer de tickets.")}</small>
                    </span>
                  </label>

                  <label className="rc-caisse-case">
                    <input
                      type="checkbox"
                      checked={poste.comptageCaissier}
                      disabled={enCours}
                      onChange={(e) => void action(() => modifierPoste(poste.id, { comptageCaissier: e.target.checked }))}
                    />
                    <span>
                      <strong>{t("Le caissier compte les espèces à la clôture")}</strong>
                      <small>
                        {t(
                          "Décoché (conseillé) : clôture à l'aveugle. Le caissier ne voit pas le montant attendu, il remet sa recette avec le ticket Z signé et le responsable saisit le montant remis dans Caisse › Clôtures.",
                        )}
                      </small>
                    </span>
                  </label>

                  <Button
                    variant="danger"
                    icon={trashOutline}
                    disabled={enCours}
                    onClick={() => {
                      if (window.confirm(t("Supprimer la caisse « {n} » ? Ses tickets restent dans les rapports.", { n: poste.nom }))) void action(() => supprimerPoste(poste.id), true);
                    }}
                  >
                    {t("Supprimer la caisse")}
                  </Button>
                </>
              )}
            </div>
          </Sheet>
        </GardeSupermarche>
      </IonContent>
    </IonPage>
  );
}
