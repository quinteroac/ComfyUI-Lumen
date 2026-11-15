import type { JobImage } from '../comfy/types';
import { isVideoFile } from '../comfy/client';

/** Shows an image, or a video: mp4/webm in a looping muted player, animated webp/gif/svg as an image. */
export function Media({ img, alt, controls = false, lazy = true }: { img: JobImage; alt: string; controls?: boolean; lazy?: boolean }) {
  const file = img.ref?.filename ?? '';
  if (img.kind === 'video' && isVideoFile(file)) {
    return <video src={img.url} autoPlay muted loop playsInline controls={controls} aria-label={alt} width={img.w} height={img.h} />;
  }
  return <img src={img.url} alt={alt} loading={lazy ? 'lazy' : undefined} width={img.w} height={img.h} />;
}

export function VideoBadge() {
  return (
    <span className="video-badge" aria-label="Vídeo">
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
      </svg>
      Vídeo
    </span>
  );
}
