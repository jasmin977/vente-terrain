import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { peut, useCaisse } from "../etat";
import { CodeResponsable } from "../composants/communs";
import { Icone } from "../composants/icones";
import { calculerTicket, lignesEnvoi } from "../lib/ticket";
import { htmlTicket, imprimer } from "../lib/impression";
import { arrondir, heure, lireNombre, montant, quantite, uuid } from "../lib/format";
import type { ArticleCaisse, Droit, TicketEnCours } from "../types";
import { Paiement } from "./Paiement";
import {
  DialogueAttente,
  DialogueCloture,
  DialogueMouvement,
  DialogueRapportX,
  DialogueRecherche,
  DialogueReglages,
  DialogueReimpression,
  DialogueRemise,
  DialogueVerifPrix,
} from "./Dialogues";

type Fenetre =
  | { type: "paiement" }
  | { type: "remise" }
  | { type: "mouvement" }
  | { type: "verif" }
  | { type: "recherche"; texte: string }
  | { type: "attente" }
  | { type: "reimpression" }
  | { type: "x" }
  | { type: "z" }
  | { type: "reglages" }
  | null;

/** Petit son : article reconnu (aigu) ou erreur (grave). */
function bip(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 1500 : 320;
    g.gain.value = 0.06;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.07 : 0.3));
    setTimeout(() => void ctx.close(), 500);
  } catch {
    // pas de son
  }
}

/**
 * Écran de vente, pensé pour un écran tactile et une douchette (pas de clavier) : à gauche le scan, le dernier article scanné
 * et le ticket (toucher une ligne la choisit), à droite les touches rapides et les fonctions, qui agissent
 * sur la ligne choisie. Un clavier branché garde des raccourcis (F2 quantité, F3 vérif prix, F4 encaisser,
 * F5 espèces exact, F6 remise, F8 attente, F9 annuler la ligne, ↑ ↓, + −), sans qu'ils soient affichés.
 */
export function Vente() {
  const c = useCaisse();
  const { config, articles, codes, caissier, etat, majTicket, nouveauTicket, validerTicket, mettreEnAttente, reglages, deconnecter, enLigne, aEnvoyer } = c;
  const [saisie, setSaisie] = useState("");
  const [qteEnAttente, setQteEnAttente] = useState<number | null>(null);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  const [familleId, setFamilleId] = useState<string | null>(config?.familles[0]?.id ?? null);
  const [droitDemande, setDroitDemande] = useState<{ droit: Droit; action: () => void } | null>(null);
  const [dernier, setDernier] = useState<{ designation: string; prix: number } | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const listeRef = useRef<HTMLDivElement>(null);

  const ticket = etat.ticket;
  const calcul = useMemo(() => (ticket ? calculerTicket(ticket, articles, config?.promotions ?? []) : null), [ticket, articles, config]);
  const retour = ticket?.type === "RETOUR";
  const ligneChoisie = calcul?.lignes.find((l) => l.uid === choisie) ?? null;
  // Règlements déjà reçus (le client est revenu ajouter des articles) : crédit de tickets restant à utiliser.
  const recusTicket = useMemo(() => {
    const p = ticket?.paiementsRecus;
    if (!p?.length) return null;
    const total = arrondir(p.reduce((s, x) => s + x.montant, 0));
    const tickets = arrondir(p.filter((x) => x.mode === "TICKET_RESTO").reduce((s, x) => s + x.montant, 0));
    return { total, tickets, credit: arrondir(total - (calcul?.total ?? 0)) };
  }, [ticket, calcul]);

  // Le champ de saisie garde le focus (la douchette tape comme un clavier).
  useEffect(() => {
    if (fenetre || droitDemande) return;
    const i = setInterval(() => {
      if (document.activeElement !== champ.current) champ.current?.focus();
    }, 400);
    champ.current?.focus();
    return () => clearInterval(i);
  }, [fenetre, droitDemande]);

  useEffect(() => {
    if (!message) return;
    const m = setTimeout(() => setMessage(null), message.ok ? 2500 : 5000);
    return () => clearTimeout(m);
  }, [message]);

  /** Action réservée : exécutée tout de suite si le caissier a le droit, sinon après le code d'un responsable. */
  const avecDroit = (droit: Droit, action: () => void) => (peut(caissier, droit) ? action() : setDroitDemande({ droit, action }));

  const ajouterArticle = useCallback(
    (a: ArticleCaisse, q = qteEnAttente ?? 1, code: string | null = null) => {
      majTicket((t) => {
        const base: TicketEnCours = t ?? nouveauTicket("VENTE");
        const derniere = base.lignes[base.lignes.length - 1];
        // Même article passé à la suite (sans remise) : la quantité augmente au lieu d'une nouvelle ligne.
        if (derniere && derniere.articleId === a.id && derniere.remise === 0 && derniere.prixUnitaire === a.prixTTC) {
          setChoisie(derniere.uid);
          return { ...base, lignes: base.lignes.map((l) => (l.uid === derniere.uid ? { ...l, quantite: arrondir(l.quantite + q) } : l)) };
        }
        const uid = uuid();
        setChoisie(uid);
        return { ...base, lignes: [...base.lignes, { uid, articleId: a.id, designation: a.designation, codeBarre: code ?? a.codeBarre, quantite: q, prixUnitaire: a.prixTTC, remise: 0 }] };
      });
      setDernier({ designation: a.designation, prix: a.prixTTC });
      setQteEnAttente(null);
      bip(true);
      setTimeout(() => listeRef.current?.scrollTo({ top: listeRef.current.scrollHeight }), 30);
    },
    [majTicket, nouveauTicket, qteEnAttente],
  );

  const traiterSaisie = () => {
    const s = saisie.trim();
    setSaisie("");
    if (!s) return;
    const a = codes.get(s) ?? codes.get(s.toUpperCase());
    // Code-barres scanné gardé sur la ligne (un code alternatif reste visible tel quel).
    if (a) return ajouterArticle(a, undefined, /^\d+$/.test(s) ? s : null);
    if (/^\d{6,14}$/.test(s)) {
      bip(false);
      return setMessage({ texte: `Article inconnu : ${s}`, ok: false });
    }
    setFenetre({ type: "recherche", texte: s });
  };

  const changerQuantite = (uid: string, q: number) => majTicket((t) => (t ? { ...t, lignes: t.lignes.map((l) => (l.uid === uid ? { ...l, quantite: arrondir(q) } : l)) } : t));
  /** Pavé de l'écran : les chiffres vont dans le champ de saisie (code ou quantité), comme sur l'ancienne caisse. */
  const taperPave = (c: string) =>
    setSaisie((v) => {
      if (c === "C") return "";
      if (c === "⌫") return v.slice(0, -1);
      if (c === ",") return v.includes(",") || v.includes(".") ? v : `${v || "0"},`;
      return v.length >= 20 ? v : v + c;
    });
  /** Quantité tapée au pavé puis « Quantité » (ligne choisie) ou « Qté × » (prochain article) : pas de fenêtre. */
  const appliquerQuantite = (cible: "ligne" | "suivant") => {
    const s = saisie.trim();
    const q = /^\d+(?:[.,]\d{1,3})?$/.test(s) ? lireNombre(s) : NaN;
    if (!(q > 0) || q > 9999) return setMessage({ texte: `Tapez la quantité sur le pavé, puis touchez « ${cible === "ligne" ? "Quantité" : "Qté ×"} ».`, ok: false });
    if (cible === "suivant") setQteEnAttente(q);
    else if (!ligneChoisie || ligneChoisie.offerte) return setMessage({ texte: "Touchez d'abord la ligne à modifier.", ok: false });
    else changerQuantite(ligneChoisie.uid, q);
    setSaisie("");
  };
  const annulerLigne = () => {
    if (!ligneChoisie || ligneChoisie.offerte) return;
    avecDroit("annulerLigne", () => {
      majTicket((t) => {
        if (!t) return t;
        const i = t.lignes.findIndex((l) => l.uid === ligneChoisie.uid);
        const lignes = t.lignes.filter((l) => l.uid !== ligneChoisie.uid);
        setChoisie(lignes[Math.min(i, lignes.length - 1)]?.uid ?? null);
        return { ...t, lignes };
      });
    });
  };
  const annulerTicket = () => {
    if (!ticket) return;
    avecDroit("annulerTicket", () => {
      const recus = ticket.paiementsRecus?.reduce((s, p) => s + p.montant, 0) ?? 0;
      const question = recus > 0 ? `Annuler tout le ticket en cours ? Rendez au client les règlements déjà reçus (${montant(recus)} DT).` : "Annuler tout le ticket en cours ?";
      if (ticket.lignes.length && !window.confirm(question)) return;
      majTicket(() => null);
      setChoisie(null);
    });
  };
  const commencerRetour = () => {
    if (ticket && ticket.lignes.length) return setMessage({ texte: "Terminez ou mettez en attente le ticket en cours avant un retour.", ok: false });
    avecDroit("retour", () => {
      majTicket(() => nouveauTicket("RETOUR"));
      setMessage({ texte: "Retour : scannez les articles rapportés par le client.", ok: true });
    });
  };

  const encaisser = () => {
    if (!calcul || calcul.lignes.length === 0) return;
    if (calcul.total <= 0 && !calcul.lignes.some((l) => l.quantiteOfferte > 0)) return setMessage({ texte: "Ticket à 0 : rien à encaisser.", ok: false });
    setFenetre({ type: "paiement" });
  };

  /** Espèces exact : avec des règlements déjà reçus (tickets restaurant…), passe par l'écran d'encaissement. */
  const especesExact = () => {
    if (!calcul || calcul.total <= 0 || retour) return;
    if (ticket?.paiementsRecus?.length) return setFenetre({ type: "paiement" });
    void terminer([{ mode: "ESPECES", montant: calcul.total }], 0);
  };

  const terminer = async (paiements: { mode: "ESPECES" | "TPE" | "CHEQUE" | "TICKET_RESTO" | "BON_ACHAT"; montant: number; reference?: string | null }[], rendu: number) => {
    if (!calcul || !ticket || !config || !caissier) return;
    const t = validerTicket({
      type: ticket.type,
      lignes: lignesEnvoi(calcul),
      remise: calcul.remise,
      total: calcul.total,
      designations: calcul.lignes.map((l) => l.designation),
      paiements,
      rendu,
    });
    setFenetre(null);
    setChoisie(null);
    setDernier(null);
    setMessage({ texte: rendu > 0 ? `Ticket ${t.numero} validé · rendu ${montant(rendu)} DT` : `Ticket ${t.numero} validé`, ok: true });
    if (reglages.imprimerAuto) {
      const e = await imprimer(htmlTicket(config, t, caissier.nom), reglages.imprimante);
      if (e) setMessage({ texte: `Ticket ${t.numero} validé, mais impression impossible : ${e}`, ok: false });
    }
  };

  // Raccourcis clavier de l'écran de vente.
  const raccourcis = useRef<(e: KeyboardEvent) => void>(() => {});
  raccourcis.current = (e: KeyboardEvent) => {
    if (fenetre || droitDemande) return;
    const lignes = calcul?.lignes ?? [];
    const i = lignes.findIndex((l) => l.uid === choisie);
    const actions: Record<string, () => void> = {
      F2: () => appliquerQuantite("ligne"),
      F3: () => setFenetre({ type: "verif" }),
      F4: encaisser,
      F5: especesExact,
      F6: () => calcul && avecDroit("remise", () => setFenetre({ type: "remise" })),
      F8: mettreEnAttente,
      F9: annulerLigne,
      ArrowUp: () => lignes.length && setChoisie(lignes[Math.max(0, i - 1)].uid),
      ArrowDown: () => lignes.length && setChoisie(lignes[Math.min(lignes.length - 1, i < 0 ? lignes.length - 1 : i + 1)].uid),
    };
    if (saisie === "" && (e.key === "+" || e.key === "-") && ligneChoisie && !ligneChoisie.offerte) {
      e.preventDefault();
      const q = ligneChoisie.quantite + (e.key === "+" ? 1 : -1);
      if (q > 0) changerQuantite(ligneChoisie.uid, q);
      else annulerLigne();
      return;
    }
    const a = actions[e.key];
    if (a) {
      e.preventDefault();
      a();
    }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => raccourcis.current(e);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  if (!config || !caissier) return null;
  const famille = config.familles.find((f) => f.id === familleId) ?? config.familles[0];

  return (
    <div className="vente">
      <header className="barre">
        <span className="barre__societe">{config.societe.nom}</span>
        <span>{config.caisse.nom}</span>
        <span>
          Caissier : <b>{caissier.nom}</b>
        </span>
        <span className="barre__espace" />
        <span className={`barre__etat${enLigne ? " barre__etat--ok" : ""}`}>
          {enLigne ? "En ligne" : "Hors ligne"}
          {aEnvoyer > 0 && ` · ${aEnvoyer} à envoyer`}
        </span>
        <Horloge />
        <button type="button" className="barre__btn" onClick={() => setFenetre({ type: "reglages" })}>
          Réglages
        </button>
        <button type="button" className="barre__btn" onClick={deconnecter} title="Verrouiller : la session et le ticket restent ouverts">
          Verrouiller
        </button>
      </header>

      <main className={`vente__corps${config.familles.length > 0 ? " vente__corps--touches" : ""}`}>
        <section className="vente__gauche">
          <div className="saisie">
            {qteEnAttente !== null && (
              <button type="button" className="saisie__qte" onClick={() => setQteEnAttente(null)} title="Annuler la quantité">
                {quantite(qteEnAttente)} × <span aria-hidden="true">✕</span>
              </button>
            )}
            <input
              ref={champ}
              className="saisie__champ"
              value={saisie}
              // Pas de clavier tactile de Windows : la douchette tape ici, le reste passe par les boutons.
              inputMode="none"
              placeholder={qteEnAttente !== null ? `Scannez l'article (${quantite(qteEnAttente)} pièces)` : "Scannez un article"}
              onChange={(e) => {
                const v = e.target.value;
                // « 3* » ou « 3x » : la quantité du prochain article.
                const m = /^(\d+(?:[.,]\d{1,3})?)[*xX×]$/.exec(v.trim());
                if (m) {
                  const q = lireNombre(m[1]);
                  if (q > 0) setQteEnAttente(q);
                  return setSaisie("");
                }
                setSaisie(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  traiterSaisie();
                } else if (e.key === "Escape") {
                  setSaisie("");
                  setQteEnAttente(null);
                }
              }}
              spellCheck={false}
              autoComplete="off"
            />
            <button type="button" className="saisie__btn" onClick={() => setFenetre({ type: "recherche", texte: "" })}>
              Rechercher
            </button>
          </div>
          {/* Dernier article scanné, juste sous le champ : le caissier le voit sans quitter la douchette des yeux. */}
          <div className="client">
            <span className="client__article">{dernier ? dernier.designation : "Bienvenue"}</span>
            <span className="client__prix">{dernier ? montant(dernier.prix) : ""}</span>
            <span className="client__total">
              Total <b>{montant(calcul?.total ?? 0)} DT</b>
            </span>
          </div>
          {message && <div className={`message${message.ok ? "" : " message--erreur"}`}>{message.texte}</div>}
          {recusTicket && (
            <div className={`bandeau-recus${recusTicket.credit > 0 ? "" : " bandeau-recus--ok"}`}>
              <span>
                Déjà reçu : <b>{montant(recusTicket.total)} DT</b>
                {recusTicket.tickets > 0 && ` (dont ${montant(recusTicket.tickets)} en tickets restaurant)`}
              </span>
              <b>{recusTicket.credit > 0 ? `Encore ${montant(recusTicket.credit)} DT d'articles à ajouter` : `Reste à payer ${montant(-recusTicket.credit)} DT`}</b>
            </div>
          )}
          {retour && <div className="bandeau-retour">RETOUR · les articles scannés seront remboursés et remis en stock</div>}

          <div className="ticket" ref={listeRef}>
            <table>
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th className="n">Qté</th>
                  <th className="n">Prix</th>
                  <th className="n">Remise</th>
                  <th className="n">Montant</th>
                </tr>
              </thead>
              <tbody>
                {calcul?.lignes.map((l) => (
                  <tr key={l.uid} className={`${l.uid === choisie ? "choisie" : ""}${l.offerte ? " offerte" : ""}`} onClick={() => setChoisie(l.uid === choisie ? null : l.uid)}>
                    <td>
                      {l.designation}
                      {l.promo && <span className="badge badge--promo">{l.promo}</span>}
                      {l.quantiteOfferte > 0 && <span className="badge badge--offert">+{quantite(l.quantiteOfferte)} offert</span>}
                      {l.codeBarre && <small className="ticket__code">{l.codeBarre}</small>}
                    </td>
                    <td className="n">{quantite(l.quantite)}</td>
                    <td className="n">
                      {l.prixNormal !== l.prixUnitaire && <s>{montant(l.prixNormal)}</s>} {montant(l.prixUnitaire)}
                    </td>
                    <td className="n">{l.remisePromo + l.remise > 0 ? `−${montant(l.remisePromo + l.remise)}` : ""}</td>
                    <td className="n b">{montant(l.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!calcul || calcul.lignes.length === 0) && <p className="ticket__vide">{retour ? "Scannez les articles rapportés." : "Prêt : scannez le premier article."}</p>}
          </div>

          <div className="totaux">
            <div>
              <span>Articles</span>
              <b>{quantite(calcul?.nbArticles ?? 0)}</b>
            </div>
            {calcul && calcul.remise > 0 && (
              <div>
                <span>Remise ticket</span>
                <b>−{montant(calcul.remise)}</b>
              </div>
            )}
            {calcul && calcul.economies > 0 && (
              <div>
                <span>Économies</span>
                <b>{montant(calcul.economies)}</b>
              </div>
            )}
            <div className="totaux__total">
              <span>{retour ? "À rembourser" : "Total TTC"}</span>
              <strong>{montant(calcul?.total ?? 0)}</strong>
            </div>
          </div>
        </section>

        <section className="vente__droite">
          {/* Toutes les actions passent par ce panneau (rien sur la ligne du ticket) : la ligne est d'abord touchée,
              puis la fonction choisie ici, un geste bien visible pour la caméra. */}
          <div className="fonctions">
            <button type="button" onClick={() => appliquerQuantite("ligne")} disabled={!ligneChoisie || ligneChoisie.offerte}>
              <Icone nom="quantite" />
              Quantité
              <small>ligne choisie</small>
            </button>
            <button type="button" className="fonctions__danger" onClick={annulerLigne} disabled={!ligneChoisie || ligneChoisie.offerte}>
              <Icone nom="supprimer" />
              Supprimer
              <small>ligne choisie</small>
            </button>
            <button type="button" onClick={() => calcul && avecDroit("remise", () => setFenetre({ type: "remise" }))} disabled={!calcul?.lignes.length}>
              <Icone nom="remise" />
              Remise
              <small>{ligneChoisie && !ligneChoisie.offerte ? "ligne ou ticket" : "ticket"}</small>
            </button>
            <button type="button" onClick={() => appliquerQuantite("suivant")}>
              <Icone nom="qteSuivante" />
              Qté ×
              <small>prochain article</small>
            </button>
            <button type="button" onClick={() => setFenetre({ type: "verif" })}>
              <Icone nom="verif" />
              Vérif prix
            </button>
            <button type="button" onClick={() => (ticket?.lignes.length ? mettreEnAttente() : setFenetre({ type: "attente" }))}>
              <Icone nom={ticket?.lignes.length ? "attente" : "reprendre"} />
              {ticket?.lignes.length ? "Mettre en attente" : "Reprendre"}
              {etat.attente.length > 0 && <span className="pastille">{etat.attente.length}</span>}
            </button>
            <button type="button" onClick={commencerRetour}>
              <Icone nom="retour" />
              Retour
            </button>
            <button type="button" className="fonctions__danger" onClick={annulerTicket} disabled={!ticket}>
              <Icone nom="annuler" />
              Annuler ticket
            </button>
            <button type="button" onClick={() => avecDroit("prelevement", () => setFenetre({ type: "mouvement" }))}>
              <Icone nom="prelevement" />
              Prélèvement
            </button>
            <button type="button" onClick={() => setFenetre({ type: "reimpression" })}>
              <Icone nom="imprimer" />
              Réimprimer
            </button>
            <button type="button" onClick={() => avecDroit("rapportX", () => setFenetre({ type: "x" }))}>
              <Icone nom="rapport" />
              Rapport X
            </button>
            <button
              type="button"
              onClick={() => {
                if (ticket?.lignes.length || etat.attente.length) return setMessage({ texte: "Terminez le ticket en cours et les tickets en attente avant la clôture.", ok: false });
                avecDroit("cloture", () => setFenetre({ type: "z" }));
              }}
            >
              <Icone nom="cloture" />
              Clôture Z
            </button>
          </div>

          <div className="vente__bas-droite">
            <div className="pave-caisse">
              {["7", "8", "9", "⌫", "4", "5", "6", "C", "1", "2", "3"].map((t) => (
                <button key={t} type="button" className={t === "⌫" || t === "C" ? "pave-caisse__fonction" : ""} onClick={() => taperPave(t)} aria-label={t === "⌫" ? "Effacer un chiffre" : t === "C" ? "Tout effacer" : undefined}>
                  {t}
                </button>
              ))}
              <button type="button" className="pave-caisse__entree" onClick={traiterSaisie}>
                Entrée
              </button>
              {["0", "00", ","].map((t) => (
                <button key={t} type="button" onClick={() => taperPave(t)}>
                  {t}
                </button>
              ))}
            </div>
            <div className="encaisser">
              {!retour && (
                <button type="button" className="btn btn--secondaire btn--grand" disabled={!calcul || calcul.total <= 0} onClick={especesExact}>
                  Espèces exact
                </button>
              )}
              <button type="button" className="btn btn--succes btn--grand encaisser__payer" disabled={!calcul?.lignes.length} onClick={encaisser}>
                {retour ? "Rembourser" : "Encaisser"} {montant(calcul?.total ?? 0)}
              </button>
            </div>
          </div>
        </section>

        {/* Bas de l'écran (30 %) : familles et leurs articles, noms seuls, comme sur l'ancienne caisse. */}
        {config.familles.length > 0 && (
          <div className="touches">
            <div className="touches__familles">
              {config.familles.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`touches__famille${f.id === famille?.id ? " actif" : ""}`}
                  style={{ "--c": f.couleur } as React.CSSProperties}
                  onClick={() => setFamilleId(f.id)}
                >
                  {f.nom}
                </button>
              ))}
            </div>
            <div className="touches__grille">
              {famille?.touches.map((t) => {
                const a = articles.get(t.articleId);
                if (!a) return null;
                return (
                  <button key={t.id} type="button" className="touche" style={{ "--c": t.couleur ?? famille.couleur } as React.CSSProperties} onClick={() => ajouterArticle(a)}>
                    <span>{t.libelle || a.designation}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {fenetre?.type === "paiement" && calcul && (
        <Paiement
          total={calcul.total}
          retour={retour}
          initiaux={ticket?.paiementsRecus}
          onValider={(p, r) => void terminer(p, r)}
          onFermer={(p) => {
            // Les règlements reçus (tickets restaurant…) restent sur le ticket pendant que le caissier ajoute des articles.
            if (!retour) majTicket((t) => (t ? { ...t, paiementsRecus: p.length ? p : undefined } : t));
            setFenetre(null);
          }}
        />
      )}
      {fenetre?.type === "remise" && calcul && (
        <DialogueRemise
          montantLigne={ligneChoisie && !ligneChoisie.offerte ? arrondir(ligneChoisie.quantite * ligneChoisie.prixUnitaire - ligneChoisie.remisePromo) : null}
          montantTicket={calcul.sousTotal}
          onFermer={() => setFenetre(null)}
          onValider={(cible, remise) => {
            majTicket((t) => (!t ? t : cible === "ticket" ? { ...t, remise } : { ...t, lignes: t.lignes.map((l) => (l.uid === ligneChoisie?.uid ? { ...l, remise } : l)) }));
            setFenetre(null);
          }}
        />
      )}
      {fenetre?.type === "mouvement" && <DialogueMouvement onFermer={() => setFenetre(null)} />}
      {fenetre?.type === "verif" && <DialogueVerifPrix onFermer={() => setFenetre(null)} />}
      {fenetre?.type === "recherche" && (
        <DialogueRecherche
          texteInitial={fenetre.texte}
          onFermer={() => setFenetre(null)}
          onChoisir={(a) => {
            setFenetre(null);
            ajouterArticle(a);
          }}
        />
      )}
      {fenetre?.type === "attente" && <DialogueAttente onFermer={() => setFenetre(null)} />}
      {fenetre?.type === "reimpression" && <DialogueReimpression onFermer={() => setFenetre(null)} />}
      {fenetre?.type === "x" && <DialogueRapportX onFermer={() => setFenetre(null)} />}
      {fenetre?.type === "z" && (
        <DialogueCloture
          onFermer={() => setFenetre(null)}
          onCloturee={() => {
            setFenetre(null);
            deconnecter();
          }}
        />
      )}
      {fenetre?.type === "reglages" && <DialogueReglages onFermer={() => setFenetre(null)} />}
      {droitDemande && (
        <CodeResponsable
          droit={droitDemande.droit}
          onFermer={() => setDroitDemande(null)}
          onAccorde={() => {
            const a = droitDemande.action;
            setDroitDemande(null);
            a();
          }}
        />
      )}
    </div>
  );
}

function Horloge() {
  const [m, setM] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setM(new Date()), 15_000);
    return () => clearInterval(i);
  }, []);
  return <span className="barre__heure">{heure(m)}</span>;
}
