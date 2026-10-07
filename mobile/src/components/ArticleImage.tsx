import { useState } from "react";
import { IonIcon } from "@ionic/react";
import { cubeOutline } from "ionicons/icons";

interface ArticleImageProps {
  src?: string | null;
  alt: string;
  size?: number;
}

export default function ArticleImage({ src, alt, size = 48 }: ArticleImageProps) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  if (!src || failed) {
    return (
      <span className="rc-thumb" style={style} role="img" aria-label={alt}>
        <IonIcon icon={cubeOutline} style={{ fontSize: size * 0.45 }} aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      className="rc-thumb"
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
