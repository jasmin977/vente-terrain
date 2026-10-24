import { useEffect, useMemo, useState, type FocusEvent, type KeyboardEvent } from "react";
import { addOutline, checkmarkOutline, phonePortraitOutline, trashOutline } from "ionicons/icons";
import { ApiError } from "../../api/client";
import { listArticles } from "../../api/articles";
import { createAchat, listFournisseurs, prochainNumeroAchat } from "../../api/achats";
import type { Achat, Fournisseur, TypeAchat } from "../../types/achat";
import type { Article } from "../../types/article";
import { Button, Field, IconButton, Money, Notice, PageNotice, PickerField, PickerSheet, Sheet } from "../../ui";
import FournisseurFormSheet from "./FournisseurFormSheet";
import ImportCollecteSheet, { type LigneImportee } from "../ImportCollecteSheet";
import FlecheVariation from "../FlecheVariation";
import { nomFournisseur } from "./nomFournisseur";
import { formatAmount, toLocalDateString } from "../../utils/format";
import { htDepuisMarge, margeDepuis, ttcDepuisHT } from "../../utils/tarifs";
import { t } from "../../i18n";

/** Prix de vente quand le prix d'achat change : garder la marge (proposé), garder le prix de vente, ou un autre prix. */
type ChoixVente = "marge" | "garder" | "autre";

interface LigneSaisie {
  cle: string;
  articleId?: string;
  designation: string;
  quantite: string;
  prix: string;
  tva: string;
  /** Expiration des pièces reçues (AAAA-MM-JJ), facultative. */
  expiration: string;
  choixVente: ChoixVente;
  /** Prix de vente HT tapé (choix « autre »). */
  venteAutre: string;
}

const nombre = (texte: string) => Number(texte.replace(",", ".").replace(/\s/g, "")) || 0;
const arrondi = (n: number) => Math.round(n * 1000) / 1000;
let compteur = 0;
/** Droit de timbre d'une facture (TND). */
const TIMBRE = 1;
const nouvelleCle = () => `l${++compteur}`;
const pourcent = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

const TITRES: Record<TypeAchat, string> = {
  BL: "Nouveau B° Livraison fournisseur",
  FACTURE: "Nouvelle facture fournisseur",
  ENTREE: "Nouveau B° Entrée",
};
const DESTINATIONS: Record<TypeAchat, string> = { BL: "BL fournisseur", FACTURE: "Facture fournisseur", ENTREE: "B° Entrée" };

interface Props {
  isOpen: boolean;
  type: TypeAchat;
  onDismiss: () => void;
  /** Document créé : l'écran enchaîne sur son règlement (payé, avance ou non payé). */
  onCree: (achat: Achat) => void;
}

/**
 * Saisie d'un achat : BL ou facture fournisseur (numéro du papier) ou B° Entrée (numéro automatique, pas de
 * fournisseur, une note). Chaque ligne entre au stock (avec sa date d'expiration) ; si le prix d'achat change, la ligne
 * le signale et propose de garder la marge en mettant à jour le prix de vente.
 */
export default function AchatFormSheet({ isOpen, type, onDismiss, onCree }: Props) {
  const entree = type === "ENTREE";
  const aujourdhui = toLocalDateString(new Date());
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [fournisseurId, setFournisseurId] = useState<string | undefined>(undefined);
  const [numero, setNumero] = useState("");
  const [date, setDate] = useState(aujourdhui);
  const [fournisseurLibre, setFournisseurLibre] = useState("");
  const [note, setNote] = useState("");
  const [lignes, setLignes] = useState<LigneSaisie[]>([]);
  const [pickerFournisseur, setPickerFournisseur] = useState(false);
  const [pickerArticle, setPickerArticle] = useState(false);
  const [nouveauFournisseur, setNouveauFournisseur] = useState(false);
  const [importPda, setImportPda] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // B° Entrée : numéro automatique (AAAA/001) de l'année de la date choisie. BL et facture : numéro du papier, tapé.
  const annee = Number(date.slice(0, 4)) || new Date().getFullYear();
  useEffect(() => {
    if (!isOpen) return;
    setNumero("");
    if (!entree) return;
    prochainNumeroAchat("ENTREE", annee)
      .then((r) => setNumero(r.numero))
      .catch(() => setNumero(""));
  }, [isOpen, entree, annee]);

  useEffect(() => {
    if (!isOpen) return;
    setFournisseurId(undefined);
    setFournisseurLibre("");
    setNote("");
    setDate(aujourdhui);
    setLignes([]);
    setErreur(null);
    listFournisseurs().then(setFournisseurs).catch(() => undefined);
    listArticles().then(setArticles).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const fournisseur = fournisseurs.find((f) => f.id === fournisseurId);
  const articleParId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);

  const totaux = useMemo(() => {
    let ht = 0;
    let ttc = 0;
    for (const l of lignes) {
      const h = arrondi(nombre(l.quantite) * nombre(l.prix));
      ht += h;
      ttc += arrondi(h * (1 + nombre(l.tva) / 100));
    }
    return { ht: arrondi(ht), tva: arrondi(ttc - ht), ttc: arrondi(ttc) };
  }, [lignes]);

  /** Variation du prix d'achat d'une ligne et les prix de vente possibles ; null si le prix n'a pas changé. */
  const variation = (l: LigneSaisie) => {
    const a = l.articleId ? articleParId.get(l.articleId) : undefined;
    if (!a) return null;
    const ancien = Number(a.prixAchat ?? 0);
    const nouveau = nombre(l.prix);
    if (!(nouveau > 0) || Math.abs(nouveau - ancien) < 0.0005) return null;
    const venteActuelle = Number(a.prixVente);
    const tva = Number(a.tva ?? 0);
    const fodec = Number(a.fodec ?? 0);
    const margeActuelle = ancien > 0 ? margeDepuis(venteActuelle, ancien) : undefined;
    const venteMarge = margeActuelle !== undefined ? htDepuisMarge(nouveau, margeActuelle, tva, fodec) : undefined;
    const vente = l.choixVente === "marge" && venteMarge !== undefined ? venteMarge : l.choixVente === "autre" ? nombre(l.venteAutre) : venteActuelle;
    return {
      ancien,
      nouveau,
      hausse: nouveau > ancien,
      ecart: ancien > 0 ? ((nouveau - ancien) / ancien) * 100 : null,
      margeActuelle,
      venteActuelle,
      venteMarge,
      vente,
      nouvelleMarge: margeDepuis(vente, nouveau),
      ttc: (ht: number) => ttcDepuisHT(ht, tva, fodec),
    };
  };

  const lignesValides =
    lignes.length > 0 &&
    lignes.every((l) => l.designation.trim() && nombre(l.quantite) > 0 && nombre(l.prix) >= 0 && (l.choixVente !== "autre" || !variation(l) || nombre(l.venteAutre) > 0));
  const pret = (entree || (Boolean(fournisseurId) && numero.trim() !== "")) && Boolean(date) && lignesValides;

  const nouvelleLigne = (a: Article, quantite = 1): LigneSaisie => ({
    cle: nouvelleCle(),
    articleId: a.id,
    designation: a.designation,
    quantite: String(quantite),
    prix: String(Number(a.prixAchat ?? 0)),
    tva: String(Number(a.tva ?? 0)),
    expiration: "",
    choixVente: "marge",
    venteAutre: "",
  });
  const ajouterArticle = (a: Article) => setLignes((ls) => [...ls, nouvelleLigne(a)]);
  // Collecte du PDA : chaque article reconnu est ajouté (quantité additionnée s'il est déjà dans le document).
  const importerCollecte = (importees: LigneImportee[]) => {
    let refusees = 0;
    setLignes((ls) => {
      const resultat = [...ls];
      for (const imp of importees) {
        const a = articleParId.get(imp.articleId);
        if (!a) {
          refusees++;
          continue;
        }
        const i = resultat.findIndex((l) => l.articleId === a.id);
        if (i >= 0) resultat[i] = { ...resultat[i], quantite: String(arrondi(nombre(resultat[i].quantite) + imp.quantite)) };
        else resultat.push(nouvelleLigne(a, imp.quantite));
      }
      return resultat;
    });
    return refusees;
  };
  const majLigne = <K extends keyof LigneSaisie>(cle: string, champ: K, v: LigneSaisie[K]) =>
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, [champ]: v } : l)));
  const retirer = (cle: string) => setLignes((ls) => ls.filter((l) => l.cle !== cle));

  // Champs des lignes (Qté, P.U. HT, TVA, Expiration) : Entrée passe au champ suivant, les flèches se déplacent comme
  // dans un tableur. Entrée sur le dernier champ ouvre l'ajout d'un article.
  const NB_COLS = 4;
  const naviguer = (e: KeyboardEvent<HTMLElement>) => {
    if (e.defaultPrevented) return;
    const champ = e.target as HTMLInputElement;
    if (champ.tagName !== "INPUT" || champ.dataset.ligne === undefined) return;
    let ligne = Number(champ.dataset.ligne);
    let col = Number(champ.dataset.col);
    const debut = champ.selectionStart === 0;
    const fin = champ.selectionEnd === champ.value.length;
    const suivant = () => {
      col += 1;
      if (col >= NB_COLS) {
        col = 0;
        ligne += 1;
      }
    };
    switch (e.key) {
      case "Enter":
        suivant();
        break;
      case "ArrowRight":
        if (!fin) return;
        suivant();
        break;
      case "ArrowLeft":
        if (!debut) return;
        col -= 1;
        if (col < 0) {
          col = NB_COLS - 1;
          ligne -= 1;
        }
        break;
      case "ArrowDown":
        ligne += 1;
        break;
      case "ArrowUp":
        ligne -= 1;
        break;
      default:
        return;
    }
    const cible = e.currentTarget.querySelector<HTMLInputElement>(`input[data-ligne="${ligne}"][data-col="${col}"]`);
    if (cible) {
      e.preventDefault();
      cible.focus();
      cible.select();
    } else if (e.key === "Enter") {
      e.preventDefault();
      setPickerArticle(true);
    }
  };
  const toutSelectionner = (e: FocusEvent<HTMLInputElement>) => {
    const champ = e.currentTarget;
    setTimeout(() => champ.select(), 0);
  };

  const enregistrer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      const achat = await createAchat({
        type,
        numero: entree ? undefined : numero.trim(),
        fournisseurId: entree ? undefined : fournisseurId,
        fournisseurLibre: fournisseur?.divers ? fournisseurLibre.trim() || undefined : undefined,
        notes: note.trim() || undefined,
        date,
        lignes: lignes.map((l) => {
          const v = variation(l);
          return {
            articleId: l.articleId ?? null,
            designation: l.designation.trim(),
            quantite: nombre(l.quantite),
            prixUnitaire: nombre(l.prix),
            tauxTva: nombre(l.tva),
            dateExpiration: l.expiration || null,
            // Prix de vente envoyé seulement s'il change (marge gardée ou prix tapé).
            prixVente: v && l.choixVente !== "garder" ? arrondi(v.vente * 1_000_000) / 1_000_000 : undefined,
          };
        }),
      });
      onCree(achat);
      onDismiss();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible d'enregistrer le document"));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <>
      <Sheet
        isOpen={isOpen}
        title={t(TITRES[type])}
        large
        onDismiss={onDismiss}
        footer={
          <div className="rc-achat__pied">
            <Button size="lg" icon={checkmarkOutline} loading={enCours} disabled={!pret} onClick={enregistrer}>
              {t("Enregistrer")}
            </Button>
          </div>
        }
      >
        <div className="rc-achat__form">
          {erreur && <PageNotice>{erreur}</PageNotice>}

          <div className="rc-achat__ligne3">
            {entree ? (
              <Field label={t("Note")} value={note} onChange={setNote} placeholder={t("Ce qui a été acheté, chez qui…")} />
            ) : (
              <div className="rc-achat__fournisseur">
                <PickerField
                  label={t("Fournisseur")}
                  required
                  value={fournisseur ? nomFournisseur(fournisseur) : undefined}
                  placeholder={t("Choisir un fournisseur")}
                  onOpen={() => setPickerFournisseur(true)}
                />
                <Button variant="ghost" icon={addOutline} onClick={() => setNouveauFournisseur(true)}>
                  {t("Nouveau fournisseur")}
                </Button>
              </div>
            )}
            {entree ? (
              <Field label={t("N° du B° Entrée")} value={numero || "…"} readOnly />
            ) : (
              <Field
                label={type === "BL" ? t("N° du BL (papier du fournisseur)") : t("N° de facture (papier du fournisseur)")}
                value={numero}
                onChange={setNumero}
                required
              />
            )}
            <Field label={t("Date")} type="date" value={date} max={aujourdhui} onChange={(v) => setDate(v || aujourdhui)} required />
          </div>
          {fournisseur?.divers && (
            <Field label={t("Acheté chez / précision")} value={fournisseurLibre} onChange={setFournisseurLibre} placeholder={t("Ex. Quincaillerie Ben Ali")} />
          )}

          <section className="rc-achat__lignes" aria-label={t("Lignes")} onKeyDown={naviguer}>
            <div className="rc-achat__tete-lignes" aria-hidden="true">
              <span>{t("Désignation")}</span>
              <span>{t("Qté (pièces)")}</span>
              <span>{t("P.U. HT")}</span>
              <span>{t("TVA %")}</span>
              <span>{t("Expiration")}</span>
              <span>{t("Total TTC")}</span>
              <span />
            </div>
            {lignes.length === 0 && <Notice tone="info">{t("Ajoutez les articles du document.")}</Notice>}
            {lignes.map((l, i) => {
              const ttc = arrondi(arrondi(nombre(l.quantite) * nombre(l.prix)) * (1 + nombre(l.tva) / 100));
              const v = variation(l);
              return (
                <div key={l.cle} className="rc-achat__bloc-ligne">
                  <div className="rc-achat__ligne">
                    <span className="rc-achat__designation">{l.designation}</span>
                    <Field label={t("Quantité")} hideLabel inputMode="decimal" value={l.quantite} data-ligne={i} data-col={0} onFocus={toutSelectionner} onChange={(x) => majLigne(l.cle, "quantite", x)} />
                    <Field label={t("Prix unitaire HT")} hideLabel inputMode="decimal" value={l.prix} placeholder="0.000" data-ligne={i} data-col={1} onFocus={toutSelectionner} onChange={(x) => majLigne(l.cle, "prix", x)} />
                    <Field label={t("TVA")} hideLabel inputMode="decimal" value={l.tva} data-ligne={i} data-col={2} onFocus={toutSelectionner} onChange={(x) => majLigne(l.cle, "tva", x)} />
                    <Field label={t("Date d'expiration")} hideLabel type="date" value={l.expiration} min={aujourdhui} data-ligne={i} data-col={3} data-vide-autorise="" onChange={(x) => majLigne(l.cle, "expiration", x)} />
                    <Money value={ttc} size="sm" />
                    <IconButton icon={trashOutline} tone="danger" label={t("Retirer la ligne")} onClick={() => retirer(l.cle)} />
                  </div>

                  {v && (
                    <div className={`rc-achat__variation rc-achat__variation--${v.hausse ? "hausse" : "baisse"}`}>
                      <span className="rc-achat__variation-prix">
                        <FlecheVariation sens={v.hausse ? "hausse" : "baisse"} label={v.hausse ? t("Prix d'achat en hausse") : t("Prix d'achat en baisse")} />
                        {t("Prix d'achat")} <s>{formatAmount(v.ancien)}</s> → <strong>{formatAmount(v.nouveau)}</strong>
                        {v.ecart !== null && <em>{pourcent(v.ecart)}</em>}
                      </span>
                      {v.margeActuelle !== undefined && (
                        <span className="rc-achat__variation-marge">
                          {t("Marge actuelle")} <strong>{v.margeActuelle.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %</strong>
                        </span>
                      )}
                      <div className="rc-achat__choix-vente" role="radiogroup" aria-label={t("Prix de vente")}>
                        {v.venteMarge !== undefined && (
                          <label>
                            <input type="radio" checked={l.choixVente === "marge"} onChange={() => majLigne(l.cle, "choixVente", "marge")} />
                            {t("Garder la marge")} → <strong>{formatAmount(v.venteMarge)}</strong> HT <small>({formatAmount(v.ttc(v.venteMarge))} TTC)</small>
                          </label>
                        )}
                        <label>
                          <input type="radio" checked={l.choixVente === "garder" || (l.choixVente === "marge" && v.venteMarge === undefined)} onChange={() => majLigne(l.cle, "choixVente", "garder")} />
                          {t("Garder le prix de vente")} <strong>{formatAmount(v.venteActuelle)}</strong> HT
                          {l.choixVente === "garder" && v.nouvelleMarge !== undefined && <small> ({t("marge")} {v.nouvelleMarge.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %)</small>}
                        </label>
                        <label className="rc-achat__vente-autre">
                          <input type="radio" checked={l.choixVente === "autre"} onChange={() => majLigne(l.cle, "choixVente", "autre")} />
                          {t("Autre prix de vente HT")}
                          <input
                            className="rc-achat__vente-saisie"
                            inputMode="decimal"
                            value={l.venteAutre}
                            placeholder="0.000"
                            onFocus={() => majLigne(l.cle, "choixVente", "autre")}
                            onChange={(e) => majLigne(l.cle, "venteAutre", e.target.value)}
                          />
                          {l.choixVente === "autre" && nombre(l.venteAutre) > 0 && v.nouvelleMarge !== undefined && (
                            <small>
                              {t("marge")} {v.nouvelleMarge.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
                            </small>
                          )}
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="rc-achat__ajouts">
              <Button variant="secondary" icon={addOutline} onClick={() => setPickerArticle(true)}>
                {t("Ajouter un article")}
              </Button>
              <Button variant="ghost" icon={phonePortraitOutline} onClick={() => setImportPda(true)}>
                {t("Télécharger depuis le PDA")}
              </Button>
            </div>
          </section>

          <p className="rc-footnote">{t("À l'enregistrement, les articles entrent dans le stock du dépôt (avec leur date d'expiration) et leurs prix sont mis à jour.")}</p>

          <div className="rc-transfo__totaux">
            <span>
              {t("Total HT")} <Money value={totaux.ht} size="sm" />
            </span>
            <span>
              {t("TVA")} <Money value={totaux.tva} size="sm" />
            </span>
            <strong>
              {t("Total TTC")} <Money value={totaux.ttc} size={type === "FACTURE" ? "md" : "lg"} />
            </strong>
            {type === "FACTURE" && (
              <>
                <span>
                  {t("Timbre")} <Money value={TIMBRE} size="sm" />
                </span>
                <strong>
                  {t("Net à payer")} <Money value={arrondi(totaux.ttc + TIMBRE)} size="lg" />
                </strong>
              </>
            )}
          </div>
        </div>
      </Sheet>

      <PickerSheet
        isOpen={pickerFournisseur}
        title={t("Fournisseur")}
        value={fournisseurId ?? "__aucun__"}
        onDismiss={() => setPickerFournisseur(false)}
        onSelect={(v) => {
          setFournisseurId(v === "__aucun__" ? undefined : v);
          setPickerFournisseur(false);
        }}
        emptyLabel={t("Aucun fournisseur. Créez-en un avec « Nouveau fournisseur ».")}
        options={[
          ...fournisseurs.map((f) => ({
            value: f.id,
            label: nomFournisseur(f),
            meta: f.divers ? t("Achats ponctuels, sans fournisseur précis") : f.matriculeFiscal ?? undefined,
            keywords: `${f.ref} ${f.matriculeFiscal ?? ""} ${f.ville ?? ""}`,
          })),
        ]}
      />
      <PickerSheet
        isOpen={pickerArticle}
        title={t("Article")}
        onDismiss={() => setPickerArticle(false)}
        onSelect={(v) => {
          const a = articleParId.get(v);
          if (a) ajouterArticle(a);
          setPickerArticle(false);
        }}
        onScan={(code) => articles.find((a) => a.codeBarre === code || a.code === code || a.codesBarres?.some((c) => c.codeBarre === code))?.id}
        options={articles.map((a) => ({
          value: a.id,
          label: a.designation,
          meta: [a.code, a.codeBarre].filter(Boolean).join(" · ") || undefined,
          keywords: `${a.code ?? ""} ${a.codeBarre ?? ""}`,
        }))}
      />
      <ImportCollecteSheet isOpen={importPda} onDismiss={() => setImportPda(false)} destination={t(DESTINATIONS[type])} onImporter={importerCollecte} />
      <FournisseurFormSheet
        isOpen={nouveauFournisseur}
        onDismiss={() => setNouveauFournisseur(false)}
        onEnregistre={(f) => {
          setFournisseurs((l) => [...l, f]);
          setFournisseurId(f.id);
        }}
      />
    </>
  );
}
