"use client";
import { useState } from "react";
import { useLanguage } from "./LanguageContext";
import { AppIcon } from "./Icons";
import { trainPhotos } from "./train-artwork";

export function TrainImage({ model, operator, material, trainNumber }: { model: string | null; operator?: string | null; material?: string | null; trainNumber?: string | null }) {
  const photos = trainPhotos(model, operator, material);
  return <RandomTrainPhoto key={`${photos[0]?.src ?? ""}:${trainNumber ?? ""}:${material ?? ""}`} model={model} photos={photos} />;
}

function RandomTrainPhoto({ model, photos }: {
  model: string | null;
  photos: ReturnType<typeof trainPhotos>;
}) {
  const [index] = useState(() => Math.floor(Math.random() * photos.length));
  const [failed, setFailed] = useState<string[]>([]);
  const { language } = useLanguage();
  const en = language === "en";
  const available = photos.filter(({ src }) => !failed.includes(src));
  const current = available.length ? index % available.length : 0;
  const art = available[current];
  if (!art) return <p className="tpImageFallback"><AppIcon name="train" />{photos.length
    ? (en ? "Train photos could not be loaded" : "Treinfoto’s konden niet worden geladen")
    : (en ? "No verified photo for this train" : "Geen geverifieerde foto voor deze trein")}</p>;
  const label = art.exactSet
    ? (en ? `Photo of trainset ${art.exactSet}` : `Foto van treinstel ${art.exactSet}`)
    : (en ? `Example photo of ${model}` : `Voorbeeldfoto van ${model}`);
  return <figure className="trainPhoto">
    {/* eslint-disable-next-line @next/next/no-img-element -- The bundled WebP is already sized for a panel. */}
    <img key={art.src} src={art.src} alt={label} decoding="async" onError={() => setFailed((previous) => [...previous, art.src])} />
    <figcaption>
      <span>{art.exactSet ? (en ? `Trainset ${art.exactSet}` : `Treinstel ${art.exactSet}`) : (en ? "Type photo" : "Typefoto")}</span>
      <a href={art.origin} target="_blank" rel="noreferrer">{art.author}</a>
      <a href={art.licenseUrl} target="_blank" rel="noreferrer">{art.license}</a>
      <span>{en ? "Resized" : "Verkleind"}</span>
    </figcaption>
  </figure>;
}
