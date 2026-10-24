import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { IonIcon } from "@ionic/react";
import {
  alarmOutline,
  arrowForwardOutline,
  cartOutline,
  chevronBackOutline,
  chevronForwardOutline,
  cubeOutline,
  walletOutline,
  hourglassOutline,
  pricetagOutline,
  storefrontOutline,
  warningOutline,
} from "ionicons/icons";
import { apiRequest } from "../api/client";
import { Field, IconButton, Money, Tag } from "../ui";
import FlecheVariation from "./FlecheVariation";
import StatutPaiementTag from "./achats/StatutPaiementTag";
import type { StatutPaiement } from "../types/achat";
import type { ModePaiement } from "../types/facture";
import { modePaiementLabel } from "../utils/labels";
import { formatAmount, formatDate, formatLongDate, parseLocalDate, toLocalDateString } from "../utils/format";
import { t, tn } from "../i18n";

interface Activite {
  achats: { id: string; type: "BL" | "FACTURE" | "ENTREE"; numero: string; tiers: string; net: number; paye: number; reste: number; statut: StatutPaiement }[];
  impayes: Activite["achats"];
  articles: { id: string; designation: string; code?: string | null; codeBarre?: string | null; prixAchat: number; prixVente: number }[];
  prix: { id: string; articleId: string; designation: string; ancienAchat: number; nouveauAchat: number; ancienVente: number; nouveauVente: number }[];
  reglements: { id: string; fournisseur: string; document: string; mode: ModePaiement; reference?: string | null; montant: number }[];
  traites: { id: string; fournisseur: string; document: string | null; reference?: string | null; montant: number; echeance: string; jours: number }[];
  depenses: { id: string; description: string; categorie: string; beneficiaire?: string | null; camion?: string | null; mode: ModePaiement; reference?: string | null; montant: number }[];
  expirations: { id: string; articleId: string; designation: string; codeBarre?: string | null; quantite: number; dateExpiration: string; jours: number }[];
}

const NOM: Record<string, string> = { BL: "BL", FACTURE: "Facture", ENTREE: "B° Entrée" };
const decaler = (jour: string, n: number) => {
  const d = parseLocalDate(jour);
  d.setDate(d.getDate() + n);
  return toLocalDateString(d);
};

/** Carte d'une liste courte, avec son nombre d'éléments et un lien éventuel. */
function Bloc({ icone, titre, nb, lien, ton, children }: { icone: string; titre: string; nb: number; lien?: ReactNode; ton?: "alerte"; children: ReactNode }) {
  return (
    <section className={`rc-dash-card rc-activite__bloc${ton === "alerte" && nb > 0 ? " rc-activite__bloc--alerte" : ""}`} aria-label={titre}>
      <header className="rc-dash-card__tete">
        <h3 className="rc-dash-card__titre">
          <IonIcon icon={icone} aria-hidden="true" /> {titre} <span className="rc-activite__nb">{nb}</span>
        </h3>
        {lien}
      </header>
      {nb === 0 ? <p className="rc-footnote">{t("Rien.")}</p> : <ul className="rc-activite__liste">{children}</ul>}
    </section>
  );
}

/**
 * Tableau de bord › activité d'un jour (aujourd'hui par défaut) : achats saisis, documents restés impayés,
 * fournisseurs payés, nouveaux articles, changements de prix ; et, toujours, les traites qui arrivent à échéance
 * et les articles du dépôt qui expirent dans les deux semaines.
 */
export default function DashboardActivite() {
  const navigate = useNavigate();
  const aujourdhui = toLocalDateString(new Date());
  const [jour, setJour] = useState(aujourdhui);
  const [a, setA] = useState<Activite | null>(null);

  useEffect(() => {
    const debut = new Date(`${jour}T00:00:00`).toISOString();
    const fin = new Date(`${jour}T23:59:59.999`).toISOString();
    apiRequest<Activite>(`/tableau-de-bord/activite?debut=${encodeURIComponent(debut)}&fin=${encodeURIComponent(fin)}`)
      .then(setA)
      .catch(() => setA(null));
  }, [jour]);

  const lien = (texte: string, chemin: string) => (
    <button type="button" className="rc-dash-lien" onClick={() => navigate(chemin)}>
      {texte}
      <IonIcon icon={arrowForwardOutline} aria-hidden="true" />
    </button>
  );
  const quand = (jours: number, passe = false) =>
    jours < 0 ? (passe ? t("expiré") : t("dépassée")) : jours === 0 ? t("aujourd'hui") : jours === 1 ? t("demain") : t("dans {n} j", { n: jours });

  return (
    <>
      <div className="rc-activite__entete">
        <h2 className="rc-activite__titre">
          {jour === aujourdhui ? t("Activité d'aujourd'hui") : t("Activité du {d}", { d: formatDate(parseLocalDate(jour)) })}
          <small className="rc-cap">{formatLongDate(parseLocalDate(jour))}</small>
        </h2>
        <div className="rc-daystep">
          <IconButton icon={chevronBackOutline} className="rc-flip" label={t("Jour précédent")} variant="filled" onClick={() => setJour((j) => decaler(j, -1))} />
          <Field label={t("Jour")} hideLabel type="date" value={jour} max={aujourdhui} onChange={(v) => setJour(v || aujourdhui)} />
          <IconButton icon={chevronForwardOutline} className="rc-flip" label={t("Jour suivant")} variant="filled" disabled={jour >= aujourdhui} onClick={() => setJour((j) => decaler(j, 1))} />
        </div>
      </div>

      {a && (
        <>
          <Bloc icone={cartOutline} titre={t("Achats saisis")} nb={a.achats.length} lien={lien(t("Achats"), "/achats/bl")}>
            {a.achats.map((d) => (
              <li key={d.id}>
                <span>
                  <strong>{`${t(NOM[d.type])} n° ${d.numero}`}</strong>
                  <small>{d.tiers}</small>
                </span>
                <span className="rc-activite__droite">
                  <Money value={d.net} size="sm" />
                  <StatutPaiementTag statut={d.statut} />
                </span>
              </li>
            ))}
          </Bloc>

          <Bloc icone={warningOutline} titre={t("Restés impayés")} nb={a.impayes.length} lien={lien(t("Règlements"), "/fournisseurs/reglements")} ton="alerte">
            {a.impayes.map((d) => (
              <li key={d.id}>
                <span>
                  <strong>{`${t(NOM[d.type])} n° ${d.numero}`}</strong>
                  <small>{d.tiers}</small>
                </span>
                <span className="rc-activite__droite">
                  <Money value={d.reste} size="sm" tone="warning" />
                </span>
              </li>
            ))}
          </Bloc>

          <Bloc icone={storefrontOutline} titre={t("Fournisseurs payés")} nb={a.reglements.length} lien={lien(t("Règlements"), "/fournisseurs/reglements")}>
            {a.reglements.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{r.fournisseur}</strong>
                  <small>
                    {r.document} · {modePaiementLabel[r.mode]}
                    {r.reference ? ` ${r.reference}` : ""}
                  </small>
                </span>
                <span className="rc-activite__droite">
                  <Money value={r.montant} size="sm" />
                </span>
              </li>
            ))}
          </Bloc>

          <Bloc
            icone={walletOutline}
            titre={t("Dépenses")}
            nb={a.depenses.length}
            lien={lien(a.depenses.length > 0 ? t("Total {m} TND", { m: formatAmount(a.depenses.reduce((s, d) => s + d.montant, 0)) }) : t("Dépenses"), "/depenses")}
          >
            {a.depenses.map((d) => (
              <li key={d.id}>
                <span>
                  <strong>{d.description}</strong>
                  <small>{[d.categorie, d.beneficiaire, d.camion, `${modePaiementLabel[d.mode]}${d.reference ? ` ${d.reference}` : ""}`].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="rc-activite__droite">
                  <Money value={d.montant} size="sm" />
                </span>
              </li>
            ))}
          </Bloc>

          <Bloc icone={cubeOutline} titre={t("Nouveaux articles")} nb={a.articles.length} lien={lien(t("Articles"), "/stock?lieu=articles")}>
            {a.articles.map((x) => (
              <li key={x.id} className="rc-activite__cliquable" onClick={() => navigate(`/articles/${x.id}`)}>
                <span>
                  <strong>{x.designation}</strong>
                  <small>{[x.code, x.codeBarre].filter(Boolean).join(" · ") || "—"}</small>
                </span>
                <span className="rc-activite__droite">
                  <small>
                    {t("Achat")} {formatAmount(x.prixAchat)} · {t("Vente")} {formatAmount(x.prixVente)}
                  </small>
                </span>
              </li>
            ))}
          </Bloc>

          <Bloc icone={pricetagOutline} titre={t("Changements de prix")} nb={a.prix.length}>
            {a.prix.map((p) => {
              const sensAchat = p.nouveauAchat > p.ancienAchat ? "hausse" : "baisse";
              return (
                <li key={p.id} className="rc-activite__cliquable" onClick={() => navigate(`/articles/${p.articleId}`)}>
                  <span>
                    <strong>{p.designation}</strong>
                    <small>
                      {Math.abs(p.nouveauVente - p.ancienVente) >= 0.0005
                        ? `${t("Vente")} ${formatAmount(p.ancienVente)} → ${formatAmount(p.nouveauVente)}`
                        : `${t("Vente")} ${formatAmount(p.nouveauVente)} (${t("inchangée")})`}
                    </small>
                  </span>
                  <span className={`rc-activite__droite rc-activite__prix--${Math.abs(p.nouveauAchat - p.ancienAchat) < 0.0005 ? "egal" : sensAchat}`}>
                    {Math.abs(p.nouveauAchat - p.ancienAchat) >= 0.0005 && <FlecheVariation sens={sensAchat} label={sensAchat === "hausse" ? t("Prix d'achat en hausse") : t("Prix d'achat en baisse")} />}
                    <small>
                      {t("Achat")} <s>{formatAmount(p.ancienAchat)}</s> → <strong>{formatAmount(p.nouveauAchat)}</strong>
                    </small>
                  </span>
                </li>
              );
            })}
          </Bloc>

          <Bloc icone={alarmOutline} titre={t("Traites à échéance (10 jours)")} nb={a.traites.length} lien={lien(t("Règlements"), "/fournisseurs/reglements")} ton="alerte">
            {a.traites.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{r.fournisseur}</strong>
                  <small>
                    {t("Traite")} {r.reference ?? ""} {r.document ? `· ${r.document}` : ""}
                  </small>
                </span>
                <span className="rc-activite__droite">
                  <Money value={r.montant} size="sm" />
                  <Tag tone={r.jours <= 2 ? "danger" : "warning"} dot>
                    {formatDate(r.echeance)} · {quand(r.jours)}
                  </Tag>
                </span>
              </li>
            ))}
          </Bloc>

          <Bloc icone={hourglassOutline} titre={t("Expirent dans 2 semaines")} nb={a.expirations.length} lien={lien(t("Dates d'expiration"), "/stock/peremptions")} ton="alerte">
            {a.expirations.map((l) => (
              <li key={l.id}>
                <span>
                  <strong>{l.designation}</strong>
                  <small>{tn(l.quantite, "{n} pièce", "{n} pièces")}</small>
                </span>
                <span className="rc-activite__droite">
                  <Tag tone={l.jours < 0 ? "danger" : l.jours <= 7 ? "danger" : "warning"} dot>
                    {formatDate(l.dateExpiration)} · {quand(l.jours, true)}
                  </Tag>
                </span>
              </li>
            ))}
          </Bloc>
        </>
      )}
    </>
  );
}
