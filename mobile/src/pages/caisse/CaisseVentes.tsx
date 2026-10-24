import { Fragment, useCallback, useEffect, useState } from "react";
import { IonContent, IonIcon, IonPage, useIonViewWillEnter } from "@ionic/react";
import { chevronDownOutline, chevronForwardOutline, receiptOutline } from "ionicons/icons";
import { ApiError } from "../../api/client";
import { getSynthese, getTicket, listSessions, listTickets, listTicketsSession, saisirRemise } from "../../api/caisse";
import type { ModeReglementCaisse, SessionCaisse, SyntheseCaisse, TicketDetail, TicketResume } from "../../types/caisse";
import { AccountButton, AppHeader, Button, EmptyState, Field, Money, Notice, PageNotice, Section, Sheet, Spinner, TableauDonnees, Tag } from "../../ui";
import type { ColonneDonnees } from "../../ui";
import { formatAmount, formatDateTime, formatTime, toLocalDateString } from "../../utils/format";
import { t, tn } from "../../i18n";
import GardeSupermarche from "./GardeSupermarche";

const LIBELLES_MODES: Record<ModeReglementCaisse, string> = {
  ESPECES: "Espèces",
  TPE: "TPE",
  CHEQUE: "Chèque",
  TICKET_RESTO: "Ticket restaurant",
  BON_ACHAT: "Ticket cadeau",
};
const MODES = Object.keys(LIBELLES_MODES) as ModeReglementCaisse[];
const n = (v: string | number) => Number(v);
const numeroTicket = (x: { caisse: { numero: number }; numero: number }) => `C${x.caisse.numero}-${x.numero}`;

type Vue = "synthese" | "tickets" | "clotures";
const TITRES: Record<Vue, string> = { synthese: "Synthèse des ventes", tickets: "Tickets de caisse", clotures: "Clôtures de caisse" };

/** Caisse › Ventes : synthèse de la période, tickets envoyés par les caisses, sessions et clôtures (Z) avec l'écart de caisse. */
export default function CaisseVentes({ vue }: { vue: Vue }) {
  const auj = toLocalDateString(new Date());
  const [du, setDu] = useState(auj);
  const [au, setAu] = useState(auj);
  const [synthese, setSynthese] = useState<SyntheseCaisse | null>(null);
  const [tickets, setTickets] = useState<TicketResume[] | null>(null);
  const [sessions, setSessions] = useState<SessionCaisse[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionCaisse | null>(null);

  const charger = useCallback(async () => {
    try {
      if (vue === "synthese") setSynthese(await getSynthese(du, au));
      else if (vue === "tickets") setTickets(await listTickets(du, au));
      else setSessions(await listSessions(du, au));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les ventes de caisse"));
    }
  }, [vue, du, au]);
  useEffect(() => {
    void charger();
  }, [charger]);
  useIonViewWillEnter(() => void charger(), [charger]);

  const raccourci = (jours: number | "mois") => {
    const d = new Date();
    if (jours === "mois") d.setDate(1);
    else d.setDate(d.getDate() - jours);
    setDu(toLocalDateString(d));
    setAu(auj);
  };

  return (
    <IonPage className="rc-page--large">
      <AppHeader large eyebrow={t("Caisse")} title={t(TITRES[vue])} actions={<AccountButton />} />
      <IonContent>
        <GardeSupermarche>
          <div className="rc-transfo">
            {erreur && <PageNotice>{erreur}</PageNotice>}
            <div className="rc-achat__barre">
              <div className="rc-achat__filtres">
                <Field label={t("Du")} hideLabel prefix={<span className="rc-bl__prefixe">{t("Du")}</span>} type="date" value={du} max={au || undefined} onChange={setDu} />
                <Field label={t("Au")} hideLabel prefix={<span className="rc-bl__prefixe">{t("Au")}</span>} type="date" value={au} min={du || undefined} onChange={setAu} />
                <Button variant="ghost" onClick={() => raccourci(0)}>
                  {t("Aujourd'hui")}
                </Button>
                <Button variant="ghost" onClick={() => raccourci(6)}>
                  {t("7 jours")}
                </Button>
                <Button variant="ghost" onClick={() => raccourci("mois")}>
                  {t("Ce mois")}
                </Button>
              </div>
            </div>

            {vue === "synthese" && (synthese ? <Synthese s={synthese} /> : <Spinner />)}
            {vue === "tickets" && (tickets ? <ListeTickets tickets={tickets} onOuvrir={setTicketId} /> : <Spinner />)}
            {vue === "clotures" && (sessions ? <ListeSessions sessions={sessions} onOuvrir={setSession} onRecharger={() => void charger()} /> : <Spinner />)}
          </div>

          <TicketSheet id={ticketId} onDismiss={() => setTicketId(null)} />
          <SessionSheet session={session} onDismiss={() => setSession(null)} onTicket={setTicketId} />
        </GardeSupermarche>
      </IonContent>
    </IonPage>
  );
}

function Synthese({ s }: { s: SyntheseCaisse }) {
  const total = MODES.reduce((x, m) => x + Math.max(0, s.parMode[m] ?? 0), 0);
  return (
    <div className="rc-res">
      <div className="rc-res__chiffres">
        <div className="rc-res__chiffre">
          <span>{t("Chiffre d'affaires TTC")}</span>
          <Money value={s.ventes - s.retours} size="xl" />
          <small>
            {t("ventes")} <Money value={s.ventes} size="sm" /> · {t("retours")} <Money value={s.retours} size="sm" />
          </small>
        </div>
        <div className="rc-res__chiffre">
          <span>{t("Tickets")}</span>
          <strong>{s.nbTickets}</strong>
          <small>{t("ventes encaissées")}</small>
        </div>
        {(s.parMode.TICKET_RESTO ?? 0) > 0 && (
          <div className="rc-res__chiffre">
            <span>{t("Tickets restaurant")}</span>
            <Money value={(s.parMode.TICKET_RESTO ?? 0) - s.commissionResto} size="xl" />
            <small>
              {t("net reçu")} · {t("valeur")} <Money value={s.parMode.TICKET_RESTO ?? 0} size="sm" /> − {t("commission")} <Money value={s.commissionResto} size="sm" />
            </small>
          </div>
        )}
        <div className="rc-res__chiffre">
          <span>{t("Panier moyen")}</span>
          <Money value={s.panierMoyen} size="xl" />
          <small>{t("TTC par ticket")}</small>
        </div>
      </div>

      <Section label={t("Par mode de règlement")}>
        <ul className="rc-caisse-modes">
          {MODES.filter((m) => s.parMode[m]).map((m) => (
            <li key={m}>
              <span>{t(LIBELLES_MODES[m])}</span>
              <span className="rc-caisse-modes__barre">
                <span style={{ width: `${total ? Math.max(2, (Math.max(0, s.parMode[m] ?? 0) / total) * 100) : 0}%` }} />
              </span>
              <Money value={s.parMode[m] ?? 0} />
            </li>
          ))}
          {MODES.every((m) => !s.parMode[m]) && <li className="rc-footnote">{t("Aucun encaissement sur la période.")}</li>}
        </ul>
      </Section>

      <Section label={t("Meilleures ventes")} aside={`${s.topArticles.length}`}>
        {s.topArticles.length === 0 ? (
          <p className="rc-footnote">{t("Aucune vente sur la période.")}</p>
        ) : (
          <TableauDonnees
            label={t("Meilleures ventes")}
            lignes={s.topArticles}
            cle={(a) => a.articleId}
            chevron={false}
            triInitial={{ colonne: "montant", inverse: true }}
            colonnes={[
              { id: "article", titre: t("Article"), principale: true, souple: true, rendu: (a) => a.designation, tri: (a) => a.designation },
              { id: "quantite", titre: t("Quantité"), rendu: (a) => Number(a.quantite.toFixed(3)).toLocaleString("fr-FR"), tri: (a) => a.quantite, aligne: "end", largeur: "120px" },
              { id: "montant", titre: t("Montant TTC"), rendu: (a) => <Money value={a.montant} />, tri: (a) => a.montant, aligne: "end", largeur: "150px" },
            ]}
          />
        )}
      </Section>
    </div>
  );
}

const modesTexte = (p: { mode: ModeReglementCaisse }[]) => [...new Set(p.map((x) => t(LIBELLES_MODES[x.mode])))].join(" + ") || "—";

function ListeTickets({ tickets, onOuvrir }: { tickets: TicketResume[]; onOuvrir: (id: string) => void }) {
  if (tickets.length === 0) return <EmptyState icon={receiptOutline} title={t("Aucun ticket sur la période.")} message={t("Les caisses envoient leurs tickets dès qu'elles sont connectées au serveur.")} />;
  const total = tickets.reduce((s, x) => s + (x.type === "VENTE" ? 1 : -1) * n(x.montantTTC), 0);
  const colonnes: ColonneDonnees<TicketResume>[] = [
    { id: "numero", titre: t("N°"), rendu: (x) => <strong>{numeroTicket(x)}</strong>, tri: (x) => x.caisse.numero * 1e7 + x.numero, largeur: "110px" },
    { id: "date", titre: t("Date"), rendu: (x) => formatDateTime(x.date), tri: (x) => x.date, largeur: "160px" },
    { id: "caisse", titre: t("Caisse"), rendu: (x) => x.caisse.nom, tri: (x) => x.caisse.numero, largeur: "130px" },
    { id: "caissier", titre: t("Caissier"), principale: true, souple: true, rendu: (x) => x.caissier.nom, tri: (x) => x.caissier.nom },
    {
      id: "type",
      titre: t("Type"),
      rendu: (x) => (x.type === "RETOUR" ? <Tag tone="warning">{t("Retour")}</Tag> : <Tag tone="neutral">{t("Vente")}</Tag>),
      tri: (x) => x.type,
      largeur: "100px",
    },
    { id: "articles", titre: t("Lignes"), rendu: (x) => x._count.lignes, tri: (x) => x._count.lignes, aligne: "end", largeur: "80px" },
    { id: "modes", titre: t("Règlement"), rendu: (x) => modesTexte(x.paiements), largeur: "170px" },
    {
      id: "montant",
      titre: t("Montant TTC"),
      rendu: (x) => <Money value={(x.type === "RETOUR" ? -1 : 1) * n(x.montantTTC)} tone={x.type === "RETOUR" ? "danger" : "default"} />,
      tri: (x) => (x.type === "RETOUR" ? -1 : 1) * n(x.montantTTC),
      aligne: "end",
      largeur: "140px",
    },
  ];
  return (
    <div className="rc-transfo__zone">
      <TableauDonnees
        label={t("Tickets de caisse")}
        lignes={tickets}
        colonnes={colonnes}
        cle={(x) => x.id}
        onOuvrir={(x) => onOuvrir(x.id)}
        triInitial={{ colonne: "date", inverse: true }}
        pied={
          <>
            <strong>{tn(tickets.length, "{n} ticket", "{n} tickets")}</strong>
            <Money value={total} />
          </>
        }
      />
    </div>
  );
}

function Ecart({ v }: { v: number | null }) {
  if (v === null) return <>—</>;
  if (Math.abs(v) < 0.0005) return <Tag tone="positive">{t("Juste")}</Tag>;
  return <Money value={v} tone={v < 0 ? "danger" : "warning"} />;
}

/** Encaissé d'une session pour un mode de règlement (remboursements déduits). */
const mode = (s: SessionCaisse, m: ModeReglementCaisse) => s.totaux.parMode[m] ?? 0;

/** Montant d'une colonne de la table des clôtures (vide si 0, pour que les vrais montants ressortent). */
const M = ({ v, signe, ton }: { v: number; signe?: "−"; ton?: "danger" }) =>
  Math.abs(v) < 0.0005 ? <span className="rc-clot__zero">—</span> : <Money value={signe ? -v : v} tone={ton} />;

/**
 * Clôtures : une ligne par caissier et par session, la recette par mode de règlement, retours, prélèvements,
 * espèces à remettre (hors fond de caisse, qui reste dans le tiroir), montant remis (papier) et écart ; total de la
 * journée en bas. Une ligne s'ouvre sur ses prélèvements et ses retours.
 */
function ListeSessions({ sessions, onOuvrir, onRecharger }: { sessions: SessionCaisse[]; onOuvrir: (s: SessionCaisse) => void; onRecharger: () => void }) {
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const [remise, setRemise] = useState<SessionCaisse | null>(null);
  if (sessions.length === 0) return <EmptyState icon={receiptOutline} title={t("Aucune session sur la période.")} message={t("Une session commence quand un caissier ouvre la caisse avec son fond de caisse.")} />;

  const lignes = [...sessions].sort((a, b) => a.ouverteLe.localeCompare(b.ouverteLe));
  const autres = (s: SessionCaisse) => mode(s, "CHEQUE") + mode(s, "BON_ACHAT");
  const somme = (f: (s: SessionCaisse) => number) => lignes.reduce((x, s) => x + f(s), 0);
  const remis = (s: SessionCaisse) => (s.especesRemises === null ? null : n(s.especesRemises));
  const sansRemise = lignes.filter((s) => s.statut === "CLOTUREE" && s.ecart === null).length;
  const basculer = (id: string) =>
    setOuvertes((o) => {
      const x = new Set(o);
      if (x.has(id)) x.delete(id);
      else x.add(id);
      return x;
    });

  return (
    <div className="rc-transfo__zone">
      {sansRemise > 0 && (
        <Notice tone="info">
          {tn(sansRemise, "{n} clôture attend le montant remis par le caissier : touchez « Saisir » sur sa ligne.", "{n} clôtures attendent le montant remis par le caissier : touchez « Saisir » sur leur ligne.")}
        </Notice>
      )}
      <div className="rc-tdonnees rc-clot">
        <table aria-label={t("Clôtures de caisse")}>
          <thead>
            <tr>
              <th aria-label={t("Détail")} />
              <th>{t("Caissier")}</th>
              <th className="n">{t("CA TTC")}</th>
              <th className="n">{t("Espèces")}</th>
              <th className="n">{t("TPE")}</th>
              <th className="n">{t("Ticket resto")}</th>
              <th className="n" title={t("Chèques et bons d'achat")}>
                {t("Chèque / bon")}
              </th>
              <th className="n">{t("Retours")}</th>
              <th className="n">{t("Prélèvements")}</th>
              <th className="n" title={t("Espèces − prélèvements + apports. Le fond de caisse reste dans le tiroir.")}>
                {t("À remettre")}
              </th>
              <th className="n">{t("Remis")}</th>
              <th className="n">{t("Écart")}</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((s) => {
              const ouverte = ouvertes.has(s.id);
              const r = remis(s);
              return (
                <Fragment key={s.id}>
                  <tr className={`rc-tdonnees__ligne--lien${ouverte ? " rc-clot__ligne--ouverte" : ""}`} onClick={() => basculer(s.id)}>
                    <td className="rc-clot__chev">
                      <IonIcon icon={ouverte ? chevronDownOutline : chevronForwardOutline} />
                    </td>
                    <td className="rc-tdonnees__principale">
                      <strong>{s.caissier.nom}</strong>
                      <small>
                        {s.caisse.nom} · {formatTime(s.ouverteLe)} → {s.statut === "OUVERTE" ? t("en cours") : `${formatTime(s.clotureeLe!)}${s.numeroZ ? ` · Z ${s.numeroZ}` : ""}`}
                      </small>
                    </td>
                    <td className="n">
                      <strong>
                        <M v={s.chiffreAffaires} />
                      </strong>
                      <small>{tn(s.totaux.nbTickets, "{n} ticket", "{n} tickets")}</small>
                    </td>
                    <td className="n">
                      <M v={mode(s, "ESPECES")} />
                    </td>
                    <td className="n">
                      <M v={mode(s, "TPE")} />
                    </td>
                    <td className="n">
                      <M v={mode(s, "TICKET_RESTO")} />
                      {s.totaux.commissionResto > 0 && <small>{t("comm. −{m}", { m: formatAmount(s.totaux.commissionResto) })}</small>}
                    </td>
                    <td className="n">
                      <M v={autres(s)} />
                    </td>
                    <td className="n">
                      <M v={s.totaux.retours} signe="−" ton="danger" />
                    </td>
                    <td className="n">
                      <M v={s.totaux.prelevements} />
                    </td>
                    <td className="n">
                      <strong>
                        <Money value={s.aRemettre} />
                      </strong>
                    </td>
                    <td className="n" onClick={(e) => e.stopPropagation()}>
                      {s.statut === "OUVERTE" ? (
                        <span className="rc-clot__zero">—</span>
                      ) : r !== null ? (
                        <button type="button" className="rc-clot__remis" onClick={() => setRemise(s)} title={s.remiseSaisieParNom ? t("Saisi par {n}", { n: s.remiseSaisieParNom }) : undefined}>
                          <Money value={r} />
                        </button>
                      ) : s.especesComptees !== null ? (
                        <button type="button" className="rc-clot__remis" onClick={() => setRemise(s)} title={t("Compté par le caissier à la caisse (fond compris)")}>
                          <small>{t("compté")}</small> <Money value={n(s.especesComptees) - n(s.fondCaisse)} />
                        </button>
                      ) : (
                        <Button variant="secondary" onClick={() => setRemise(s)}>
                          {t("Saisir")}
                        </Button>
                      )}
                    </td>
                    <td className="n">
                      <Ecart v={s.ecart} />
                    </td>
                  </tr>
                  {ouverte && (
                    <tr className="rc-clot__detail">
                      <td />
                      <td colSpan={11}>
                        <DetailSession s={s} onTickets={() => onOuvrir(s)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>
                <strong>{t("Total de la période")}</strong>
                <small>{tn(lignes.length, "{n} session", "{n} sessions")}</small>
              </td>
              <td className="n">
                <Money value={somme((s) => s.chiffreAffaires)} />
                <small>{tn(somme((s) => s.totaux.nbTickets), "{n} ticket", "{n} tickets")}</small>
              </td>
              <td className="n">
                <Money value={somme((s) => mode(s, "ESPECES"))} />
              </td>
              <td className="n">
                <Money value={somme((s) => mode(s, "TPE"))} />
              </td>
              <td className="n">
                <Money value={somme((s) => mode(s, "TICKET_RESTO"))} />
                {somme((s) => s.totaux.commissionResto) > 0 && <small>{t("comm. −{m}", { m: formatAmount(somme((s) => s.totaux.commissionResto)) })}</small>}
              </td>
              <td className="n">
                <Money value={somme(autres)} />
              </td>
              <td className="n">
                <Money value={-somme((s) => s.totaux.retours)} tone="danger" />
              </td>
              <td className="n">
                <Money value={somme((s) => s.totaux.prelevements)} />
              </td>
              <td className="n">
                <Money value={somme((s) => s.aRemettre)} />
              </td>
              <td className="n">
                <Money value={somme((s) => remis(s) ?? (s.especesComptees !== null ? n(s.especesComptees) - n(s.fondCaisse) : 0))} />
              </td>
              <td className="n">
                <Ecart v={lignes.some((s) => s.ecart !== null) ? Math.round(somme((s) => s.ecart ?? 0) * 1000) / 1000 : null} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="rc-footnote">
        {t("Montants en TND. Tickets resto : valeur faciale, la commission de l'émetteur est indiquée en dessous. Par mode : encaissé moins les remboursements (et la monnaie rendue pour les espèces). Le fond de caisse n'entre ni dans le CA ni dans les espèces à remettre.")}
      </p>
      <RemiseSheet
        session={remise}
        onDismiss={() => setRemise(null)}
        onSaved={() => {
          setRemise(null);
          onRecharger();
        }}
      />
    </div>
  );
}

/** Détail d'une ligne de clôture : prélèvements et apports, retours avec leurs articles. */
function DetailSession({ s, onTickets }: { s: SessionCaisse; onTickets: () => void }) {
  return (
    <div className="rc-clot__blocs">
      <div className="rc-clot__bloc">
        <strong>{t("Prélèvements et apports")}</strong>
        {s.mouvements.length === 0 ? (
          <p className="rc-footnote">{t("Aucun.")}</p>
        ) : (
          <ul>
            {s.mouvements.map((m) => (
              <li key={m.id}>
                <span>{formatTime(m.date)}</span>
                <span>
                  {m.type === "PRELEVEMENT" ? t("Prélèvement") : t("Apport")}
                  {m.motif && <small> · {m.motif}</small>}
                </span>
                <Money value={m.type === "PRELEVEMENT" ? -n(m.montant) : n(m.montant)} tone={m.type === "PRELEVEMENT" ? "warning" : "default"} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rc-clot__bloc">
        <strong>{t("Retours")}</strong>
        {s.retours.length === 0 ? (
          <p className="rc-footnote">{t("Aucun.")}</p>
        ) : (
          <ul>
            {s.retours.map((r) => (
              <li key={r.id}>
                <span>
                  {formatTime(r.date)} · C{s.caisse.numero}-{r.numero}
                </span>
                <span>{r.lignes.map((l) => `${Number(n(l.quantite).toFixed(3))} × ${l.article.designation}`).join(", ")}</span>
                <Money value={-n(r.montantTTC)} tone="danger" />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rc-clot__bloc rc-clot__bloc--etroit">
        <strong>{t("Session")}</strong>
        <p>
          {t("Fond de caisse")} <Money value={s.fondCaisse} size="sm" />
        </p>
        {mode(s, "TICKET_RESTO") > 0 && (
          <p>
            {t("Tickets resto : net après commission")} <Money value={mode(s, "TICKET_RESTO") - s.totaux.commissionResto} size="sm" />
          </p>
        )}
        <p>{s.caisse.comptageCaissier ? t("Comptage du tiroir par le caissier") : t("Clôture à l'aveugle (papier)")}</p>
        {s.remiseSaisieParNom && s.remiseSaisieLe && <p className="rc-footnote">{t("Remis saisi par {n} le {d}", { n: s.remiseSaisieParNom, d: formatDateTime(s.remiseSaisieLe) })}</p>}
        <Button variant="ghost" onClick={onTickets}>
          {t("Voir les tickets")}
        </Button>
      </div>
    </div>
  );
}

/** Saisie du montant remis par le caissier (écrit sur son ticket Z), hors fond de caisse. */
function RemiseSheet({ session, onDismiss, onSaved }: { session: SessionCaisse | null; onDismiss: () => void; onSaved: () => void }) {
  const [valeur, setValeur] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const montantSaisi = valeur.trim() === "" ? null : Number(valeur.replace(",", "."));
  const valide = montantSaisi !== null && Number.isFinite(montantSaisi) && montantSaisi >= 0;
  const ecart = session && valide ? Math.round((montantSaisi! - session.aRemettre) * 1000) / 1000 : null;
  const enregistrer = async (montant: number | null) => {
    if (!session) return;
    setEnCours(true);
    setErreur(null);
    try {
      await saisirRemise(session.id, montant);
      onSaved();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Échec de l'enregistrement"));
    } finally {
      setEnCours(false);
    }
  };
  return (
    <Sheet
      isOpen={session !== null}
      title={session ? t("Recette remise · {c}", { c: session.caissier.nom }) : ""}
      height="auto"
      onDismiss={onDismiss}
      onWillPresent={() => {
        setErreur(null);
        setValeur(session?.especesRemises != null ? String(n(session.especesRemises)).replace(".", ",") : "");
      }}
      footer={
        <Button size="lg" block loading={enCours} disabled={!valide || enCours} onClick={() => void enregistrer(montantSaisi)}>
          {t("Enregistrer")}
        </Button>
      }
    >
      {session && (
        <div className="rc-fields rc-sheet__form">
          {erreur && <Notice>{erreur}</Notice>}
          <p className="rc-footnote">
            {t("{c} · {d} · Z {z}", { c: session.caisse.nom, d: formatDateTime(session.clotureeLe ?? session.ouverteLe), z: session.numeroZ ?? "—" })}
          </p>
          <Field
            label={t("Montant écrit sur le papier du caissier")}
            value={valeur}
            onChange={setValeur}
            inputMode="decimal"
            autoFocus
            staticSuffix="DT"
            hint={t("Espèces remises, hors fond de caisse ({f} DT, qui reste dans le tiroir).", { f: formatAmount(n(session.fondCaisse)) })}
          />
          <div className="rc-clot__verif">
            <span>{t("À remettre selon la caisse")}</span>
            <Money value={session.aRemettre} />
            <span>{t("Écart")}</span>
            <Ecart v={ecart} />
          </div>
          {session.especesRemises !== null && (
            <Button variant="ghost" disabled={enCours} onClick={() => void enregistrer(null)}>
              {t("Effacer la saisie")}
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** Ticket de caisse, présenté comme le ticket imprimé. */
function TicketSheet({ id, onDismiss }: { id: string | null; onDismiss: () => void }) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  useEffect(() => {
    setTicket(null);
    if (id) void getTicket(id).then(setTicket).catch(() => onDismiss());
  }, [id, onDismiss]);
  return (
    <Sheet isOpen={id !== null} title={ticket ? t("Ticket {n}", { n: numeroTicket(ticket) }) : t("Ticket")} height="auto" onDismiss={onDismiss}>
      {!ticket ? (
        <Spinner />
      ) : (
        <div className="rc-caisse-ticket">
          <p className="rc-caisse-ticket__tete">
            {ticket.type === "RETOUR" && <Tag tone="warning">{t("Retour")}</Tag>} {formatDateTime(ticket.date)} · {ticket.caisse.nom} · {ticket.caissier.nom}
          </p>
          <table>
            <tbody>
              {ticket.lignes.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.article.designation}
                    <small>
                      {Number(n(l.quantite).toFixed(3)).toLocaleString("fr-FR")} × {formatAmount(n(l.prixUnitaire))}
                      {n(l.remise) > 0 && ` · ${t("remise")} −${formatAmount(n(l.remise))}`}
                      {n(l.quantiteOfferte) > 0 && ` · +${n(l.quantiteOfferte)} ${t("offert")}`}
                    </small>
                  </td>
                  <td className="rc-caisse-ticket__montant">{formatAmount(n(l.montantTTC))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {n(ticket.remise) > 0 && (
            <p className="rc-caisse-ticket__ligne">
              <span>{t("Remise sur le ticket")}</span>
              <span>−{formatAmount(n(ticket.remise))}</span>
            </p>
          )}
          <p className="rc-caisse-ticket__ligne rc-caisse-ticket__total">
            <span>{t("Total TTC")}</span>
            <span>{formatAmount(n(ticket.montantTTC))}</span>
          </p>
          <p className="rc-caisse-ticket__ligne rc-caisse-ticket__petit">
            <span>
              {t("HT")} {formatAmount(n(ticket.montantHT))} · {t("TVA")} {formatAmount(n(ticket.montantTVA))}
            </span>
          </p>
          {ticket.paiements.map((p) => (
            <p key={p.id} className="rc-caisse-ticket__ligne">
              <span>
                {t(LIBELLES_MODES[p.mode])}
                {p.reference && <small> · {p.mode === "TPE" ? t("autorisation {r}", { r: p.reference }) : p.reference}</small>}
              </span>
              <span>{formatAmount(n(p.montant))}</span>
            </p>
          ))}
          {n(ticket.rendu) > 0 && (
            <p className="rc-caisse-ticket__ligne">
              <span>{t("Rendu")}</span>
              <span>{formatAmount(n(ticket.rendu))}</span>
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** Détail d'une session : encaissements par mode, prélèvements, écart, et ses tickets. */
function SessionSheet({ session, onDismiss, onTicket }: { session: SessionCaisse | null; onDismiss: () => void; onTicket: (id: string) => void }) {
  const [tickets, setTickets] = useState<TicketResume[] | null>(null);
  useEffect(() => {
    setTickets(null);
    if (session) void listTicketsSession(session.id).then(setTickets).catch(() => setTickets([]));
  }, [session]);
  if (!session) return <Sheet isOpen={false} title="" onDismiss={onDismiss}>{null}</Sheet>;
  const tot = session.totaux;
  const ligne = (libelle: string, valeur: number | null, signe = "") => (
    <p className="rc-caisse-ticket__ligne">
      <span>{libelle}</span>
      <span>{valeur === null ? "—" : `${signe}${formatAmount(valeur)}`}</span>
    </p>
  );
  return (
    <Sheet isOpen title={session.numeroZ ? t("Clôture Z {n} · {c}", { n: session.numeroZ, c: session.caisse.nom }) : t("Session · {c}", { c: session.caisse.nom })} onDismiss={onDismiss}>
      <div className="rc-caisse-ticket">
        <p className="rc-caisse-ticket__tete">
          {session.caissier.nom} · {t("du {a} au {b}", { a: formatDateTime(session.ouverteLe), b: session.clotureeLe ? formatDateTime(session.clotureeLe) : t("en cours") })}
        </p>
        {ligne(tn(tot.nbTickets, "{n} vente", "{n} ventes"), tot.ventes)}
        {tot.nbRetours > 0 && ligne(tn(tot.nbRetours, "{n} retour", "{n} retours"), tot.retours, "−")}
        {tot.remises > 0 && ligne(t("Remises sur tickets"), tot.remises)}
        <hr />
        {MODES.filter((m) => tot.parMode[m]).map((m) => <div key={m}>{ligne(t(LIBELLES_MODES[m]), tot.parMode[m] ?? 0)}</div>)}
        <hr />
        {ligne(t("Fond de caisse"), n(session.fondCaisse))}
        {tot.prelevements > 0 && ligne(t("Prélèvements"), tot.prelevements, "−")}
        {tot.apports > 0 && ligne(t("Apports"), tot.apports, "+")}
        <p className="rc-caisse-ticket__ligne rc-caisse-ticket__total">
          <span>{t("Espèces à remettre (hors fond)")}</span>
          <span>{formatAmount(session.aRemettre)}</span>
        </p>
        {ligne(t("Remis par le caissier"), session.especesRemises === null ? null : n(session.especesRemises))}
        {session.especesComptees !== null && ligne(t("Compté à la caisse (fond compris)"), n(session.especesComptees))}
        <p className="rc-caisse-ticket__ligne">
          <span>{t("Écart")}</span>
          <Ecart v={session.ecart} />
        </p>
      </div>
      <Section label={t("Tickets")} aside={tickets ? `${tickets.length}` : undefined}>
        {!tickets ? <Spinner /> : <ListeTickets tickets={tickets} onOuvrir={onTicket} />}
      </Section>
    </Sheet>
  );
}
