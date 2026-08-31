import { gzipSync } from "node:zlib";

function station(code: string, name: string, uic: string) {
  return `<Station><StationCode>${code}</StationCode><Type>5</Type><KorteNaam>${name}</KorteNaam><MiddelNaam>${name}</MiddelNaam><LangeNaam>${name}</LangeNaam><UICCode>${uic}</UICCode></Station>`;
}

export function journeyPayload(generatedAt = "2026-08-20T18:50:50.000Z") {
  return gzipSync(`<?xml version="1.0" encoding="UTF-8"?>
<ns2:PutReisInformatieBoodschapIn xmlns="urn:ns:cdm:reisinformatie:data:rit:5" xmlns:ns2="urn:ns:cdm:reisinformatie:message:ritinfo:5">
  <ReisInformatieProductRitInfo Versie="9.2" TimeStamp="${generatedAt}" ApplicatieVersie="1.2.197">
    <RIPAdministratie><ReisInformatieProductID>fixture-8667</ReisInformatieProductID><AbonnementId>57</AbonnementId><ReisInformatieTijdstip>2026-08-20T18:40:00Z</ReisInformatieTijdstip><GeldigTot>2026-08-20T20:30:00Z</GeldigTot></RIPAdministratie>
    <RitInfo><TreinNummer>8667</TreinNummer><TreinDatum>2026-08-20</TreinDatum><TreinSoort Code="SPR">Sprinter</TreinSoort><Vervoerder>NS</Vervoerder><Reserveren>N</Reserveren><Toeslag>N</Toeslag><SpeciaalKaartje>N</SpeciaalKaartje><Reisplanner>J</Reisplanner>
      <LogischeRit><LogischeRitNummer>8667</LogischeRitNummer><LogischeRitDeel><LogischeRitDeelNummer>8667</LogischeRitDeelNummer>
        <LogischeRitDeelStation>${station("GDA", "Gouda", "8400258")}<TreinEindBestemming InfoStatus="Gepland"><StationCode>Rtd</StationCode><Type>5</Type><KorteNaam>Rotterdam</KorteNaam><MiddelNaam>Rotterdam C.</MiddelNaam><LangeNaam>Rotterdam Centraal</LangeNaam><UICCode>8400530</UICCode></TreinEindBestemming><Stopt InfoStatus="Gepland">J</Stopt><Stopt InfoStatus="Actueel">J</Stopt><VertrekTijd InfoStatus="Gepland">2026-08-20T18:50:00Z</VertrekTijd><VertrekTijd InfoStatus="Actueel">2026-08-20T18:52:00Z</VertrekTijd><ExacteVertrekVertraging>PT2M</ExacteVertrekVertraging><TreinVertrekSpoor InfoStatus="Gepland"><SpoorNummer>5</SpoorNummer></TreinVertrekSpoor><TreinVertrekSpoor InfoStatus="Actueel"><SpoorNummer>8</SpoorNummer></TreinVertrekSpoor></LogischeRitDeelStation>
        <LogischeRitDeelStation>${station("RTD", "Rotterdam Centraal", "8400530")}<Stopt InfoStatus="Gepland">J</Stopt><Stopt InfoStatus="Actueel">J</Stopt><AankomstTijd InfoStatus="Gepland">2026-08-20T19:10:00Z</AankomstTijd><AankomstTijd InfoStatus="Actueel">2026-08-20T19:12:00Z</AankomstTijd><ExacteAankomstVertraging>PT2M</ExacteAankomstVertraging><TreinAankomstSpoor InfoStatus="Gepland"><SpoorNummer>3</SpoorNummer></TreinAankomstSpoor><TreinAankomstSpoor InfoStatus="Actueel"><SpoorNummer>4</SpoorNummer></TreinAankomstSpoor></LogischeRitDeelStation>
      </LogischeRitDeel></LogischeRit>
    </RitInfo>
  </ReisInformatieProductRitInfo>
</ns2:PutReisInformatieBoodschapIn>`);
}
