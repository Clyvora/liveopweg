"use client";

import { useEffect, useId, useRef, useState } from "react";
import { bicycleAreas, intercityModels, nsBoardingSources } from "../packages/domain-rail/boarding-guide";
import { observationIsStale } from "../packages/domain-rail/position-quality";
import { identifyRollingStock, rollingStockLabel, trainSetDetails } from "../packages/domain-rail/rolling-stock";
import type { RailObservation } from "../packages/protocol/rail";
import { AppIcon } from "./Icons";
import { useLanguage } from "./LanguageContext";

function CarriageStrip({ cars }: { cars: number }) {
  return <span className="tpFormationCars" aria-hidden="true">
    {Array.from({ length: cars }, (_, index) => <span key={index} />)}
  </span>;
}

function BoardingGuide({ materialNumber, onClose }: { materialNumber: string; onClose: () => void }) {
  const { language } = useLanguage();
  const en = language === "en";
  const stock = trainSetDetails(materialNumber);
  const dimensions = stock?.dimensions;
  const modelName = rollingStockLabel(identifyRollingStock(materialNumber), language);
  const areas = stock ? bicycleAreas(stock.model, dimensions?.cars) : [];
  const hasQuietZone = stock && intercityModels.has(stock.model);
  const rNet = stock?.model === "flirt" && dimensions?.cars === 2;
  const bikeLocations = en
    ? ["", "Near the middle of the set.", "At both ends of the set.", "At both ends and near the middle."]
    : ["", "Rond het midden van het stel.", "Aan beide uiteinden van het stel.", "Aan beide uiteinden en rond het midden."];
  const facilities = [
    {
      icon: "bicycle",
      label: en ? "Bike spaces" : "Fietsplekken",
      hint: [bikeLocations[areas.length], en ? "Look for the bike symbol on the doors." : "Kijk naar het fietssymbool op de deuren."].filter(Boolean).join(" "),
      href: rNet ? "https://www.ns.nl/reizen/treinen/rnet" : nsBoardingSources.bicycle,
    },
    {
      icon: "wheelchair",
      label: en ? "Wheelchair spaces" : "Rolstoelplaatsen",
      hint: en ? "Look for the blue wheelchair symbol on the door." : "Kijk naar het blauwe rolstoelsymbool op de deur.",
      href: nsBoardingSources.wheelchair,
    },
    ...(hasQuietZone ? [{
      icon: "quiet",
      label: en ? "Quiet zones" : "Stiltezones",
      hint: en ? "Look for “Stilte” or “Silence” on the windows." : "Kijk naar ‘Stilte’ of ‘Silence’ op de ramen.",
      href: nsBoardingSources.quiet,
    }] : []),
  ];

  return <section className="tpBoardingGuide" aria-label={en ? "Boarding guide" : "Instapgids"}>
    <header>
      <div>
        <h4>{modelName} · {materialNumber}</h4>
        {dimensions && <p>{dimensions.cars} {en ? "cars" : "rijtuigen"} · ≈ {Math.round(dimensions.metres)} m</p>}
      </div>
      <button type="button" className="tpCloseButton" onClick={onClose} aria-label={en ? "Close boarding guide" : "Sluit instapgids"}><AppIcon name="close" /></button>
    </header>
    {stock ? <>
      {dimensions && areas.length > 0 && <div className="tpBoardingLayout" aria-hidden="true">
        <CarriageStrip cars={dimensions.cars} />
        {areas.map(area => <span key={area} data-area={area}><AppIcon name="bicycle" /></span>)}
      </div>}
      <ul className="tpBoardingFacilities">
        {facilities.map(facility => <li key={facility.icon}>
          <a href={facility.href} target="_blank" rel="noreferrer">
            <AppIcon name={facility.icon} />
            <span><strong>{facility.label}</strong><small>{facility.hint}</small></span>
          </a>
        </li>)}
      </ul>
      <p className="tpBoardingNote">{en ? "Position along the platform is unknown." : "Stopplek langs het perron onbekend."}</p>
    </> : <p className="tpBoardingNote">{en ? "Facilities are unknown for this trainset." : "De voorzieningen van dit treinstel zijn onbekend."}</p>}
  </section>;
}

export function TrainFormation({ units, now }: { units: RailObservation[]; now: number }) {
  const { language } = useLanguage();
  const en = language === "en";
  const guideId = useId();
  const guide = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const parts = units.flatMap(unit => {
    const materialNumber = unit.materialNumber?.trim();
    if (!materialNumber || observationIsStale(unit, now)) return [];
    return [{ id: unit.vehicleId, materialNumber, dimensions: trainSetDetails(materialNumber)?.dimensions }];
  });
  const selected = parts.find(part => part.id === selectedId);
  const activeId = selected?.id;
  const complete = parts.length > 0 && parts.length === units.length && parts.every(part => part.dimensions);
  const cars = parts.reduce((sum, part) => sum + (part.dimensions?.cars ?? 0), 0);
  const metres = parts.reduce((sum, part) => sum + (part.dimensions?.metres ?? 0), 0);
  const minimumWidth = parts.length * 60 + Math.max(0, parts.length - 1) * 6;

  useEffect(() => {
    if (activeId) guide.current?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  return <div className="tpFormation">
    {parts.length > 0 && <div className="tpFormationRail">
      <div
        className={complete ? "tpFormationDiagram" : "tpFormationPicker"}
        style={{ width: `max(${complete ? Math.min(100, metres / 4) : 100}%, ${minimumWidth}px)` }}
        role="group" aria-label={en ? "Trainset boarding details" : "Instapinformatie per treinstel"}
      >
        {parts.map(part => <button
          type="button" className="tpFormationUnit" key={part.id}
          style={{ flexGrow: part.dimensions?.metres ?? 60 }}
          aria-label={en ? `Boarding guide for trainset ${part.materialNumber}` : `Instapgids voor treinstel ${part.materialNumber}`}
          aria-expanded={part.id === activeId} aria-controls={guideId}
          onClick={event => {
            opener.current = event.currentTarget;
            setSelectedId(part.id === activeId ? null : part.id);
          }}
        >
          {part.dimensions && <CarriageStrip cars={part.dimensions.cars} />}
          <span className="tpFormationUnitLabel"><span>{part.materialNumber}</span><AppIcon name="chevron" /></span>
        </button>)}
      </div>
    </div>}
    {complete
      ? <p className="tpFormationSummary">
        <span>{en ? "Reported formation" : "Gemelde samenstelling"}</span>
        <strong>≈ {Math.round(metres)} m · {cars} {en ? "cars" : "rijtuigen"}</strong>
      </p>
      : <p className="tpFormationUnavailable">{en ? "Train length unavailable" : "Treinlengte onbekend"}</p>}
    <div id={guideId} ref={guide}>{selected && <BoardingGuide materialNumber={selected.materialNumber} onClose={() => {
      setSelectedId(null);
      opener.current?.focus();
    }} />}</div>
  </div>;
}
