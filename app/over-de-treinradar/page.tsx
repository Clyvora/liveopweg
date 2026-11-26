import Link from "next/link";
import { BrandLogo } from "../BrandLogo";
import { guidePath, pageMetadata } from "../site";

export const metadata = pageMetadata(
  "Zo volg je een trein op de kaart",
  "Hoe volg je een trein live in Nederland? Lees hoe je zoekt op treinnummer of station, wat een geschatte positie betekent en waar je vertrektijden vindt.",
  guidePath,
);

export default function TrainRadarGuide() {
  return (
    <main className="radarGuide" lang="nl">
      <header className="radarGuideHeader">
        <Link href="/" aria-label="Liveopweg startpagina"><BrandLogo /></Link>
        <Link className="radarGuideLink" href="/">Open de treinradar <span aria-hidden="true">↗</span></Link>
      </header>
      <article className="radarGuideBody">
        <h1>Zo volg je een trein op de kaart</h1>
        <p>Op de treinradar van Liveopweg zie je actuele treinposities in Nederland, voor zover de gegevens beschikbaar zijn. Zoek een trein op nummer of kies een station om te zien welke ritten er vertrekken.</p>
        <section>
          <h2>Vind een trein of station</h2>
          <ol>
            <li>Open <Link href="/">de live treinkaart</Link> en vul een treinnummer of stationsnaam in.</li>
            <li>Kies een trein op de kaart of open het vertrekbord van een station. Bij een bekende livepositie kun je vanuit een vertrek doorklikken naar de trein.</li>
            <li>Open het treinpaneel voor de volgende halte, vertraging en spoor zodra die gegevens bekend zijn.</li>
          </ol>
        </section>
        <section>
          <h2>Wat betekent de positie op de kaart?</h2>
          <p>Een gemeten treinlocatie is de laatst ontvangen positie. Die kan iets achterlopen op waar de trein nu rijdt. Voor sommige Blauwnet-ritten is er een schatting op basis van haltetijden. De kaart en het treinpaneel geven aan wanneer een positie geschat of verouderd is.</p>
        </section>
        <section>
          <h2>Een vertrek of storing controleren</h2>
          <p>Bekijk <Link href="/?panel=stations">de stations</Link> voor vertrekken, aankomsten en bekende spoorwijzigingen. Gebruik <Link href="/?panel=notices">spoormeldingen</Link> voor storingen en werkzaamheden of <Link href="/?panel=planner">de reisplanner</Link> om een alternatief te vinden.</p>
        </section>
      </article>
    </main>
  );
}
