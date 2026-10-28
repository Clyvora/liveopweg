// Run through playwright-cli run-code --filename tests/radar-browser.mjs.
// Fixtures are intercepted in this browser only; no test data enters the app bundle.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const check = (value, label) => { if (!value) throw new Error(label); };
  const checks = [];
  let adviceMode = 'success', noticeMode = 'success', trainPresent = true;
  const refreshFleet = [];
  const now = () => new Date().toISOString();
  const later = minutes => new Date(Date.now() + minutes * 60000).toISOString();
  const stations = [
    { code: 'UT', name: 'Utrecht Centraal', latitude: 52.0894, longitude: 5.1102, category: 'megastation' },
    { code: 'ASD', name: 'Amsterdam Centraal', latitude: 52.378, longitude: 4.9, category: 'megastation' }
  ];
  await page.route('**/v1/stations/catalog', route => route.fulfill({ json: { source: 'NS API', fetchedAt: now(), stations } }));
  await page.route('**/v1/rail/disruptions', route => route.fulfill({ status: noticeMode === 'error' ? 503 : 200, json: noticeMode === 'error' ? { error: 'unavailable' } : { source: 'NS', fetchedAt: now(), stale: false, disruptions: noticeMode === 'empty' ? [] : [
    { id: 'test-ut', title: 'TESTGEGEVENS · Utrecht – Amsterdam', type: 'DISRUPTION', description: 'TESTGEGEVENS · minder treinen door een wisselstoring.', start: now(), end: null, stations, geometry: { type: 'MultiLineString', coordinates: [[[5.11,52.09],[4.9,52.378]]] } },
    { id: 'test-no-location', title: 'TESTGEGEVENS · Melding zonder kaartlocatie', type: 'MAINTENANCE', description: 'Details blijven bereikbaar.', start: null, end: null, stations: [], geometry: null }
  ] } }));
  const point = (s, minute) => ({ code:s.code, name:s.name, plannedAt:later(minute), actualAt:later(minute), track:'5', plannedTrack:'7' });
  await page.route('**/v1/journeys/advice?*', route => route.fulfill({ status: adviceMode === 'error' ? 503 : 200, json: adviceMode === 'error' ? { error: 'unavailable' } : { source:'NS', fetchedAt:now(), journeys: adviceMode === 'empty' ? [] : [{ id:'test-advice', durationMinutes:30, transfers:0, cancelled:false, messages:['TESTGEGEVENS · controleer spoorwijziging'], legs:[{ id:'test-leg', mode:'TRAIN', service:'Intercity', trainNumber:'1234', origin:point(stations[0],5), destination:point(stations[1],35), cancelled:false, messages:[] }] }] } }));
  const entry = (id, trainNumber, vehicleId) => ({ id, trainNumber, serviceDate:now().slice(0,10), direction:'Amsterdam Centraal', operator:'NS', serviceType:'Intercity', plannedAt:later(8), expectedAt:later(10), timeBasis:'UPDATED', delaySeconds:120, track:'5', plannedTrack:'7', trackChanged:true, cancelled:false, vehicleId, rollingStock:'VIRM' });
  await page.route('**/v1/stations/*/board', route => route.fulfill({ json: { stationCode: route.request().url().match(/stations\/(.*?)\/board/)[1], generatedAt:now(), lastReceivedAt:now(), sourceHealthy:true, coverage:'RECEIVED_JOURNEYS', windowMinutes:60, departures:[entry('test-board','1234','test-train'),entry('test-positionless','9999',null)], arrivals:[entry('test-arrival','1234','test-train')] } }));
  await page.routeWebSocket('**/v1/realtime', ws => {
    const observation = () => ({ observationId:'test-observation', vehicleId:'test-train', trainNumber:'1234', materialNumber:'8601', materialSequence:null, position:{longitude:5.11,latitude:52.09,elevationMeters:null,reference:'GPS_SOURCE',mapMatching:'NOT_APPLIED'},speed:{valueKmh:88,origin:'MEASURED_GPS'},headingDegrees:10,gpsQuality:{hdop:null,satellites:null,fix:null},time:{sourceMeasuredAt:now(),sourceGeneratedAt:now(),sourcePublishedAt:now(),receivedAt:now(),normalizedAt:now()},provenance:{sourceId:'ndov.ns.train-positions.interface-5',sourceTopic:'/RIG/NStreinpositiesInterface5',schemaVersion:'TreinLocatie.xsd@2016-10-10',payloadSha256:'a'.repeat(64),origin:'SOURCE'},quality:{state:'FRESH_SOURCE',flags:[],freshnessThresholdSeconds:30} });
    let sequence=0;
    const send = () => ws.send(JSON.stringify({protocolVersion:2,type:'rail.fleet.snapshot',sequence:sequence++,sentAt:now(),data:trainPresent?[observation()]:[]}));
    refreshFleet.push(send);
    send(); const timer=setInterval(send,5000); ws.onClose(()=>clearInterval(timer));
    ws.onMessage(raw => { const msg=JSON.parse(String(raw)); if(msg.type==='select') ws.send(JSON.stringify({protocolVersion:2,type:'rail.selection.snapshot',sequence:0,sentAt:now(),vehicleId:'test-train',data:observation()})); });
  });
  await page.evaluate(()=>{localStorage.setItem('liveopweg-language','nl');localStorage.setItem('theme','light');});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://localhost:3000/');
  await page.getByRole('button',{name:'1 treinen in beeld',exact:true}).waitFor();
  await page.evaluate(() => { localStorage.removeItem('liveopweg-favorite-stations'); localStorage.removeItem('liveopweg-followed-route'); });
  const search=page.getByRole('combobox',{name:'Zoek trein, station of materieel'});
  await search.fill('1234');
  await page.getByRole('option').filter({hasText:'Trein 1234'}).click();
  await page.getByRole('button',{name:'Volg trein op de kaart'}).click();
  await page.screenshot({path:'output/playwright/train-1440-TESTGEGEVENS.png'});
  await page.setViewportSize({width:390,height:844});
  const followRect=await page.getByRole('button',{name:'Stop met trein volgen',exact:true}).boundingBox();
  check(followRect.y+followRect.height<774,'Follow button stays visible above mobile navigation');
  await page.screenshot({path:'output/playwright/train-390-TESTGEGEVENS.png'});
  await page.setViewportSize({width:1440,height:1000});
  trainPresent=false; refreshFleet.forEach(send=>send());
  await page.getByRole('button',{name:'Live treinpositie niet beschikbaar',exact:true}).waitFor();
  await page.getByText('Er is geen actuele livepositie beschikbaar. Eerder ontvangen treininformatie blijft beschikbaar.',{exact:true}).waitFor();
  trainPresent=true; refreshFleet.forEach(send=>send());
  await page.getByRole('button',{name:'Terug',exact:true}).click();
  check(await search.inputValue()==='1234','Search restored'); checks.push('search → train → follow → missing live position → back');
  await search.fill('');
  const nav=page.getByRole('navigation',{name:'Hoofdnavigatie'});
  await nav.getByRole('button',{name:'Stations',exact:true}).click();
  await page.getByRole('button',{name:'Bewaar favoriet: Utrecht Centraal',exact:true}).click();
  await page.getByRole('button',{name:'Utrecht Centraal UT',exact:true}).click();
  await page.getByRole('button').filter({hasText:'Intercity 9999'}).click();
  check(await page.getByRole('button',{name:'Bekijk op radar',exact:true}).isDisabled(),'Positionless row remains readable');
  await page.getByRole('button').filter({hasText:'Intercity 1234'}).click();
  await page.getByRole('button',{name:'Bekijk op radar',exact:true}).click();
  await page.getByRole('button',{name:'Terug',exact:true}).click();
  await page.getByRole('tab',{name:'Aankomst',exact:true}).click();
  await nav.getByRole('button',{name:'Favorieten',exact:true}).click();
  check(await page.getByRole('button',{name:'Utrecht Centraal UT',exact:true}).isVisible(),'Favorite shared between panels');
  checks.push('station → departure → train; arrival tab; positionless journey; favorites');
  await nav.getByRole('button',{name:'Reisplanner',exact:true}).click();
  await page.getByRole('combobox',{name:'Van',exact:true}).fill('UT');
  await page.getByRole('option',{name:'Utrecht Centraal UT',exact:true}).click();
  await page.getByRole('combobox',{name:'Naar',exact:true}).fill('ASD');
  await page.getByRole('option',{name:'Amsterdam Centraal ASD',exact:true}).click();
  await page.getByRole('button',{name:'Stations omwisselen'}).click();
  check(await page.getByRole('combobox',{name:'Van',exact:true}).inputValue()==='Amsterdam Centraal','Swap');
  await page.getByRole('button',{name:'Stations omwisselen'}).click();
  await page.getByRole('button',{name:'Zoek reizen',exact:true}).click();
  await page.getByRole('button',{name:'Bekijk trein op radar',exact:true}).click();
  await page.getByRole('button',{name:'Terug',exact:true}).click();
  check(await page.getByText('TESTGEGEVENS · controleer spoorwijziging',{exact:true}).isVisible(),'Advice preserved after radar');
  checks.push('planner search, swap, advice → train → advice');
  adviceMode='empty'; await page.getByRole('button',{name:'Zoek reizen',exact:true}).click();
  await page.getByText('Geen reizen gevonden voor deze route en dit tijdstip.',{exact:true}).waitFor();
  adviceMode='error'; await page.getByRole('button',{name:'Zoek reizen',exact:true}).click();
  await page.getByRole('alert').waitFor();
  adviceMode='success'; await page.getByRole('button',{name:'Opnieuw proberen',exact:true}).click();
  await page.getByRole('button',{name:'Bekijk trein op radar',exact:true}).waitFor();
  checks.push('advice empty, outage, retry');
  await nav.getByRole('button',{name:'Spoormeldingen',exact:true}).click();
  await page.getByRole('button').filter({hasText:'TESTGEGEVENS · Utrecht – Amsterdam'}).click();
  await page.getByRole('button').filter({hasText:'TESTGEGEVENS · Melding zonder kaartlocatie'}).click();
  await page.getByText('De bron levert geen kaartlocatie voor deze melding.',{exact:true}).waitFor();
  checks.push('disruptions → affected map and locationless detail');
  for (const theme of ['light','dark']) {
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme',theme),theme);
    for(const width of [390,768,1024,1440,1920]) {
      await page.setViewportSize({width,height:1000});
      await page.waitForTimeout(120);
      const metrics=await page.locator('.panelHost').evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),pageWidth:document.documentElement.scrollWidth}));
      check(metrics.rect.x>=0 && metrics.rect.right<=width+1,`Panel within ${width}/${theme}`);
      check(metrics.pageWidth<=width+1,`No horizontal overflow ${width}/${theme}`);
      if(width<1024) {
        const resize=page.getByRole('button',{name:'Paneel vergroten of verkleinen'});
        await resize.click(); check(await resize.getAttribute('aria-expanded')==='true','Expand');
        await resize.click();
      } else check(metrics.rect.width>=380 && metrics.rect.width<=421,'Desktop panel width');
      await page.screenshot({path:`output/playwright/radar-${width}-${theme}-TESTGEGEVENS.png`});
    }
  }
  checks.push('five widths × light/dark; mobile expand/collapse; panel bounds');
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://localhost:3000/instellingen');
  await page.getByRole('heading',{name:'Instellingen',exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/settings.png'});
  await page.goto('http://localhost:3000/meldingen');
  await page.getByRole('complementary',{name:'Actuele meldingen',exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/roads.png'});
  checks.push('settings and road pages');
  const result={checks,performance:await page.evaluate(()=>performance.getEntriesByType('navigation').map(n=>({domContentLoadedMs:Math.round(n.domContentLoadedEventEnd),loadMs:Math.round(n.loadEventEnd)})))};
  await page.evaluate(value=>{window.__radarAcceptance=value;},result);
  return result;
}
