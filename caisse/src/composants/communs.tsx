import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCaisse } from "../etat";
import type { Caissier, Droit } from "../types";

/** Fenêtre par-dessus l'écran de vente. Échap ferme (sauf si `bloquant`). */
export function Dialogue({ titre, onFermer, children, large, extraLarge, bloquant }: { titre: string; onFermer: () => void; children: ReactNode; large?: boolean; extraLarge?: boolean; bloquant?: boolean }) {
  useEffect(() => {
    if (bloquant) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onFermer();
      }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onFermer, bloquant]);
  return (
    <div className="dlg-fond" onMouseDown={(e) => e.target === e.currentTarget && !bloquant && onFermer()}>
      <div className={`dlg${large ? " dlg--large" : ""}${extraLarge ? " dlg--xl" : ""}`} role="dialog" aria-modal="true" aria-label={titre}>
        <header className="dlg__tete">
          <h2>{titre}</h2>
          {!bloquant && (
            <button type="button" className="dlg__fermer" onClick={onFermer} aria-label="Fermer">
              ×
            </button>
          )}
        </header>
        <div className="dlg__corps">{children}</div>
      </div>
    </div>
  );
}

/**
 * Pavé numérique tactile, aussi piloté au clavier (chiffres, virgule, Retour arrière, Entrée).
 * `masque` : affiche des points (codes caissiers).
 */
export function Pave({
  valeur,
  onChange,
  onValider,
  masque,
  decimal,
  libelleValider = "Valider",
  max = 12,
  desactive,
}: {
  valeur: string;
  onChange: (v: string) => void;
  onValider: () => void;
  masque?: boolean;
  decimal?: boolean;
  libelleValider?: string;
  max?: number;
  desactive?: boolean;
}) {
  const ref = useRef({ valeur, onChange, onValider, desactive });
  ref.current = { valeur, onChange, onValider, desactive };
  const taper = (c: string) => {
    const { valeur: v, onChange: onCh } = ref.current;
    // Valeur gardée tout de suite : deux touches avant le rendu suivant (frappe rapide) ne se perdent pas.
    const ch = (n: string) => {
      ref.current.valeur = n;
      onCh(n);
    };
    if (c === "⌫") return ch(v.slice(0, -1));
    if (c === "C") return ch("");
    if (c === ",") {
      if (!decimal || v.includes(",")) return;
      return ch(v === "" ? "0," : `${v},`);
    }
    if (v.length >= max) return;
    // 3 décimales au plus (millimes).
    if (decimal && v.includes(",") && v.split(",")[1].length >= 3) return;
    ch(v + c);
  };
  // Le clavier physique / la douchette passent par la version à jour (décimales et longueur changent selon la case).
  const taperRef = useRef(taper);
  taperRef.current = taper;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey) return;
      const taper = taperRef.current;
      if (/^[0-9]$/.test(e.key)) taper(e.key);
      else if (e.key === "," || e.key === ".") taper(",");
      else if (e.key === "Backspace") taper("⌫");
      else if (e.key === "Delete") taper("C");
      else if (e.key === "Enter") {
        if (!ref.current.desactive) ref.current.onValider();
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const touches = ["7", "8", "9", "4", "5", "6", "1", "2", "3", decimal ? "," : "C", "0", "⌫"];
  return (
    <div className="pave">
      <div className="pave__ecran">{masque ? "●".repeat(valeur.length) || " " : valeur || "0"}</div>
      <div className="pave__touches">
        {touches.map((t) => (
          <button key={t} type="button" className={`pave__touche${t === "⌫" || t === "C" ? " pave__touche--fonction" : ""}`} onClick={() => taper(t)}>
            {t}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn--primaire btn--grand pave__valider" disabled={desactive} onClick={onValider}>
        {libelleValider}
      </button>
    </div>
  );
}

const RANGEES_CLAVIER = ["1234567890", "AZERTYUIOP", "QSDFGHJKLM", "WXCVBN'-./:"];

/**
 * Clavier tactile (la caisse n'a pas de clavier physique) : chiffres, lettres AZERTY, ponctuation utile
 * (adresses, désignations), espace, effacer. Les frappes d'une douchette ou d'un vrai clavier restent possibles
 * dans le champ associé.
 */
export function Clavier({ valeur, onChange, onValider, libelleValider = "Valider", max = 60 }: { valeur: string; onChange: (v: string) => void; onValider?: () => void; libelleValider?: string; max?: number }) {
  const ref = useRef(valeur);
  ref.current = valeur;
  const taper = (c: string) => {
    const v = ref.current;
    const n = c === "⌫" ? v.slice(0, -1) : c === "effacer" ? "" : v.length >= max ? v : v + c;
    ref.current = n;
    onChange(n);
  };
  return (
    <div className="clavier">
      {RANGEES_CLAVIER.map((r) => (
        <div key={r} className="clavier__rangee">
          {[...r].map((c) => (
            <button key={c} type="button" className="clavier__touche" onClick={() => taper(c)}>
              {c}
            </button>
          ))}
        </div>
      ))}
      <div className="clavier__rangee">
        <button type="button" className="clavier__touche clavier__touche--fonction" onClick={() => taper("effacer")}>
          Effacer
        </button>
        <button type="button" className="clavier__touche clavier__touche--espace" onClick={() => taper(" ")}>
          Espace
        </button>
        <button type="button" className="clavier__touche clavier__touche--fonction" onClick={() => taper("⌫")}>
          ⌫
        </button>
        {onValider && (
          <button type="button" className="clavier__touche clavier__touche--valider" onClick={onValider}>
            {libelleValider}
          </button>
        )}
      </div>
    </div>
  );
}

const LIBELLES_DROITS: Record<Droit, string> = {
  remise: "accorder une remise",
  annulerLigne: "annuler une ligne",
  annulerTicket: "annuler le ticket",
  retour: "faire un retour",
  prelevement: "faire un prélèvement",
  rapportX: "éditer le rapport X",
  cloture: "clôturer la caisse",
  tiroir: "ouvrir le tiroir",
};

/** Demande le code d'un caissier qui a le droit (responsable) quand le caissier connecté ne l'a pas. */
export function CodeResponsable({ droit, onAccorde, onFermer }: { droit: Droit; onAccorde: (c: Caissier) => void; onFermer: () => void }) {
  const { identifier } = useCaisse();
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [verif, setVerif] = useState(false);
  const valider = async () => {
    if (code.length < 4) return;
    setVerif(true);
    const c = await identifier(code);
    setVerif(false);
    setCode("");
    if (!c) return setErreur("Code inconnu.");
    if (!c.droits[droit]) return setErreur(`${c.nom} n'a pas le droit de ${LIBELLES_DROITS[droit]}.`);
    onAccorde(c);
  };
  return (
    <Dialogue titre="Code responsable" onFermer={onFermer}>
      <p className="dlg__texte">Il faut le code d'un responsable pour {LIBELLES_DROITS[droit]}.</p>
      {erreur && <p className="alerte">{erreur}</p>}
      <Pave valeur={code} onChange={setCode} onValider={() => void valider()} masque max={6} desactive={verif || code.length < 4} libelleValider={verif ? "Vérification…" : "Valider"} />
    </Dialogue>
  );
}
