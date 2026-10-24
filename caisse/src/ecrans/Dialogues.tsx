import { useEffect, useMemo, useState } from "react";
import { useCaisse } from "../etat";
import { Clavier, Dialogue, Pave } from "../composants/communs";
import { htmlClotureAveugle, htmlRapport, htmlTicket, imprimer, LIBELLES_MODES, totauxSession } from "../lib/impression";
import { arrondir, dateHeure, heure, lireNombre, montant, quantite } from "../lib/format";
import { rechercher } from "../lib/ticket";
import { pont } from "../lib/stockage";
import type { ArticleCaisse, ModeReglement, SessionLocale, TicketValide } from "../types";

/** Remise en % ou en dinars, sur la ligne choisie ou sur tout le ticket. */
export function DialogueRemise({ montantLigne, montantTicket, onValider, onFermer }: { montantLigne: number | null; montantTicket: number; onValider: (cible: "ligne" | "ticket", remise: number) => void; onFermer: () => void }) {
  const [cible, setCible] = useState<"ligne" | "ticket">(montantLigne !== null ? "ligne" : "ticket");
  const [type, setType] = useState<"pourcent" | "valeur">("pourcent");
  const [v, setV] = useState("");
  const base = cible === "ligne" ? (montantLigne ?? 0) : montantTicket;
  const n = v === "" ? 0 : lireNombre(v);
  const remise = arrondir(type === "pourcent" ? (base * n) / 100 : n);
  const valide = remise >= 0 && remise <= base && !(type === "pourcent" && n > 100);
  return (
    <Dialogue titre="Remise" onFermer={onFermer}>
      <div className="segment">
        <button type="button" className={cible === "ligne" ? "actif" : ""} disabled={montantLigne === null} onClick={() => setCible("ligne")}>
          Ligne choisie
        </button>
        <button type="button" className={cible === "ticket" ? "actif" : ""} onClick={() => setCible("ticket")}>
          Tout le ticket
        </button>
      </div>
      <div className="segment">
        <button type="button" className={type === "pourcent" ? "actif" : ""} onClick={() => setType("pourcent")}>
          En %
        </button>
        <button type="button" className={type === "valeur" ? "actif" : ""} onClick={() => setType("valeur")}>
          En dinars
        </button>
      </div>
      <p className="dlg__texte">
        Sur {montant(base)} : remise de <b>{montant(valide ? remise : 0)}</b>, reste {montant(Math.max(0, base - remise))}. 0 annule la remise.
      </p>
      <Pave valeur={v} onChange={setV} onValider={() => valide && onValider(cible, remise)} decimal max={9} desactive={!valide} libelleValider="Appliquer la remise" />
    </Dialogue>
  );
}

/** Prélèvement (espèces retirées du tiroir) ou apport. */
export function DialogueMouvement({ onFermer }: { onFermer: () => void }) {
  const { ajouterMouvement } = useCaisse();
  const [type, setType] = useState<"PRELEVEMENT" | "APPORT">("PRELEVEMENT");
  const [v, setV] = useState("");
  const [motif, setMotif] = useState("");
  const n = v === "" ? NaN : lireNombre(v);
  return (
    <Dialogue titre="Mouvement d'espèces" onFermer={onFermer}>
      <div className="segment">
        <button type="button" className={type === "PRELEVEMENT" ? "actif" : ""} onClick={() => setType("PRELEVEMENT")}>
          Prélèvement
        </button>
        <button type="button" className={type === "APPORT" ? "actif" : ""} onClick={() => setType("APPORT")}>
          Apport
        </button>
      </div>
      <span className="champ__titre">Motif</span>
      <div className="puces">
        {(type === "PRELEVEMENT" ? ["Remise au coffre", "Dépôt en banque", "Paiement fournisseur", "Autre"] : ["Monnaie", "Fond complémentaire", "Autre"]).map((m) => (
          <button key={m} type="button" className={`puce${motif === m ? " actif" : ""}`} onClick={() => setMotif(motif === m ? "" : m)}>
            {m}
          </button>
        ))}
      </div>
      <Pave
        valeur={v}
        onChange={setV}
        decimal
        desactive={!(n > 0)}
        libelleValider={`${type === "PRELEVEMENT" ? "Retirer" : "Ajouter"} ${montant(n > 0 ? n : 0)} DT`}
        onValider={() => {
          if (!(n > 0)) return;
          ajouterMouvement(type, n, motif.trim() || null);
          onFermer();
        }}
      />
    </Dialogue>
  );
}

/** Vérification de prix : scanner ou chercher un article sans l'ajouter au ticket. */
export function DialogueVerifPrix({ onFermer }: { onFermer: () => void }) {
  const { codes, config } = useCaisse();
  const [texte, setTexte] = useState("");
  const [article, setArticle] = useState<ArticleCaisse | null | undefined>(undefined);
  const chercher = () => {
    const t = texte.trim();
    if (!t) return;
    setArticle(codes.get(t) ?? codes.get(t.toUpperCase()) ?? rechercher(config?.articles ?? [], t, 1)[0] ?? null);
    setTexte("");
  };
  const promo = article ? config?.promotions.find((p) => p.lignes.some((l) => l.articleId === article.id)) : null;
  return (
    <Dialogue titre="Vérifier un prix" onFermer={onFermer} large>
      <label className="champ">
        <span>Scannez l'article, ou tapez son nom sur le clavier</span>
        <input
          autoFocus
          inputMode="none"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") chercher();
            if (e.key === "Escape") onFermer();
          }}
        />
      </label>
      {article === null && <p className="alerte">Article introuvable.</p>}
      {article && (
        <div className="verif">
          <strong className="verif__nom">{article.designation}</strong>
          <span className="verif__prix">{montant(article.prixTTC)} DT</span>
          {promo && <span className="badge badge--promo">Promotion {promo.numero}</span>}
          <small>
            {article.codeBarre ?? "—"} · stock dépôt {quantite(article.stock)}
          </small>
        </div>
      )}
      <Clavier valeur={texte} onChange={setTexte} onValider={chercher} libelleValider="Chercher" />
    </Dialogue>
  );
}

/** Recherche d'un article par son nom. */
export function DialogueRecherche({ texteInitial, onChoisir, onFermer }: { texteInitial: string; onChoisir: (a: ArticleCaisse) => void; onFermer: () => void }) {
  const { config } = useCaisse();
  const [texte, setTexte] = useState(texteInitial);
  const [index, setIndex] = useState(0);
  const resultats = useMemo(() => rechercher(config?.articles ?? [], texte), [config, texte]);
  return (
    <Dialogue titre="Rechercher un article" onFermer={onFermer} large>
      <label className="champ">
        <span>Désignation, marque ou code</span>
        <input
          autoFocus
          inputMode="none"
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, resultats.length - 1));
            else if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
            else if (e.key === "Enter" && resultats[index]) onChoisir(resultats[index]);
            else if (e.key === "Escape") onFermer();
            else return;
            e.preventDefault();
          }}
        />
      </label>
      <ul className="resultats">
        {resultats.map((a, i) => (
          <li key={a.id}>
            <button type="button" className={i === index ? "actif" : ""} onClick={() => onChoisir(a)}>
              <span>{a.designation}</span>
              <small>{a.codeBarre}</small>
              <strong>{montant(a.prixTTC)}</strong>
            </button>
          </li>
        ))}
        {texte.trim() && resultats.length === 0 && <li className="resultats__vide">Aucun article.</li>}
        {!texte.trim() && <li className="resultats__vide">Tapez quelques lettres du nom (ex. « LAIT DELICE »).</li>}
      </ul>
      <Clavier
        valeur={texte}
        onChange={(v) => {
          setTexte(v);
          setIndex(0);
        }}
      />
    </Dialogue>
  );
}

/** Tickets mis en attente (client parti chercher un article…). */
export function DialogueAttente({ onFermer }: { onFermer: () => void }) {
  const { etat, reprendre } = useCaisse();
  return (
    <Dialogue titre="Tickets en attente" onFermer={onFermer}>
      {etat.attente.length === 0 && <p className="dlg__texte">Aucun ticket en attente.</p>}
      <ul className="resultats">
        {etat.attente.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => {
                reprendre(t.id);
                onFermer();
              }}
            >
              <span>Ticket de {heure(t.ouvertLe)}</span>
              <small>{t.lignes.length} ligne(s)</small>
              <strong>{montant(t.lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire - l.remise, 0))}</strong>
            </button>
          </li>
        ))}
      </ul>
    </Dialogue>
  );
}

/** Réimpression d'un ticket de la session (duplicata). */
export function DialogueReimpression({ onFermer }: { onFermer: () => void }) {
  const { etat, config, reglages } = useCaisse();
  const [erreur, setErreur] = useState<string | null>(null);
  const derniers = [...etat.tickets].reverse().slice(0, 30);
  const reimprimer = async (t: TicketValide) => {
    if (!config) return;
    const nom = config.caissiers.find((c) => c.id === t.caissierId)?.nom ?? "";
    const e = await imprimer(htmlTicket(config, t, nom, true), reglages.imprimante);
    if (e) setErreur(e);
    else onFermer();
  };
  return (
    <Dialogue titre="Réimprimer un ticket" onFermer={onFermer}>
      {erreur && <p className="alerte">{erreur}</p>}
      {derniers.length === 0 && <p className="dlg__texte">Aucun ticket dans cette session.</p>}
      <ul className="resultats">
        {derniers.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => void reimprimer(t)}>
              <span>
                C{config?.caisse.numero}-{t.numero} · {heure(t.date)}
                {t.type === "RETOUR" && " · retour"}
              </span>
              <small>{t.paiements.map((p) => LIBELLES_MODES[p.mode]).join(" + ")}</small>
              <strong>{montant(t.total)}</strong>
            </button>
          </li>
        ))}
      </ul>
    </Dialogue>
  );
}

const MODES: ModeReglement[] = ["ESPECES", "TPE", "CHEQUE", "TICKET_RESTO", "BON_ACHAT"];

function Totaux({ session }: { session: SessionLocale }) {
  const { etat } = useCaisse();
  const t = totauxSession(session, etat.tickets, etat.mouvements);
  return (
    <div className="rapport">
      <p className="l">
        <span>Ventes ({t.nbVentes})</span>
        <span>{montant(t.ventes)}</span>
      </p>
      {t.nbRetours > 0 && (
        <p className="l">
          <span>Retours ({t.nbRetours})</span>
          <span>−{montant(t.retours)}</span>
        </p>
      )}
      <p className="l g">
        <span>Chiffre d'affaires</span>
        <span>{montant(t.ventes - t.retours)}</span>
      </p>
      <hr />
      {MODES.filter((m) => t.parMode[m]).map((m) => (
        <p key={m} className="l">
          <span>{LIBELLES_MODES[m]}</span>
          <span>{montant(t.parMode[m] ?? 0)}</span>
        </p>
      ))}
      <hr />
      <p className="l">
        <span>Fond de caisse</span>
        <span>{montant(session.fondCaisse)}</span>
      </p>
      {t.prelevements > 0 && (
        <p className="l">
          <span>Prélèvements</span>
          <span>−{montant(t.prelevements)}</span>
        </p>
      )}
      {t.apports > 0 && (
        <p className="l">
          <span>Apports</span>
          <span>+{montant(t.apports)}</span>
        </p>
      )}
      <p className="l g">
        <span>Espèces attendues</span>
        <span>{montant(t.especesAttendues)}</span>
      </p>
    </div>
  );
}

/** Rapport X : totaux de la session, sans la clôturer. */
export function DialogueRapportX({ onFermer }: { onFermer: () => void }) {
  const { etat, config, reglages } = useCaisse();
  if (!etat.session || !config) return null;
  const session = etat.session;
  const nom = config.caissiers.find((c) => c.id === session.caissierId)?.nom ?? "";
  return (
    <Dialogue titre={`Rapport X · depuis ${dateHeure(session.ouverteLe)}`} onFermer={onFermer}>
      <Totaux session={session} />
      <button type="button" className="btn btn--secondaire btn--grand" onClick={() => void imprimer(htmlRapport(config, session, totauxSession(session, etat.tickets, etat.mouvements), nom, "X"), reglages.imprimante)}>
        Imprimer le rapport X
      </button>
    </Dialogue>
  );
}

// Billets et pièces en dinars tunisiens (comptage du tiroir).
const COUPURES = [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];

/** Clôture Z : comptage des espèces du tiroir, impression du Z, fin de la session. */
export function DialogueCloture({ onFermer, onCloturee }: { onFermer: () => void; onCloturee: () => void }) {
  const { etat, config, reglages, cloturer } = useCaisse();
  const [compte, setCompte] = useState<Record<string, string>>({});
  const [direct, setDirect] = useState("");
  const [confirmer, setConfirmer] = useState(false);
  // Case en cours de saisie au pavé : une coupure (nombre de billets / pièces) ou le total compté.
  const [cible, setCible] = useState<number | "total">(COUPURES[0]);
  const session = etat.session;
  const totalCompte = arrondir(COUPURES.reduce((s, c) => s + c * (Number(compte[c]) || 0), 0));
  const especes = direct !== "" ? lireNombre(direct) : totalCompte;
  useEffect(() => setConfirmer(false), [especes]);
  if (!session || !config) return null;
  if (!config.caisse.comptageCaissier) return <ClotureAveugle onFermer={onFermer} onCloturee={onCloturee} />;
  const t = totauxSession(session, etat.tickets, etat.mouvements);
  const ecart = arrondir(especes - t.especesAttendues);
  const nom = config.caissiers.find((c) => c.id === session.caissierId)?.nom ?? "";
  const valider = async () => {
    if (Number.isNaN(especes)) return;
    if (!confirmer) return setConfirmer(true);
    const s = cloturer(especes);
    await imprimer(htmlRapport(config, s, t, nom, "Z"), reglages.imprimante);
    onCloturee();
  };
  return (
    <Dialogue titre="Clôture de caisse (Z)" onFermer={onFermer} large extraLarge>
      <div className="cloture">
        <div>
          <p className="dlg__texte">Touchez un billet ou une pièce, puis saisissez combien il y en a dans le tiroir (fond de caisse compris).</p>
          <div className="coupures">
            {COUPURES.map((c) => {
              const n = Number(compte[c]) || 0;
              return (
                <button key={c} type="button" className={`coupure${cible === c ? " actif" : ""}`} onClick={() => setCible(c)}>
                  <span>{c >= 1 ? `${c} DT` : `${Math.round(c * 1000)} m`}</span>
                  <strong>× {compte[c] || 0}</strong>
                  <small>{n ? montant(n * c) : ""}</small>
                </button>
              );
            })}
            <button type="button" className={`coupure coupure--total${cible === "total" ? " actif" : ""}`} onClick={() => setCible("total")}>
              <span>Ou le total compté</span>
              <strong>{direct ? direct : montant(totalCompte)}</strong>
            </button>
          </div>
        </div>
        <div className="cloture__pave">
          <Pave
            valeur={cible === "total" ? direct : (compte[cible] ?? "")}
            onChange={(v) => {
              if (cible === "total") return setDirect(v);
              setDirect("");
              setCompte((x) => ({ ...x, [cible]: v }));
            }}
            onValider={() => {
              // Coupure suivante (Valider enchaîne le comptage).
              if (cible === "total") return;
              const i = COUPURES.indexOf(cible);
              setCible(i + 1 < COUPURES.length ? COUPURES[i + 1] : "total");
            }}
            decimal={cible === "total"}
            max={cible === "total" ? 10 : 5}
            libelleValider={cible === "total" ? "Total saisi" : "Suivant"}
          />
        </div>
        <div>
          <Totaux session={session} />
          <div className={`ecart${Math.abs(ecart) < 0.0005 ? " ecart--ok" : ecart < 0 ? " ecart--manque" : " ecart--plus"}`}>
            <span>Espèces comptées {montant(Number.isNaN(especes) ? 0 : especes)}</span>
            <strong>{Math.abs(ecart) < 0.0005 ? "Caisse juste" : `${ecart > 0 ? "Excédent +" : "Manque "}${montant(ecart)}`}</strong>
          </div>
          <button type="button" className={`btn btn--grand ${confirmer ? "btn--danger" : "btn--primaire"}`} disabled={Number.isNaN(especes)} onClick={() => void valider()}>
            {confirmer ? "Confirmer la clôture Z" : "Clôturer la caisse"}
          </button>
          {confirmer && <p className="dlg__texte">La session sera fermée et le ticket Z imprimé. Les ventes suivantes demanderont une nouvelle ouverture.</p>}
        </div>
      </div>
    </Dialogue>
  );
}

/**
 * Clôture à l'aveugle (réglage du poste dans l'application de gestion) : le caissier ne compte rien à la caisse et
 * ne voit pas le montant attendu. Il remet sa recette avec un papier ; le responsable saisit le montant remis.
 */
function ClotureAveugle({ onFermer, onCloturee }: { onFermer: () => void; onCloturee: () => void }) {
  const { etat, config, reglages, cloturer } = useCaisse();
  const [enCours, setEnCours] = useState(false);
  if (!etat.session || !config) return null;
  const session = etat.session;
  const nom = config.caissiers.find((c) => c.id === session.caissierId)?.nom ?? "";
  const nbTickets = etat.tickets.filter((t) => t.type === "VENTE").length;
  const valider = async () => {
    setEnCours(true);
    const s = cloturer(null);
    await imprimer(htmlClotureAveugle(config, s, nbTickets, nom), reglages.imprimante);
    onCloturee();
  };
  return (
    <Dialogue titre="Clôture de caisse (Z)" onFermer={onFermer}>
      <div className="aveugle">
        <p className="aveugle__qui">
          {nom} · depuis {heure(session.ouverteLe)} · {nbTickets} ticket{nbTickets > 1 ? "s" : ""}
        </p>
        <ol className="aveugle__etapes">
          <li>Laissez le fond de caisse ({montant(session.fondCaisse)} DT) dans le tiroir.</li>
          <li>Comptez le reste des espèces et écrivez le montant sur le ticket Z qui va s'imprimer.</li>
          <li>Remettez la recette et le ticket signé au responsable.</li>
        </ol>
        <button type="button" className="btn btn--primaire btn--grand" disabled={enCours} onClick={() => void valider()}>
          Clôturer et imprimer le ticket Z
        </button>
      </div>
    </Dialogue>
  );
}

/** Réglages : imprimante, envoi, plein écran, quitter. */
export function DialogueReglages({ onFermer }: { onFermer: () => void }) {
  const { reglages, changerReglages, aEnvoyer, rejets, enLigne, derniereSync, synchroniser, rafraichirConfig, appairage, config, oublierAppairage } = useCaisse();
  const [imprimantes, setImprimantes] = useState<{ nom: string; parDefaut: boolean }[]>([]);
  const [version, setVersion] = useState("");
  useEffect(() => {
    void pont()?.imprimantes().then(setImprimantes);
    void pont()?.info().then((i) => setVersion(i.version));
  }, []);
  return (
    <Dialogue titre="Réglages de la caisse" onFermer={onFermer}>
      <div className="reglages">
        <label className="champ">
          <span>Imprimante des tickets</span>
          <select value={reglages.imprimante ?? ""} onChange={(e) => changerReglages({ imprimante: e.target.value || null })}>
            <option value="">Imprimante par défaut de Windows</option>
            {imprimantes.map((p) => (
              <option key={p.nom} value={p.nom}>
                {p.nom}
                {p.parDefaut ? " (par défaut)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="case">
          <input type="checkbox" checked={reglages.imprimerAuto} onChange={(e) => changerReglages({ imprimerAuto: e.target.checked })} />
          <span>Imprimer le ticket à chaque vente</span>
        </label>
        <div className="reglages__bloc">
          <p>
            <b>{enLigne ? "Connectée au serveur" : "Hors ligne"}</b> · {appairage?.serveur}
          </p>
          <p>
            {aEnvoyer === 0 ? "Tout est envoyé." : `${aEnvoyer} élément(s) en attente d'envoi.`}
            {derniereSync && ` Dernier envoi à ${heure(derniereSync)}.`}
          </p>
          {rejets.length > 0 && <p className="alerte">{rejets.length} élément(s) refusé(s) par le serveur : {rejets[0].erreur}</p>}
          <p>
            Catalogue du {config ? dateHeure(config.genereLe) : "—"} · {config?.articles.length ?? 0} articles
          </p>
          <div className="reglages__actions">
            <button type="button" className="btn btn--secondaire" onClick={() => void synchroniser()}>
              Envoyer maintenant
            </button>
            <button type="button" className="btn btn--secondaire" onClick={() => void rafraichirConfig()}>
              Recharger le catalogue
            </button>
          </div>
        </div>
        <div className="reglages__actions">
          <button type="button" className="btn btn--secondaire" onClick={() => void pont()?.pleinEcran()}>
            Plein écran (F11)
          </button>
          <button
            type="button"
            className="btn btn--discret"
            disabled={aEnvoyer > 0}
            title={aEnvoyer > 0 ? "Envoyez d'abord les tickets en attente" : undefined}
            onClick={() => {
              if (window.confirm("Dissocier ce PC de sa caisse ? Il faudra un nouveau code d'appairage.")) void oublierAppairage();
            }}
          >
            Dissocier ce PC
          </button>
          <button type="button" className="btn btn--danger" onClick={() => void pont()?.quitter()}>
            Quitter
          </button>
        </div>
        <p className="reglages__version">Caisse {version}</p>
      </div>
    </Dialogue>
  );
}
