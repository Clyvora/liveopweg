import { trainBadgeShapes } from "./radar-marker-layers";
import { regionalTrainBrand, trainLiveries } from "./train-livery";

export function RegionalTrainIcon({ operator }: { operator: string | null }) {
  const brand = regionalTrainBrand(operator);
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
