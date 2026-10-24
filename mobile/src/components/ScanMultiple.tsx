import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IonIcon } from "@ionic/react";
import { addOutline, alertCircleOutline, checkmarkCircle, checkmarkOutline, closeOutline, removeOutline } from "ionicons/icons";
import type { Article } from "../types/article";
import { demarrerScanContinu } from "../lib/barcode";
import { articleParCode } from "../utils/articleSearch";
import ArticleImage from "./ArticleImage";
import { t, tn } from "../i18n";

export interface ArticleScanne {
  articleId: string;
  quantite: number;
}

interface Props {
  ouvert: boolean;
  articles: Article[];
  onValider: (lignes: ArticleScanne[]) => void;
  onFermer: () => void;
}

/** Même code relu par la caméra pendant ce délai : ignoré (le code reste quelques instants dans le cadre). */
const DELAI_MEME_CODE = 1800;

/** Petit bip : reconnu (aigu) ou inconnu (grave). */
function bip(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 1400 : 380;
    g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.09 : 0.25));
    setTimeout(() => void ctx.close(), 400);
  } catch {
    // pas de son
  }
  navigator.vibrate?.(ok ? 40 : [60, 60, 60]);
}

/**
 * Scan de plusieurs articles à la suite avec la caméra du téléphone : la caméra reste ouverte, chaque article
 * scanné s'ajoute avec 1 pièce (scanné à nouveau : +1), réglable avec − / +. « Valider » ferme la caméra et
 * ajoute la sélection au bon.
 */
export default function ScanMultiple({ ouvert, articles, onValider, onFermer }: Props) {
  const [lignes, setLignes] = useState<ArticleScanne[]>([]);
  const [dernier, setDernier] = useState<{ texte: string; ok: boolean } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const arreter = useRef<(() => Promise<void>) | null>(null);
  const vus = useRef(new Map<string, number>());
  const articlesRef = useRef(articles);
  articlesRef.current = articles;

  useEffect(() => {
    if (!ouvert) return;
    let annule = false;
    setLignes([]);
    setDernier(null);
    setErreur(null);
    vus.current.clear();
    void demarrerScanContinu((code) => {
      const maintenant = Date.now();
      if (maintenant - (vus.current.get(code) ?? 0) < DELAI_MEME_CODE) return;
      vus.current.set(code, maintenant);
      const article = articleParCode(articlesRef.current, code);
      bip(Boolean(article));
      if (!article) {
        setDernier({ texte: t("Code inconnu : {c}", { c: code }), ok: false });
        return;
      }
      setDernier({ texte: article.designation, ok: true });
      // Nouvel article en tête de liste avec 1 pièce ; déjà scanné : +1.
      setLignes((l) => {
        const deja = l.find((x) => x.articleId === article.id);
        return deja ? l.map((x) => (x.articleId === article.id ? { ...x, quantite: x.quantite + 1 } : x)) : [{ articleId: article.id, quantite: 1 }, ...l];
      });
    }).then((r) => {
      if ("error" in r) {
        if (!annule) setErreur(r.error);
        return;
      }
      if (annule) void r.arreter();
      else arreter.current = r.arreter;
    });
    return () => {
      annule = true;
      void arreter.current?.();
      arreter.current = null;
    };
  }, [ouvert]);

  // Touche retour d'Android : ferme le scan (au lieu de quitter le bon).
  useEffect(() => {
    if (!ouvert) return;
    const retour = (e: Event) => (e as CustomEvent<{ register: (p: number, f: () => void) => void }>).detail.register(1000, onFermer);
    document.addEventListener("ionBackButton", retour);
    return () => document.removeEventListener("ionBackButton", retour);
  }, [ouvert, onFermer]);

  if (!ouvert) return null;
  const parId = new Map(articles.map((a) => [a.id, a]));
  const changer = (articleId: string, d: number) =>
    setLignes((l) => l.flatMap((x) => (x.articleId !== articleId ? [x] : x.quantite + d <= 0 ? [] : [{ ...x, quantite: x.quantite + d }])));
  const totalPieces = lignes.reduce((s, l) => s + l.quantite, 0);

  return createPortal(
    <div className="rc-scanmulti" role="dialog" aria-label={t("Scanner plusieurs articles")}>
      <header className="rc-scanmulti__haut">
        <button type="button" className="rc-scanmulti__rond" onClick={onFermer} aria-label={t("Fermer le scan")}>
          <IonIcon icon={closeOutline} />
        </button>
        <div>
          <strong>{t("Scanner les articles")}</strong>
          <span>{t("Visez les codes-barres l'un après l'autre")}</span>
        </div>
      </header>

      {/* Fenêtre de visée : la caméra se voit au travers. */}
      <div className="rc-scanmulti__visee" aria-hidden="true">
        <span className="rc-scanmulti__cadre" />
      </div>

      <section className="rc-scanmulti__bas">
        {erreur ? (
          <p className="rc-scanmulti__retour rc-scanmulti__retour--ko">
            <IonIcon icon={alertCircleOutline} /> {erreur}
          </p>
        ) : dernier ? (
          <p className={`rc-scanmulti__retour${dernier.ok ? "" : " rc-scanmulti__retour--ko"}`}>
            <IonIcon icon={dernier.ok ? checkmarkCircle : alertCircleOutline} /> {dernier.texte}
          </p>
        ) : (
          <p className="rc-scanmulti__retour rc-scanmulti__retour--attente">{t("Prêt : scannez le premier article.")}</p>
        )}

        <ul className="rc-scanmulti__liste">
          {lignes.map((l) => {
            const a = parId.get(l.articleId);
            return (
              <li key={l.articleId}>
                <ArticleImage src={a?.img} alt="" size={38} />
                <span className="rc-scanmulti__nom">{a?.designation ?? t("Article")}</span>
                <span className="rc-scanmulti__qte">
                  <button type="button" onClick={() => changer(l.articleId, -1)} aria-label={t("Moins un")}>
                    <IonIcon icon={removeOutline} />
                  </button>
                  <strong>{l.quantite}</strong>
                  <button type="button" onClick={() => changer(l.articleId, 1)} aria-label={t("Plus un")}>
                    <IonIcon icon={addOutline} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>

        <button type="button" className="rc-scanmulti__valider" disabled={lignes.length === 0} onClick={() => onValider(lignes)}>
          <IonIcon icon={checkmarkOutline} />
          {lignes.length === 0
            ? t("Aucun article scanné")
            : `${t("Valider")} · ${tn(lignes.length, "{n} article", "{n} articles")} · ${tn(totalPieces, "{n} pièce", "{n} pièces")}`}
        </button>
      </section>
    </div>,
    document.body,
  );
}
