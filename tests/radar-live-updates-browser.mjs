// Run through Playwright CLI with the local frontend running.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const timestamp = () => new Date().toISOString();
  function observation(sequence, speed, longitude) {
    const at = timestamp();
    return {
      observationId: `test-${sequence}`, vehicleId: 'test-live-updates', trainNumber: '1234', materialNumber: '8601', materialSequence: '1',
      position: { longitude, latitude: 52.09, elevationMeters: null, reference: 'GPS_SOURCE', mapMatching: 'NOT_APPLIED' },
      speed: { valueKmh:speed, origin:'MEASURED_GPS' }, headingDegrees: 90,
      gpsQuality: { hdop: null, satellites: null, fix: '1' },
      time: { sourceMeasuredAt: at, sourceGeneratedAt: at, sourcePublishedAt: at, receivedAt: at, normalizedAt: at },
      provenance: { sourceId: 'ndov.ns.train-positions.interface-5', sourceTopic: '/RIG/NStreinpositiesInterface5', schemaVersion: 'TreinLocatie.xsd@2016-10-10', payloadSha256: 'c'.repeat(64), origin:'SOURCE' },
      quality: { state: 'FRESH_SOURCE', flags: [], freshnessThresholdSeconds: 30 },
    };
  }
  let socket;
  let resyncs = 0;
  await page.routeWebSocket(/\/v1\/realtime\?feed=rail/, ws => {
    socket = ws;
    ws.onMessage(raw => {
      const message = JSON.parse(String(raw));
      if (message.type === 'resync') resyncs++;
    });
    ws.send(JSON.stringify({ protocolVersion: 2, type: 'rail.fleet.snapshot', sequence: 1, sentAt: timestamp(), data: [observation(1, 24, 5.11)] }));
  });
  await page.goto('http://localhost:3000/');
  const search=page.getByRole('combobox',{name:'Zoek trein, station of materieel'});
  await search.fill('1234');
  await page.getByRole('option').filter({hasText:'1234'}).click();
  await page.getByText('24 km/u',{exact:true}).waitFor();
  const send = (sequence, speed, longitude) => socket.send(JSON.stringify({
    protocolVersion: 2, type: 'rail.fleet.batch', sequence, sentAt: timestamp(),
    upserts: [observation(sequence, speed, longitude)], removedVehicleIds: [],
  }));
  send(3, 77, 5.12);
  await page.getByText('77 km/u',{exact:true}).waitFor();
  assert(resyncs === 1,'A sequence gap requests a single fresh snapshot');
  send(2, 55, 5.115);
  send(4, 88, 5.13);
  await page.getByText('88 km/u',{exact:true}).waitFor();
  assert(await page.getByText('55 km/u',{exact:true}).count() === 0,'Out-of-order batch does not replace the newer position');
  assert(await page.locator('.mapAttribution').count() === 0,'Legacy attribution bar is removed');
  const credits = page.getByRole('button',{name:'Kaartbronnen'});
  if (await credits.getAttribute('aria-expanded') === 'false') await credits.click();
  await page.locator('#map-credits').getByRole('link',{name:'© OpenStreetMap'}).waitFor();
  await credits.click();
  await page.locator('#map-credits').waitFor({state:'hidden'});
  return { checks: ['fleet updates refresh the selected train without a selection message', 'gap recovery', 'map credits remain accessible'] };
}
