import { useEffect, useRef, useState } from "react";
import { IonContent, IonModal } from "@ionic/react";
import { closeOutline } from "ionicons/icons";
import { effacerImageLue, lireTexteImage } from "../lib/lireDate";
import { dateExpirationDuTexte } from "../utils/dateExpiration";
import { dateFr } from "../utils/peremption";
import { IconButton } from "../ui";
import { t } from "../i18n";

const INTERVALLE_MS = 600;
// Une date doit être lue deux fois de suite pour être retenue (évite une lecture fautive isolée).
const LECTURES_CONFIRMEES = 2;

/**
 * Viseur en direct : la caméra reste ouverte, l'image est lue en continu et la date
 * d'expiration se remplit dès qu'elle est lue de façon stable. Aucune photo à prendre.
 */
export default function ViseurDate({
  isOpen,
  onDate,
  onDismiss,
}: {
  isOpen: boolean;
  onDate: (date: string) => void;
  onDismiss: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lue, setLue] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let actif = true;
    let flux: MediaStream | null = null;
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    let precedente: string | null = null;
    let identiques = 0;
    setMessage(null);
    setLue(null);

    const lireImage = async () => {
      const video = videoRef.current;
      if (!actif || !video || video.videoWidth === 0) return;
      // Bande centrale de l'image (là où l'on pointe la date), réduite pour une lecture rapide.
      const sw = video.videoWidth;
      const sh = video.videoHeight;
      const largeur = Math.min(sw, 1280);
      const cadre = { x: 0, y: sh * 0.3, w: sw, h: sh * 0.4 };
      const canvas = document.createElement("canvas");
      canvas.width = largeur;
      canvas.height = Math.round((largeur * cadre.h) / cadre.w);
      canvas.getContext("2d")?.drawImage(video, cadre.x, cadre.y, cadre.w, cadre.h, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1] ?? "";
      const date = dateExpirationDuTexte(await lireTexteImage(base64));
      if (!actif) return;
      if (date && date === precedente) identiques++;
      else identiques = date ? 1 : 0;
      precedente = date;
      setLue(date);
      if (date && identiques >= LECTURES_CONFIRMEES) {
        actif = false;
        onDate(date);
      }
    };

    const boucle = async () => {
      try {
        await lireImage();
      } catch {
        if (actif) setMessage(t("Échec de la lecture de la date"));
      }
      if (actif) minuteur = setTimeout(boucle, INTERVALLE_MS);
    };

    (async () => {
      try {
        flux = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
        if (!actif) return flux.getTracks().forEach((p) => p.stop());
        const video = videoRef.current;
        if (video) {
          video.srcObject = flux;
          await video.play();
        }
        boucle();
      } catch {
        if (actif) setMessage(t("Autorisation caméra refusée"));
      }
    })();

    return () => {
      actif = false;
      if (minuteur) clearTimeout(minuteur);
      flux?.getTracks().forEach((p) => p.stop());
      void effacerImageLue();
    };
  }, [isOpen, onDate]);

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDismiss} className="rc-viseur">
      <IonContent scrollY={false}>
        <div className="rc-viseur__scene">
          <video ref={videoRef} className="rc-viseur__video" playsInline muted autoPlay />
          <div className="rc-viseur__cadre" aria-hidden="true" />
          <div className="rc-viseur__haut">
            <IconButton icon={closeOutline} label={t("Fermer")} variant="filled" onClick={onDismiss} />
          </div>
          <p className="rc-viseur__aide" role="status" aria-live="polite">
            {message ?? (lue ? t("Date lue : {d}", { d: dateFr(lue) }) : t("Pointez la date d'expiration dans le cadre"))}
          </p>
        </div>
      </IonContent>
    </IonModal>
  );
}
