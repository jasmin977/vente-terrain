import { useEffect, useMemo, useRef, useState } from "react";
import { Dialogue, Pave } from "../composants/communs";
import { IconeMode } from "../composants/IconeMode";
import { LIBELLES_MODES } from "../lib/impression";
import { arrondir, lireNombre, montant } from "../lib/format";
import type { ModeReglement, Paiement as PaiementT } from "../types";

const MODES: ModeReglement[] = ["ESPECES", "TPE", "CHEQUE", "TICKET_RESTO", "BON_ACHAT"];

/** Monnaie due : seules les espèces se rendent (un ticket restaurant en trop est perdu, comme d'habitude). */
export function calculerRendu(total: number, paiements: PaiementT[]) {
  const especes = paiements.filter((p) => p.mode === "ESPECES").reduce((s, p) => s + p.montant, 0);
  const autres = paiements.filter((p) => p.mode !== "ESPECES").reduce((s, p) => s + p.montant, 0);
  const paye = arrondir(especes + autres);
  return {
    paye,
    reste: arrondir(Math.max(0, total - paye)),
    rendu: arrondir(Math.max(0, especes - Math.max(0, total - autres))),
    // Tickets restaurant au-delà du total : rien n'est rendu, le client doit choisir (voir Paiement).
    surplus: arrondir(Math.max(0, autres - total)),
  };
}


/**
 * Encaissement : un ou plusieurs règlements jusqu'au total, monnaie rendue sur les espèces. Tickets restaurant au-delà
 * du total : le surplus n'est pas rendu, le caissier demande au client d'ajouter des articles (les règlements restent
 * sur le ticket), de donner moins de tickets et payer le reste autrement, ou de laisser le surplus. TPE (carte) : le
 * montant à taper sur le TPE est affiché en grand et le n° d'autorisation du ticket carte est demandé (le TPE
 * n'est pas relié à la caisse : il évite les erreurs de saisie).
 */
export function Paiement({
  total,
  retour,
  initiaux,
  onValider,
  onFermer,
}: {
  total: number;
  retour: boolean;
  /** Règlements déjà reçus pour ce ticket (gardés quand le caissier est revenu ajouter des articles). */
  initiaux?: PaiementT[];
  onValider: (p: PaiementT[], rendu: number) => void;
  /** Fermeture : les règlements saisis restent sur le ticket. */
  onFermer: (p: PaiementT[]) => void;
}) {
  const [paiements, setPaiements] = useState<PaiementT[]>(initiaux ?? []);
  // Surplus de tickets restaurant laissé par le client (choix explicite, à refaire si les règlements changent).
  const [surplusLaisse, setSurplusLaisse] = useState(false);
  const [mode, setMode] = useState<ModeReglement>("ESPECES");
  const [saisie, setSaisie] = useState("");
  const [autorisation, setAutorisation] = useState("");
  // Carte / chèque : le pavé remplit soit le montant, soit le n° (autorisation ou chèque), au choix du caissier.
  const [champ, setChamp] = useState<"montant" | "reference">("montant");
  const [erreur, setErreur] = useState<string | null>(null);
  const { paye, reste, rendu, surplus } = useMemo(() => calculerRendu(total, paiements), [total, paiements]);
  const complet = paye >= total - 0.0005;
  const aDecider = surplus > 0 && !surplusLaisse;
  useEffect(() => setSurplusLaisse(false), [paiements]);
  // Tout est payé : Entrée valide le ticket (le pavé n'est plus affiché).
  const finir = useRef(() => {});
  finir.current = () => complet && !aDecider && !retour && onValider(paiements, rendu);
  useEffect(() => {
    if (!complet) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finir.current();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [complet]);

  // Retour : remboursement en espèces du montant total, d'un coup.
  if (retour)
    return (
      <Dialogue titre="Remboursement" onFermer={() => onFermer([])}>
        <div className="paie__total paie__total--retour">
          <span>À rembourser au client</span>
          <strong>{montant(total)} DT</strong>
        </div>
        <p className="dlg__texte">Rendez la somme en espèces puis validez : les articles reviennent en stock.</p>
        <button type="button" className="btn btn--primaire btn--grand" autoFocus onClick={() => onValider([{ mode: "ESPECES", montant: total }], 0)}>
          Rembourser {montant(total)} DT en espèces
        </button>
      </Dialogue>
    );

  const montantSaisi = saisie === "" ? reste : lireNombre(saisie);
  const ajouter = (m: ModeReglement = mode, valeur = montantSaisi) => {
    setErreur(null);
    if (!(valeur > 0)) return setErreur("Saisissez le montant.");
    if ((m === "TPE" || m === "CHEQUE" || m === "BON_ACHAT") && valeur > reste + 0.0005) return setErreur(`${LIBELLES_MODES[m]} : pas plus que le reste à payer (${montant(reste)}).`);
    if (m === "TPE" && !autorisation.trim()) {
      setChamp("reference");
      return setErreur("Saisissez le n° d'autorisation imprimé sur le ticket de la carte.");
    }
    setPaiements((p) => [...p, { mode: m, montant: arrondir(valeur), reference: m === "TPE" || m === "CHEQUE" ? autorisation.trim() || null : null }]);
    setSaisie("");
    setAutorisation("");
    setMode("ESPECES");
    setChamp("montant");
  };
  const choisirMode = (m: ModeReglement) => {
    setMode(m);
    setErreur(null);
    // Le montant proposé est le reste à payer : on commence par le n° d'autorisation / de chèque.
    setChamp(m === "TPE" || m === "CHEQUE" ? "reference" : "montant");
  };
  const avecReference = mode === "TPE" || mode === "CHEQUE";
  const surReference = avecReference && champ === "reference";
  const valider = () => {
    if (complet) finir.current();
    else ajouter();
  };
  /** Le client garde des tickets : les tickets saisis sont retirés, le caissier tape la valeur réellement donnée. */
  const moinsDeTickets = () => {
    setPaiements((p) => p.filter((x) => x.mode !== "TICKET_RESTO"));
    setMode("TICKET_RESTO");
    setChamp("montant");
    setSaisie("");
    setErreur(null);
  };

  return (
    <Dialogue titre="Encaissement" onFermer={() => onFermer(paiements)} large>
      <div className={`paie${complet ? " paie--complet" : ""}`}>
        <div className="paie__gauche">
          <div className="paie__total">
            <span>Total à payer</span>
            <strong>{montant(total)} DT</strong>
          </div>
          <div className="paie__lignes">
            {paiements.map((p, i) => (
              <div key={i} className="paie__ligne">
                <span>
                  <IconeMode mode={p.mode} taille={18} /> {LIBELLES_MODES[p.mode]}
                  {p.reference && <small> · {p.mode === "TPE" ? `autorisation ${p.reference}` : `n° ${p.reference}`}</small>}
                </span>
                <span>{montant(p.montant)}</span>
                <button type="button" className="paie__retirer" onClick={() => setPaiements((x) => x.filter((_, k) => k !== i))} aria-label="Retirer">
                  ×
                </button>
              </div>
            ))}
            {paiements.length === 0 && <p className="paie__vide">Choisissez le mode de règlement.</p>}
          </div>
          {aDecider ? (
            <div className="paie__surplus">
              <div className="paie__surplus-titre">
                <span>Tickets restaurant en trop</span>
                <strong>{montant(surplus)} DT</strong>
              </div>
              <p>Le surplus n'est pas rendu en espèces. Demandez au client :</p>
              <button type="button" className="btn btn--primaire btn--grand" onClick={() => onFermer(paiements)}>
                Ajouter des articles
                <small>les tickets restent sur le ticket · encore {montant(surplus)} DT à utiliser</small>
              </button>
              <button type="button" className="btn btn--secondaire btn--grand" onClick={moinsDeTickets}>
                Donner moins de tickets
                <small>saisir la valeur des tickets donnés, puis payer le reste autrement</small>
              </button>
              <button type="button" className="btn btn--secondaire paie__surplus-laisser" onClick={() => setSurplusLaisse(true)}>
                Le client laisse les {montant(surplus)} DT
              </button>
            </div>
          ) : (
            <>
              <div className={`paie__reste${complet ? " paie__reste--ok" : ""}`}>
                <span>{complet ? "Rendu monnaie" : "Reste à payer"}</span>
                <strong>{montant(complet ? rendu : reste)} DT</strong>
              </div>
              {complet && surplus > 0 && <p className="paie__note">Surplus de tickets restaurant laissé par le client : {montant(surplus)} DT.</p>}
              {complet && (
                <button type="button" className="btn btn--succes btn--grand" onClick={() => finir.current()}>
                  Valider le ticket
                </button>
              )}
            </>
          )}
        </div>

        {!complet && (
          <div className="paie__droite">
            <div className="paie__modes">
              {MODES.map((m) => (
                <button key={m} type="button" className={`paie__mode${m === mode ? " paie__mode--actif" : ""}`} onClick={() => choisirMode(m)}>
                  <IconeMode mode={m} />
                  <span>{LIBELLES_MODES[m]}</span>
                </button>
              ))}
            </div>
            {erreur && <p className="alerte">{erreur}</p>}
            {avecReference && (
              <div className={mode === "TPE" ? "paie__tpe" : "paie__cases"}>
                {mode === "TPE" && <span>Montant à taper sur le TPE</span>}
                <div className="paie__cases-ligne">
                  <button type="button" className={`paie__case${champ === "montant" ? " actif" : ""}`} onClick={() => setChamp("montant")}>
                    <small>Montant</small>
                    <strong>{montant(Number.isNaN(montantSaisi) ? 0 : montantSaisi)}</strong>
                  </button>
                  <button type="button" className={`paie__case${champ === "reference" ? " actif" : ""}`} onClick={() => setChamp("reference")}>
                    <small>{mode === "TPE" ? "N° d'autorisation" : "N° du chèque"}</small>
                    <strong>{autorisation || "—"}</strong>
                  </button>
                </div>
              </div>
            )}
            {mode === "ESPECES" && <p className="paie__aide">Saisissez la somme reçue du client (vide : montant exact).</p>}
            {mode === "TICKET_RESTO" && <p className="paie__aide">Saisissez la valeur des tickets donnés par le client.</p>}
            <Pave
              valeur={surReference ? autorisation : saisie}
              onChange={surReference ? setAutorisation : setSaisie}
              onValider={valider}
              decimal={!surReference}
              max={surReference ? 20 : 12}
              libelleValider={`Ajouter ${mode === "TPE" ? "TPE" : LIBELLES_MODES[mode].toLowerCase()} · ${montant(Number.isNaN(montantSaisi) ? 0 : montantSaisi)}`}
            />
          </div>
        )}
      </div>
    </Dialogue>
  );
}
