import { MobilityDashboard } from "../MobilityDashboard";

export const metadata = {
  title: "Meldingen | LiveOpWeg",
  description: "Actuele wegmeldingen op een aparte kaart van Nederland.",
};

export default function MeldingenPage() {
  return <MobilityDashboard key="alerts" mode="alerts" />;
}
