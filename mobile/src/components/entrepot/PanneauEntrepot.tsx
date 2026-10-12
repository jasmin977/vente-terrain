import { useEffect, useMemo, useState } from "react";
import { IonAlert } from "@ionic/react";
import { addOutline, closeOutline, cubeOutline, flashOutline, hammerOutline, resizeOutline, trashOutline } from "ionicons/icons";
import { creerRack, modifierRack, ranger, supprimerRack } from "../../api/entrepot";
import { getStockCamion } from "../../api/stock";
import { ApiError } from "../../api/client";
import type { Emplacement, EntrepotData, Rack, SelectionEntrepot } from "../../types/entrepot";
import type { StockCamionItem } from "../../types/stock";
import type { StatutStock } from "../../utils/statutEntrepot";
import { formatAmount, formatDate, joinMeta, pieces } from "../../utils/format";
import { compterCases, couleurCss, libelleStatut, ORDRE_STATUTS, pointsAttention, toneStatut } from "../../utils/statutEntrepot";
import ArticleImage from "../ArticleImage";
import RangerArticleSheet from "./RangerArticleSheet";
import { Button, Field, Group, IconButton, Notice, Row, Segmented, Tag } from "../../ui";
import { t, tn } from "../../i18n";

interface Props {
  data: EntrepotData;
  selection: SelectionEntrepot | null;
  onSelect: (s: SelectionEntrepot | null) => void;
  /** Recharge le plan après une modification. */
  onChange: () => Promise<void>;
  onFocus: (s: SelectionEntrepot) => void;
  onGenerer: () => void;
  onBatiment: () => void;
  onRangerAuto: () => void;
  onOuvrirCamion: (vendeurId: string) => void;
  /** Étagère créée : on la sélectionne. */
  onCree: (rackId: string) => void;
  /** Statut mis en couleur (les autres passent en gris), null : tous. */
  filtre: StatutStock | null;
  onFiltre: (s: StatutStock | null) => void;
  /** Ouvre une case et amène la caméra dessus. */
  onVoirCase: (s: SelectionEntrepot) => void;
}

/** Ligne d'un produit rangé : prix, stock, statut (couleur du plan) et dernier réapprovisionnement. */
function LigneProduit({ e, onClick }: { e: Emplacement; onClick?: () => void }) {
  const a = e.article;
  const etiquette = a.statut === "NOUVEAU" ? (a.etiquette === "PROMOTION" ? t("Promotion") : t("Nouveau")) : libelleStatut(a.statut);
  return (
    <Row
      thumb
      leading={<ArticleImage src={a.img} alt="" size={44} />}
      title={a.designation}
      meta={
        <>
          <Tag tone={toneStatut(a.statut)} dot>
            {etiquette}
          </Tag>{" "}
          {joinMeta([
            t("{p} TND TTC", { p: formatAmount(a.prixTTC) }),
            t("Stock {n}", { n: a.stock }),
            a.derniereEntree ? t("Réappro. {d}", { d: formatDate(a.derniereEntree) }) : t("Jamais réapprovisionné"),
          ])}
        </>
      }
      trailing={
        <span className="rc-qty">
          <span className="rc-qty__n">{e.quantite}</span> {pieces(e.quantite)}
        </span>
      }
      onClick={onClick}
      chevron={Boolean(onClick)}
    />
  );
}

const nombre = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(",", ".")));

/** Panneau de détail du plan 3D : résumé, case, étagère (avec édition) ou camion selon la sélection. */
export default function PanneauEntrepot(p: Props) {
  const { data, selection } = p;
  const rack = selection && selection.type !== "camion" ? data.racks.find((r) => r.id === selection.rackId) : undefined;

  return (
    <div className="rc-entrepot__contenu">
      {selection?.type === "camion" ? (
        <VueCamion data={data} vendeurId={selection.vendeurId} onFermer={() => p.onSelect(null)} onOuvrir={p.onOuvrirCamion} />
      ) : selection?.type === "case" && rack ? (
        <VueCase {...p} rack={rack} niveau={selection.niveau} travee={selection.travee} />
      ) : selection?.type === "rack" && rack ? (
        <VueRack {...p} rack={rack} />
      ) : (
        <VueResume {...p} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Résumé */

function VueResume({ data, filtre, onFiltre, onGenerer, onBatiment, onRangerAuto, onChange, onCree, onVoirCase }: Props) {
  const { resume, racks } = data;
  const comptes = useMemo(() => compterCases(data), [data]);
  const attention = useMemo(() => pointsAttention(data), [data]);
  const [erreur, setErreur] = useState<string | null>(null);
  const rangees = racks.reduce((s, r) => s + new Set(r.emplacements.map((e) => e.article.id)).size, 0);

  const ajouter = async () => {
    setErreur(null);
    try {
      const derniere = racks[racks.length - 1];
      const { id } = await creerRack({
        nom: `R${racks.length + 1}`,
        allee: derniere?.allee ?? "A",
        x: 0,
        z: 0,
        rotation: 0,
        niveaux: derniere?.niveaux ?? 4,
        travees: derniere?.travees ?? 5,
      });
      await onChange();
      onCree(id);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Opération impossible"));
    }
  };

  return (
    <>
      <h2 className="rc-entrepot__titre">{t("Dépôt")}</h2>
      <h3 className="rc-entrepot__sous-titre">{t("Stock en direct")}</h3>
      <Group>
        {ORDRE_STATUTS.map((s) => (
          <Row
            key={s}
            compact
            className={filtre === s ? "rc-row--choisie" : undefined}
            onClick={() => onFiltre(filtre === s ? null : s)}
            title={
              <span className="rc-entrepot__statut">
                <span className="rc-entrepot__point" style={{ background: couleurCss(s) }} aria-hidden="true" />
                {libelleStatut(s)}
              </span>
            }
            trailing={<span className="rc-row__value rc-num">{tn(comptes[s], "{n} case", "{n} cases")}</span>}
          />
        ))}
      </Group>
      {attention.total > 0 && (
        <>
          <h3 className="rc-entrepot__sous-titre">{t("À traiter")}</h3>
          <Group>
            {attention.points.map((p) => (
              <Row
                key={`${p.rackId}:${p.niveau}:${p.travee}:${p.article.id}`}
                compact
                chevron
                title={p.article.designation}
                meta={t("{rack} · étage {n} · case {c}", { rack: p.rackNom, n: p.niveau + 1, c: p.travee + 1 })}
                trailing={
                  <Tag tone={toneStatut(p.article.statut)} dot>
                    {p.article.statut === "RUPTURE" ? t("Rupture") : t("{n} restants", { n: p.article.stock })}
                  </Tag>
                }
                onClick={() => onVoirCase({ type: "case", rackId: p.rackId, niveau: p.niveau, travee: p.travee })}
              />
            ))}
          </Group>
          {attention.total > attention.points.length && (
            <p className="rc-footnote">{t("{n} autres produits à surveiller.", { n: attention.total - attention.points.length })}</p>
          )}
        </>
      )}
      <h3 className="rc-entrepot__sous-titre">{t("Plan")}</h3>
      <Group>
        <Row compact label={t("Étagères")} trailing={<span className="rc-row__value rc-num">{racks.length}</span>} />
        <Row compact label={t("Camions")} trailing={<span className="rc-row__value rc-num">{data.camions.length}</span>} />
        <Row compact label={t("Articles en stock")} trailing={<span className="rc-row__value rc-num">{resume.stockArticles}</span>} />
        <Row compact label={t("Articles rangés sur le plan")} trailing={<span className="rc-row__value rc-num">{rangees}</span>} />
      </Group>
      {resume.nonRangeArticles > 0 && racks.length > 0 && (
        <Notice tone="warning" icon={cubeOutline} actionLabel={t("Ranger")} onAction={onRangerAuto}>
          {tn(resume.nonRangeArticles, "{n} article en stock n'a pas d'emplacement.", "{n} articles en stock n'ont pas d'emplacement.")}
        </Notice>
      )}
      {erreur && <Notice>{erreur}</Notice>}
      {racks.length === 0 ? (
        <Notice tone="info" icon={hammerOutline}>
          {t("Aucune étagère. Générez une disposition, puis ajustez-la.")}
        </Notice>
      ) : (
        <p className="rc-footnote">{t("Cliquez une case, une étagère ou un camion pour voir son contenu.")}</p>
      )}
      <div className="rc-entrepot__actions">
        <Button variant={racks.length === 0 ? "primary" : "secondary"} icon={flashOutline} onClick={onGenerer}>
          {racks.length === 0 ? t("Générer la disposition") : t("Refaire la disposition")}
        </Button>
        <Button variant="secondary" icon={addOutline} onClick={ajouter}>
          {t("Ajouter une étagère")}
        </Button>
        <Button variant="ghost" icon={resizeOutline} onClick={onBatiment}>
          {t("Dimensions du bâtiment")}
        </Button>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Case */

function VueCase({ data, rack, niveau, travee, onChange, onSelect, onFocus }: Props & { rack: Rack; niveau: number; travee: number }) {
  const contenu = useMemo(() => rack.emplacements.filter((e) => e.niveau === niveau && e.travee === travee), [rack, niveau, travee]);
  const [ajout, setAjout] = useState(false);
  const [retrait, setRetrait] = useState<Emplacement | null>(null);
  const [quantite, setQuantite] = useState<Emplacement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const executer = async (travail: () => Promise<unknown>) => {
    setErreur(null);
    try {
      await travail();
      await onChange();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Opération impossible"));
    }
  };

  return (
    <>
      <div className="rc-entrepot__entete">
        <div>
          <p className="rc-entrepot__sur">{t("Étagère {nom}", { nom: rack.nom })}</p>
          <h2 className="rc-entrepot__titre">{t("Étage {n} · case {c}", { n: niveau + 1, c: travee + 1 })}</h2>
        </div>
        <IconButton icon={closeOutline} label={t("Fermer")} size="sm" onClick={() => onSelect(null)} />
      </div>
      {contenu.length === 0 ? (
        <p className="rc-footnote">{t("Cette case est vide.")}</p>
      ) : (
        <Group>
          {contenu.map((e) => (
            <LigneProduit key={e.article.id} e={e} onClick={() => setQuantite(e)} />
          ))}
        </Group>
      )}
      {erreur && <Notice>{erreur}</Notice>}
      <div className="rc-entrepot__actions">
        <Button icon={addOutline} onClick={() => setAjout(true)}>
          {t("Ranger un article ici")}
        </Button>
        <Button variant="ghost" onClick={() => onFocus({ type: "case", rackId: rack.id, niveau, travee })}>
          {t("Centrer la vue")}
        </Button>
        <Button variant="ghost" onClick={() => onSelect({ type: "rack", rackId: rack.id })}>
          {t("Voir l'étagère")}
        </Button>
      </div>

      <RangerArticleSheet
        isOpen={ajout}
        data={data}
        onDismiss={() => setAjout(false)}
        onRanger={(articleId, q) => executer(() => ranger(rack.id, niveau, travee, articleId, q))}
      />

      <IonAlert
        isOpen={quantite !== null}
        onDidDismiss={() => setQuantite(null)}
        header={quantite?.article.designation}
        message={t("Quantité rangée dans cette case (en pièces).")}
        inputs={[{ name: "q", type: "number", min: 0, value: quantite?.quantite ?? 0 }]}
        buttons={[
          { text: t("Annuler"), role: "cancel" },
          { text: t("Retirer de la case"), role: "destructive", handler: () => { setRetrait(quantite); } },
          {
            text: t("Enregistrer"),
            handler: (d: { q?: string }) => {
              const q = nombre(String(d.q ?? ""));
              if (quantite && Number.isFinite(q) && q >= 0) void executer(() => ranger(rack.id, niveau, travee, quantite.article.id, q));
            },
          },
        ]}
      />
      <IonAlert
        isOpen={retrait !== null}
        onDidDismiss={() => setRetrait(null)}
        header={t("Retirer de la case ?")}
        message={retrait ? t("« {nom} » n'est plus rangé ici (le stock du dépôt ne change pas).", { nom: retrait.article.designation }) : undefined}
        buttons={[
          { text: t("Annuler"), role: "cancel" },
          { text: t("Retirer"), role: "destructive", handler: () => { if (retrait) void executer(() => ranger(rack.id, niveau, travee, retrait.article.id, 0)); } },
        ]}
      />
    </>
  );
}

/* ---------------------------------------------------------------- Étagère */

function VueRack({ rack, data, onChange, onSelect, onFocus }: Props & { rack: Rack }) {
  const [form, setForm] = useState({ nom: rack.nom, allee: rack.allee, x: String(rack.x), z: String(rack.z), niveaux: String(rack.niveaux), travees: String(rack.travees) });
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Une autre étagère (ou une mise à jour du plan) : le formulaire reprend ses valeurs.
  useEffect(() => {
    setForm({ nom: rack.nom, allee: rack.allee, x: String(rack.x), z: String(rack.z), niveaux: String(rack.niveaux), travees: String(rack.travees) });
  }, [rack.id, rack.nom, rack.allee, rack.x, rack.z, rack.niveaux, rack.travees]);

  const L = data.entrepot.largeur;
  const P = data.entrepot.profondeur;
  const maj = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const enregistrer = async (champs: Parameters<typeof modifierRack>[1]) => {
    setErreur(null);
    try {
      await modifierRack(rack.id, champs);
      await onChange();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Opération impossible"));
    }
  };
  const deplacer = (dx: number, dz: number) =>
    enregistrer({
      x: Math.max(-L / 2 + 1, Math.min(L / 2 - 1, Math.round((rack.x + dx) * 100) / 100)),
      z: Math.max(-P / 2 + 1, Math.min(P / 2 - 1, Math.round((rack.z + dz) * 100) / 100)),
    });

  const valide = form.nom.trim() !== "" && form.allee.trim() !== "" && [form.x, form.z, form.niveaux, form.travees].every((v) => Number.isFinite(nombre(v)));
  const modifie =
    form.nom !== rack.nom ||
    form.allee !== rack.allee ||
    nombre(form.x) !== rack.x ||
    nombre(form.z) !== rack.z ||
    nombre(form.niveaux) !== rack.niveaux ||
    nombre(form.travees) !== rack.travees;

  const articles = new Set(rack.emplacements.map((e) => e.article.id)).size;

  return (
    <>
      <div className="rc-entrepot__entete">
        <div>
          <p className="rc-entrepot__sur">{t("Allée {a}", { a: rack.allee })}</p>
          <h2 className="rc-entrepot__titre">{t("Étagère {nom}", { nom: rack.nom })}</h2>
        </div>
        <IconButton icon={closeOutline} label={t("Fermer")} size="sm" onClick={() => onSelect(null)} />
      </div>
      <p className="rc-footnote">
        {tn(rack.niveaux, "{n} étage", "{n} étages")} · {tn(rack.travees, "{n} case de large", "{n} cases de large")} · {tn(articles, "{n} article rangé", "{n} articles rangés")}
      </p>
      {rack.emplacements.length > 0 && (
        <>
          <h3 className="rc-entrepot__sous-titre">{t("Produits de l'étagère")}</h3>
          <Group>
            {[...rack.emplacements]
              .sort((a, b) => ORDRE_STATUTS.indexOf(a.article.statut) - ORDRE_STATUTS.indexOf(b.article.statut) || a.niveau - b.niveau || a.travee - b.travee)
              .map((e) => (
                <LigneProduit key={`${e.niveau}:${e.travee}:${e.article.id}`} e={e} onClick={() => onSelect({ type: "case", rackId: rack.id, niveau: e.niveau, travee: e.travee })} />
              ))}
          </Group>
        </>
      )}
      <h3 className="rc-entrepot__sous-titre">{t("Modifier l'étagère")}</h3>
      <div className="rc-entrepot__pave" role="group" aria-label={t("Déplacer l'étagère de 0,5 m")}>
        <span />
        <Button variant="secondary" aria-label={t("Vers le fond")} onClick={() => deplacer(0, -0.5)}>↑</Button>
        <span />
        <Button variant="secondary" aria-label={t("Vers la gauche")} onClick={() => deplacer(-0.5, 0)}>←</Button>
        <Button variant="secondary" aria-label={t("Vers la façade")} onClick={() => deplacer(0, 0.5)}>↓</Button>
        <Button variant="secondary" aria-label={t("Vers la droite")} onClick={() => deplacer(0.5, 0)}>→</Button>
      </div>
      <div className="rc-fields">
        <div className="rc-fields__row">
          <Field label={t("Nom")} value={form.nom} onChange={(v) => maj("nom", v)} maxLength={20} />
          <Field label={t("Allée")} value={form.allee} onChange={(v) => maj("allee", v)} maxLength={20} />
        </div>
        <div className="rc-fields__row">
          <Field label={t("Position X (m)")} type="number" inputMode="decimal" value={form.x} onChange={(v) => maj("x", v)} />
          <Field label={t("Position Z (m)")} type="number" inputMode="decimal" value={form.z} onChange={(v) => maj("z", v)} />
        </div>
        <div className="rc-fields__row">
          <Field label={t("Étages")} type="number" inputMode="numeric" value={form.niveaux} onChange={(v) => maj("niveaux", v)} />
          <Field label={t("Cases de large")} type="number" inputMode="numeric" value={form.travees} onChange={(v) => maj("travees", v)} />
        </div>
        <Segmented
          label={t("Sens de l'étagère")}
          value={String(rack.rotation) as "0" | "90"}
          onChange={(v) => void enregistrer({ rotation: v === "90" ? 90 : 0 })}
          options={[
            { value: "0", label: t("Dans la largeur") },
            { value: "90", label: t("Dans la profondeur") },
          ]}
        />
      </div>
      {erreur && <Notice>{erreur}</Notice>}
      <div className="rc-entrepot__actions">
        <Button
          disabled={!valide || !modifie}
          onClick={() =>
            void enregistrer({
              nom: form.nom.trim(),
              allee: form.allee.trim(),
              x: nombre(form.x),
              z: nombre(form.z),
              niveaux: Math.round(nombre(form.niveaux)),
              travees: Math.round(nombre(form.travees)),
            })
          }
        >
          {t("Enregistrer l'étagère")}
        </Button>
        <Button variant="ghost" onClick={() => onFocus({ type: "rack", rackId: rack.id })}>
          {t("Centrer la vue")}
        </Button>
        <Button variant="danger" icon={trashOutline} onClick={() => setConfirmer(true)}>
          {t("Supprimer l'étagère")}
        </Button>
      </div>
      <IonAlert
        isOpen={confirmer}
        onDidDismiss={() => setConfirmer(false)}
        header={t("Supprimer l'étagère {nom} ?", { nom: rack.nom })}
        message={t("Les emplacements qu'elle contient sont retirés du plan (le stock du dépôt ne change pas).")}
        buttons={[
          { text: t("Annuler"), role: "cancel" },
          {
            text: t("Supprimer"),
            role: "destructive",
            handler: () => {
              void supprimerRack(rack.id)
                .then(onChange)
                .then(() => onSelect(null))
                .catch((err) => setErreur(err instanceof ApiError ? err.message : t("Opération impossible")));
            },
          },
        ]}
      />
    </>
  );
}

/* ---------------------------------------------------------------- Camion */

function VueCamion({ data, vendeurId, onFermer, onOuvrir }: { data: EntrepotData; vendeurId: string; onFermer: () => void; onOuvrir: (id: string) => void }) {
  const camion = data.camions.find((c) => c.vendeurId === vendeurId);
  const [stock, setStock] = useState<StockCamionItem[] | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    setStock(null);
    setErreur(false);
    getStockCamion(vendeurId)
      .then((s) => setStock(s.filter((l) => Number(l.quantite) > 0)))
      .catch(() => setErreur(true));
  }, [vendeurId]);

  if (!camion) return null;
  return (
    <>
      <div className="rc-entrepot__entete">
        <div>
          <p className="rc-entrepot__sur">{t("Camion")}</p>
          <h2 className="rc-entrepot__titre">{camion.nom}</h2>
        </div>
        <IconButton icon={closeOutline} label={t("Fermer")} size="sm" onClick={onFermer} />
      </div>
      <p className="rc-footnote">
        {camion.code} · {tn(camion.nbArticles, "{n} article", "{n} articles")} · {camion.totalPieces} {pieces(camion.totalPieces)}
      </p>
      {erreur ? (
        <Notice>{t("Impossible de charger les données")}</Notice>
      ) : stock === null ? (
        <p className="rc-footnote">{t("Chargement…")}</p>
      ) : stock.length === 0 ? (
        <Tag tone="neutral">{t("Camion vide")}</Tag>
      ) : (
        <Group>
          {stock.slice(0, 40).map((l) => (
            <Row
              key={l.articleId}
              compact
              title={l.article.designation}
              trailing={<span className="rc-qty"><span className="rc-qty__n">{Number(l.quantite)}</span> {pieces(Number(l.quantite))}</span>}
            />
          ))}
        </Group>
      )}
      {stock && stock.length > 40 && <p className="rc-footnote">{t("{n} autres articles dans l'écran du camion.", { n: stock.length - 40 })}</p>}
      <div className="rc-entrepot__actions">
        <Button variant="secondary" onClick={() => onOuvrir(vendeurId)}>
          {t("Ouvrir le camion")}
        </Button>
      </div>
    </>
  );
}
