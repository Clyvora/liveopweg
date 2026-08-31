import { gzipSync } from "node:zlib";

export function trainPositionPayload(options: {
  gpsTime?: string;
  materialNumber?: string;
  extraField?: string;
} = {}): Buffer {
  const gpsTime = options.gpsTime ?? "2026-08-20T18:50:45Z";
  const materialNumber = options.materialNumber ?? "2015";
  const extraField = options.extraField ?? "";
  return gzipSync(`<?xml version="1.0" encoding="UTF-8"?>
<tns3:ArrayOfTreinLocation xmlns:tns3="http://schemas.datacontract.org/2004/07/Cognos.Infrastructure.Models">
  <tns3:TreinLocation>
    <tns3:TreinNummer>8667</tns3:TreinNummer>
    <tns3:TreinMaterieelDelen>
      <tns3:MaterieelDeelNummer>${materialNumber}</tns3:MaterieelDeelNummer>
      <tns3:Materieelvolgnummer>1</tns3:Materieelvolgnummer>
      <tns3:GeneratieTijd />
      <tns3:GpsDatumTijd>${gpsTime}</tns3:GpsDatumTijd>
      <tns3:Bron>NTT</tns3:Bron>
      <tns3:Longitude>4.6467455</tns3:Longitude>
      <tns3:Latitude>52.0783348333</tns3:Latitude>
      <tns3:Elevation>0.0</tns3:Elevation>
      <tns3:Snelheid>28.0</tns3:Snelheid>
      <tns3:Richting>185.5</tns3:Richting>
      <tns3:Hdop>1.48</tns3:Hdop>
      <tns3:AantalSatelieten>11</tns3:AantalSatelieten>
      ${extraField}
    </tns3:TreinMaterieelDelen>
  </tns3:TreinLocation>
</tns3:ArrayOfTreinLocation>`);
}
