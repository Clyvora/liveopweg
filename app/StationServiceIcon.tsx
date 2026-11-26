import { trainBadgeShapes } from "./radar-marker-layers";
import { keolisBlauwnetFront, serviceTrainFront, trainFrontUrl } from "./train-fronts";
import { regionalTrainBrand, trainLiveries } from "./train-livery";

export function StationServiceIcon({ operator, serviceType, rollingStock, materialNumber }: {
  operator: string | null;
  serviceType: string;
  rollingStock: string | null;
  materialNumber?: string | null;
}) {
  const model = rollingStock ?? (materialNumber ? null : serviceType);
  const front = trainFrontUrl(serviceTrainFront(operator, model, materialNumber)
    ?? (!rollingStock && operator ? keolisBlauwnetFront(operator) : null));
  // The marker portraits are pre-sized, sub-4 KB local WebP assets.
  // eslint-disable-next-line @next/next/no-img-element
  if (front) return <img className="stationOperatorIcon stationTrainFront" src={front} alt="" loading="lazy" decoding="async" />;

  let brand = regionalTrainBrand(operator);
  if (operator?.trim().toLowerCase() === "ns") {
    if (/^intercity\b/i.test(serviceType)) brand = "nsIntercity";
    if (/^sprinter\b/i.test(serviceType)) brand = "nsSprinter";
  }
  if (!brand) return null;
  const { body, detail } = trainLiveries[brand];
  const shape = trainBadgeShapes.slt;
  return <svg className="stationOperatorIcon" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="1" y="1" width="22" height="22" rx="6" fill={body} />
    <path d={shape.body} fill={detail} />
    <path d={shape.glass} fill={body} />
    <path d={shape.rails} fill="none" stroke={detail} strokeWidth="1.4" strokeLinecap="round" />
  </svg>;
}
