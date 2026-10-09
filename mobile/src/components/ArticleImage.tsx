import { useState } from "react";
import { imageAffichee, useImagesHorsLigne } from "../offline/images";

interface ArticleImageProps {
  src?: string | null;
  alt: string;
  size?: number;
}

// Article sans photo, ou photo introuvable (hors ligne et pas encore enregistrée).
const IMAGE_PAR_DEFAUT = "/articles/default.svg";

/**
 * Photo d'un article : copie enregistrée sur le téléphone si elle existe
 * (catalogue mis à jour le matin), sinon la photo du serveur.
 */
export default function ArticleImage({ src, alt, size = 48 }: ArticleImageProps) {
  useImagesHorsLigne();
  const affichee = imageAffichee(src);
  const [echec, setEchec] = useState<string | null>(null);
  const url = !affichee || echec === affichee ? IMAGE_PAR_DEFAUT : affichee;

  return (
    <img
      className="rc-thumb"
      src={url}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      style={{ width: size, height: size }}
      onError={() => affichee && setEchec(affichee)}
    />
  );
}
