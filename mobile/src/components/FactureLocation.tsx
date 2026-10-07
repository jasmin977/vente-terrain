import { mapOutline } from "ionicons/icons";
import { IonIcon } from "@ionic/react";
import { Group, Notice, Row, Section } from "../ui";
import { t } from "../i18n";

interface Point {
  latitude?: number | null;
  longitude?: number | null;
}

const aUnePosition = (p?: Point | null): p is { latitude: number; longitude: number } =>
  p?.latitude != null && p?.longitude != null;

/** Distance à vol d'oiseau en mètres (formule de haversine). */
function distanceMetres(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(m: number) {
  return m < 1000 ? t("{n} m", { n: Math.round(m) }) : t("{n} km", { n: (m / 1000).toFixed(1) });
}

/**
 * Position GPS enregistrée au moment de la facture (admin) : carte, coordonnées,
 * distance par rapport à l'adresse du client et ouverture dans Google Maps.
 */
export default function FactureLocation({ facture, client }: { facture: Point; client?: Point | null }) {
  if (!aUnePosition(facture)) {
    return (
      <Section label={t("Position")}>
        <Notice tone="info">{t("Aucune position enregistrée pour cette facture (GPS désactivé ou refusé).")}</Notice>
      </Section>
    );
  }

  const { latitude: lat, longitude: lon } = facture;
  const d = 0.004; // ~400 m autour du point
  const carte = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&layer=mapnik&marker=${lat},${lon}`;
  const maps = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  const distance = aUnePosition(client) ? distanceMetres(facture, client) : null;

  return (
    <Section label={t("Position")}>
      <div className="rc-map">
        <iframe title={t("Carte de la position de la facture")} src={carte} loading="lazy" referrerPolicy="no-referrer" />
      </div>
      <Group>
        <Row
          compact
          label={t("Coordonnées")}
          trailing={<span className="rc-row__value rc-num" dir="ltr">{`${lat.toFixed(5)}, ${lon.toFixed(5)}`}</span>}
        />
        {distance !== null && (
          <Row
            compact
            label={t("Distance du client")}
            trailing={<span className="rc-row__value rc-num">{formatDistance(distance)}</span>}
          />
        )}
      </Group>
      <a className="rc-btn rc-btn--secondary rc-btn--block rc-map__open" href={maps} target="_blank" rel="noopener noreferrer">
        <IonIcon icon={mapOutline} aria-hidden="true" />
        <span className="rc-btn__label">{t("Ouvrir dans Google Maps")}</span>
      </a>
    </Section>
  );
}
