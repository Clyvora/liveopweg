import { AppIcon } from "./Icons";

export function TrainPanelHeader({ title, subtitle, closeLabel, onClose }: { title: string; subtitle?: string | null; closeLabel: string; onClose: () => void }) {
  return <header className="tpHeader">
    <h2>{title}</h2>{subtitle && <span>{subtitle}</span>}
    <button className="tpCloseButton" type="button" onClick={onClose} aria-label={closeLabel}><AppIcon name="close" /></button>
  </header>;
}
