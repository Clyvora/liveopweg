import { SettingsScreen } from "./settings-screen";

import { pageMetadata } from "../site";

export const metadata = { ...pageMetadata("Instellingen", "Pas de weergave en meldingen van Liveopweg aan.", "/instellingen"), robots: { index: false, follow: true } };

export default function InstellingenPage() {
  return <SettingsScreen />;
}
