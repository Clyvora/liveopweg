"use client";
import { useState } from "react";
import type { RollingStockFamily } from "../packages/domain-rail/rolling-stock";
import { useLanguage } from "./LanguageContext";
import { AppIcon } from "./Icons";

export function TrainImage({ family, label }: { family:RollingStockFamily; label:string }) {
  const [failed,setFailed] = useState(false);
  const { language } = useLanguage();
  if (failed || family==="unknown") return <div className="tpImageFallback" role="img" aria-label={label}><AppIcon name="train" /><span>{family==="unknown" ? (language==="en"?"No illustration for this train type":"Voor dit treintype is geen afbeelding beschikbaar") : (language==="en"?"Train image unavailable":"Treinafbeelding niet beschikbaar")}</span></div>;
  // eslint-disable-next-line @next/next/no-img-element -- Local assets retain their natural aspect ratio.
  return <img src={`/trains/side-${family}.png`} alt={label} width={1000} height={333} onError={()=>setFailed(true)} />;
}
