"use client";
import { useState } from "react";
import { useLanguage } from "./LanguageContext";
import { AppIcon } from "./Icons";
import { trainPhotos, trainPhotoStart } from "./train-artwork";

export function TrainImage({ model, operator, material, trainNumber }: { model: string | null; operator?: string | null; material?: string | null; trainNumber?: string | null }) {
  const photos = trainPhotos(model, operator, material);
  return <TrainPhotoGallery key={`${photos[0]?.src ?? ""}:${trainNumber ?? ""}`} model={model} photos={photos} trainNumber={trainNumber} />;
}

function TrainPhotoGallery({ model, photos, trainNumber }: {
  model: string | null;
  photos: ReturnType<typeof trainPhotos>;
  trainNumber?: string | null;
}) {
  const [index, setIndex] = useState(() => trainPhotoStart(trainNumber, photos.length));
  const [failed, setFailed] = useState<string[]>([]);
  const { language } = useLanguage();
  const en = language === "en";
  const available = photos.filter(({ src }) => !failed.includes(src));
  const current = available.length ? index % available.length : 0;
  const art = available[current];
  if (!art) return <p className="tpImageFallback"><AppIcon name="train" />{photos.length
    ? (en ? "Train photos could not be loaded" : "Treinfoto’s konden niet worden geladen")
    : (en ? "No verified photo for this train" : "Geen geverifieerde foto voor deze trein")}</p>;
  const label = en ? `Example photo of ${model}` : `Voorbeeldfoto van ${model}`;
  return <figure className="trainPhoto">
    <div className="trainPhotoFrame">
      {/* eslint-disable-next-line @next/next/no-img-element -- The bundled WebP is already sized for a panel. */}
      <img key={art.src} src={art.src} alt={label} decoding="async" onError={() => setFailed((previous) => [...previous, art.src])} />
      {available.length > 1 && <div className="trainPhotoNav">
        <button type="button" aria-label={en ? "Previous photo" : "Vorige foto"} title={en ? "Previous photo" : "Vorige foto"}
          onClick={() => setIndex((current - 1 + available.length) % available.length)}><span aria-hidden="true">‹</span></button>
        <span aria-live="polite">{current + 1} / {available.length}</span>
        <button type="button" aria-label={en ? "Next photo" : "Volgende foto"} title={en ? "Next photo" : "Volgende foto"}
          onClick={() => setIndex((current + 1) % available.length)}><span aria-hidden="true">›</span></button>
      </div>}
    </div>
    <figcaption>
      <span>{en ? "Type photo" : "Typefoto"}</span>
      <a href={art.origin} target="_blank" rel="noreferrer">{art.author}</a>
      <a href={art.licenseUrl} target="_blank" rel="noreferrer">{art.license}</a>
      <span>{en ? "Resized" : "Verkleind"}</span>
    </figcaption>
  </figure>;
}
