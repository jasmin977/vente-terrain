import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Facture } from "../types/facture";
import { formatAmount, formatTime } from "../utils/format";
import { Section } from "../ui";
import { t, tn } from "../i18n";

// Une couleur par vendeur quand l'admin affiche tous les vendeurs.
const COULEURS = ["#2563eb", "#d97706", "#059669", "#db2777", "#7c3aed", "#0891b2"];

type FactureLocalisee = Facture & { latitude: number; longitude: number };

const localisee = (f: Facture): f is FactureLocalisee =>
  typeof f.latitude === "number" && typeof f.longitude === "number";

const echapper = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

interface Props {
  factures: Facture[];
  /** Nom des vendeurs, pour la légende quand plusieurs camions sont affichés. */
  vendeurs: { id: string; nom: string }[];
}

/**
 * Parcours de la journée : les ventes localisées, numérotées dans l'ordre
 * chronologique et reliées par vendeur (une ligne par tournée).
 */
export default function FacturesTrajet({ factures, vendeurs }: Props) {
  const conteneur = useRef<HTMLDivElement>(null);

  // Tournées : factures valides et localisées de chaque vendeur, de la plus ancienne à la plus récente.
  const tournees = useMemo(() => {
    const parVendeur = new Map<string, FactureLocalisee[]>();
    for (const f of factures) {
      if (f.statut === "ANNULEE" || !localisee(f)) continue;
      parVendeur.set(f.vendeurId, [...(parVendeur.get(f.vendeurId) ?? []), f]);
    }
    return [...parVendeur.entries()].map(([vendeurId, liste], i) => ({
      vendeurId,
      nom: vendeurs.find((v) => v.id === vendeurId)?.nom ?? vendeurId,
      couleur: COULEURS[i % COULEURS.length],
      factures: liste.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    }));
  }, [factures, vendeurs]);

  const nbLocalisees = tournees.reduce((s, tr) => s + tr.factures.length, 0);
  const nbSansPosition = factures.filter((f) => f.statut !== "ANNULEE" && !localisee(f)).length;

  useEffect(() => {
    const el = conteneur.current;
    if (!el || nbLocalisees === 0) return;

    const carte = L.map(el, { zoomControl: true, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(carte);

    const points: L.LatLngExpression[] = [];
    for (const tr of tournees) {
      const ligne = tr.factures.map((f) => [f.latitude, f.longitude] as L.LatLngTuple);
      if (ligne.length > 1) L.polyline(ligne, { color: tr.couleur, weight: 4, opacity: 0.8 }).addTo(carte);
      tr.factures.forEach((f, i) => {
        const icone = L.divIcon({
          className: "rc-trajet__marker",
          html: `<span style="background:${tr.couleur}">${i + 1}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker([f.latitude, f.longitude], { icon: icone })
          .bindPopup(
            `<strong>${i + 1}. ${echapper(f.client?.nomCommerce ?? "")}</strong><br>${formatTime(f.date)} · ${formatAmount(f.montantTTC)} ${t("TND")}`
          )
          .addTo(carte);
        points.push([f.latitude, f.longitude]);
      });
    }
    carte.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 16 });

    // La page Ionic peut être mesurée avant d'être visible : on recale la carte à chaque redimensionnement.
    const observateur = new ResizeObserver(() => carte.invalidateSize());
    observateur.observe(el);
    return () => {
      observateur.disconnect();
      carte.remove();
    };
  }, [tournees, nbLocalisees]);

  if (nbLocalisees === 0 && nbSansPosition === 0) return null;

  return (
    <Section label={t("Parcours de la journée")} aside={tn(nbLocalisees, "{n} vente localisée", "{n} ventes localisées")}>
      {nbLocalisees > 0 ? (
        <>
          <div ref={conteneur} className="rc-map rc-trajet" role="img" aria-label={t("Carte du parcours de la journée")} />
          {tournees.length > 1 && (
            <ul className="rc-trajet__legende">
              {tournees.map((tr) => (
                <li key={tr.vendeurId}>
                  <span className="rc-trajet__pastille" style={{ background: tr.couleur }} aria-hidden="true" />
                  {tr.nom} · {tn(tr.factures.length, "{n} vente", "{n} ventes")}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      {nbSansPosition > 0 && (
        <p className="rc-footnote rc-trajet__note">
          {tn(nbSansPosition, "{n} bon de livraison sans position (GPS désactivé ou refusé).", "{n} bons de livraison sans position (GPS désactivé ou refusé).")}
        </p>
      )}
    </Section>
  );
}
