import { useState } from "react";
import { imageAffichee } from "../offline/images";
import { useEnLigne } from "../offline/sync";

interface ArticleImageProps {
  src?: string | null;
  alt: string;
  size?: number;
}

/**
 * Photo d'un article : le lien enregistré sur la fiche, affiché seulement en ligne.
 * Article sans photo, lien cassé ou téléphone hors ligne : rien n'est affiché — la
 * ligne reste compacte, sans image générique répétée sur tout un catalogue.
 */
export default function ArticleImage({ src, alt, size = 48 }: ArticleImageProps) {
  const enLigne = useEnLigne();
  const affichee = enLigne ? imageAffichee(src) : null;
  const [echec, setEchec] = useState<string | null>(null);
  if (!affichee || echec === affichee) return null;

  return (
    <img
      className="rc-thumb"
      src={affichee}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      style={{ width: size, height: size }}
      onError={() => setEchec(affichee)}
    />
  );
}
