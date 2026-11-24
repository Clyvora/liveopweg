"use client";
import { useState } from "react";
import { useLanguage } from "./LanguageContext";
import { AppIcon } from "./Icons";
import { genericTrainImage, trainArtwork } from "./train-artwork";

export function TrainImage({ model, operator }: { model: string | null; operator?: string | null }) {
  const [failed, setFailed] = useState<string[]>([]);
  const { language } = useLanguage();
  const en = language === "en";
  const art = trainArtwork(model, operator);
  const src = failed.includes(art.src) ? genericTrainImage : art.src;
  const genericLabel = en ? "Generic train illustration" : "Algemene treinafbeelding";
  const label = src === genericTrainImage ? genericLabel : art.kind === "representative"
    ? (en ? `Representative ${operator} train illustration` : `Voorbeeldillustratie trein van ${operator}`)
    : (en ? `Illustration of ${model}` : `Illustratie van ${model}`);
  if (failed.includes(src)) return <div className="tpImageFallback" role="img" aria-label={genericLabel}><AppIcon name="train" /></div>;
  // eslint-disable-next-line @next/next/no-img-element -- Local assets retain their natural aspect ratio.
  return <img key={src} src={src} alt={label} className={src === genericTrainImage ? "trainArtGeneric" : undefined} width={1000} height={333} onError={() => setFailed(current => [...current, src])} />;
}
