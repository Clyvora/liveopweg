import { MobilityDashboard } from "../MobilityDashboard";

import { pageMetadata } from "../site";

export const metadata = pageMetadata("Actuele wegmeldingen in Nederland", "Bekijk files, incidenten, wegwerkzaamheden en afsluitingen op de wegenkaart van Nederland.", "/meldingen");

export default function MeldingenPage() {
  return <MobilityDashboard key="alerts" mode="alerts" />;
}
