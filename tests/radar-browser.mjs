// Run through playwright-cli run-code --filename tests/radar-browser.mjs.
// Fixtures are intercepted in this browser only; no test data enters the app bundle.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const check = (value, label) => { if (!value) throw new Error(label); };
  const tappable = locator => locator.evaluate(element => {
    const {x,y,width,height} = element.getBoundingClientRect();
    return width >= 44 && height >= 44 && element.contains(document.elementFromPoint(x + width/2, y + height/2));
  });
  const checks = [];
  let adviceMode = 'success', noticeMode = 'success', trainPresent = true;
  const refreshFleet = [];
  const now = () => new Date().toISOString();
  const later = minutes => new Date(Date.now() + minutes * 60000).toISOString();
  await page.route('**/v1/rail/blauwnet/positions', route => route.fulfill({json:{
    positions:[{
      id:'test-blauwnet',trainNumber:'7925',operator:'Blauwnet K',service:'Sprinter',destination:'Enschede',
      from:'Zwolle',to:'Heino',expiresAt:later(1),longitude:6.18,latitude:52.48,
      kind:'TIMETABLE_TRACK_ESTIMATE',line:null,route:null,measuredAt:null,
    },{
      id:'test-blauwnet-measured',trainNumber:null,operator:'Blauwnet A',service:null,destination:null,
      from:null,to:null,expiresAt:later(1),longitude:6.34,latitude:52.62,
      kind:'KV6_POSITION',line:'RS20',route:'Zwolle – Emmen',measuredAt:now(),
    }],
  }}));
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
  const stationDepartures = [
    entry('test-board','1234','test-train'),
    {...entry('test-positionless','9999',null),operator:'Arriva',serviceType:'Stoptrein',rollingStock:null,track:'8a',plannedTrack:'8a',trackChanged:false},
    {...entry('test-blauwnet-a','3823',null),operator:'Blauwnet A',direction:'Emmen',serviceType:'Sneltrein',rollingStock:null,track:'3',plannedTrack:'3',trackChanged:false},
    {...entry('test-blauwnet-k','7925',null),operator:'Blauwnet K',direction:'Enschede',serviceType:'Sprinter',rollingStock:'FLIRT',track:'4',plannedTrack:'4',trackChanged:false},
  ];
  await page.route('**/v1/stations/*/board', route => route.fulfill({ json: { stationCode: route.request().url().match(/stations\/(.*?)\/board/)[1], generatedAt:now(), lastReceivedAt:now(), sourceHealthy:true, coverage:'RECEIVED_JOURNEYS', windowMinutes:60, departures:stationDepartures, arrivals:[entry('test-arrival','1234','test-train')] } }));
  let longitude=5.11, journeyRevision='a', routeAvailable=true, updateJourney;
  const journeyEvent=(minutes)=>({ plannedAt:new Date(Date.now()+minutes*60_000).toISOString(), actualAt:null, exactDelaySeconds:null, plannedTrack:'5', actualTrack:null });
  const journeyStops=stations.map((station,order)=>({
    order, station:{code:station.code,longName:station.name,shortName:null,mediumName:null,uicCode:null},
    calls:{planned:true,actual:true}, arrival:journeyEvent(order ? 20 : -10), departure:journeyEvent(order ? 21 : -9),
    destination:{planned:null,actual:null}, changes:[],
  }));
  const timetable=()=>({
    journeyId:'test-journey',trainNumber:'1234',serviceDate:now().slice(0,10),operator:'NS',trainCategory:{code:null,name:'Intercity'},
    product:{id:'test-product',version:null,applicationVersion:null,generatedAt:now(),informationAt:now(),validUntil:new Date(Date.now()+3_600_000).toISOString()},
    destination:{planned:stations[1].name,actual:stations[1].name},stops:journeyStops,
    provenance:{sourceId:'ndov.infoplus.rit.interface-5',sourceTopic:'/RIG/InfoPlusRITInterface5',schemaVersion:'RIT-v5@2024-06-27',payloadSha256:journeyRevision.repeat(64),receivedAt:now(),origin:'SOURCE'},
  });
  await page.route('**/v1/trains/test-train/route', route => route.fulfill({ status:routeAvailable ? 200 : 503, json:routeAvailable ? {
    method:'EXPECTED_SHORTEST_TRACK_PATH',exactSwitchPathKnown:false,geometry:{type:'MultiLineString',coordinates:[[[5.109,52.09],[5.105,52.10],[4.90,52.378]]]},
    stops:[],routedStops:1,
  } : {error:'unavailable'} }));
  await page.routeWebSocket(/\/v1\/realtime(?:\?|$)/, ws => {
    const observation = () => ({ observationId:now(), vehicleId:'test-train', trainNumber:'1234', materialNumber:'8601', materialSequence:null, position:{longitude,latitude:52.09,elevationMeters:null,reference:'GPS_SOURCE',mapMatching:'NOT_APPLIED'},speed:{valueKmh:88,origin:'MEASURED_GPS'},headingDegrees:10,gpsQuality:{hdop:null,satellites:null,fix:null},time:{sourceMeasuredAt:now(),sourceGeneratedAt:now(),sourcePublishedAt:now(),receivedAt:now(),normalizedAt:now()},provenance:{sourceId:'ndov.ns.train-positions.interface-5',sourceTopic:'/RIG/NStreinpositiesInterface5',schemaVersion:'TreinLocatie.xsd@2016-10-10',payloadSha256:'a'.repeat(64),origin:'SOURCE'},quality:{state:'FRESH_SOURCE',flags:[],freshnessThresholdSeconds:30} });
    let sequence=0;
    const send = () => ws.send(JSON.stringify({protocolVersion:2,type:'rail.fleet.snapshot',sequence:sequence++,sentAt:now(),data:trainPresent?[observation()]:[]}));
    refreshFleet.push(send);
    send(); const timer=setInterval(send,5000); ws.onClose(()=>clearInterval(timer));
    updateJourney=()=>{
      const data=timetable();
      ws.send(JSON.stringify({protocolVersion:1,type:'rail.journey.snapshot',sequence:0,sentAt:now(),data,link:{method:'TRAIN_NUMBER_AND_LOCAL_SERVICE_DATE',origin:'DERIVED',trainNumber:data.trainNumber,serviceDate:data.serviceDate}}));
    };
    ws.onMessage(raw => {
      const msg=JSON.parse(String(raw));
      if(msg.type!=='select') return;
      ws.send(JSON.stringify({protocolVersion:2,type:'rail.selection.snapshot',sequence:0,sentAt:now(),vehicleId:'test-train',data:observation()}));
      updateJourney();
    });
  });
  await page.evaluate(()=>{localStorage.setItem('liveopweg-language','nl');localStorage.setItem('theme','light');});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://localhost:3000/');
  await page.getByRole('button',{name:'1 trein in beeld',exact:true}).waitFor();
  await page.getByRole('button',{name:'Kaartlagen',exact:true}).click();
  const blauwnetLayer=page.getByRole('checkbox',{name:'Blauwnet',exact:true});
  await blauwnetLayer.check();
  const estimatedTrain=page.getByRole('button',{name:/Geschatte positie.*Blauwnet \(Keolis\).*7925/});
  const measuredTrain=page.getByRole('button',{name:/Gemeten positie.*Blauwnet \(Arriva\).*RS20/});
  await estimatedTrain.waitFor();
  await page.getByRole('button',{name:'Sluit kaartlagen',exact:true}).click();
  await estimatedTrain.click();
  await page.getByText('Geschat op basis van haltetijden',{exact:true}).waitFor();
  await measuredTrain.click();
  await page.getByText(/Gemeten positie · NDOV/).waitFor();
  await page.getByRole('button',{name:'Kaartlagen',exact:true}).click();
  await blauwnetLayer.uncheck();
  await estimatedTrain.waitFor({state:'hidden'});
  await measuredTrain.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Sluit kaartlagen',exact:true}).click();
  checks.push('Blauwnet measured and estimated map positions have distinct labels and can be toggled');
  await page.evaluate(() => { localStorage.removeItem('liveopweg-favorite-stations'); localStorage.removeItem('liveopweg-followed-route'); });
  const search=page.getByRole('combobox',{name:'Zoek trein, station of materieel'});
  await search.fill('1234');
  await page.getByRole('option').filter({hasText:'Trein 1234'}).click();
  await page.getByText('Verwachte route',{exact:true}).waitFor();
  await page.getByRole('region',{name:'Volgende halte'}).getByText('Amsterdam Centraal',{exact:true}).waitFor();
  longitude=5.109;
  refreshFleet.forEach(send=>send());
  await page.getByText('Recente liveposities',{exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/route-progress-TESTGEGEVENS.png'});
  routeAvailable=false;
  journeyRevision='b';
  const failedRoute=page.waitForResponse(response=>response.url().endsWith('/test-train/route')&&response.status()===503);
  updateJourney();
  await failedRoute;
  await page.getByText('Verwachte route',{exact:true}).waitFor({state:'hidden'});
  await page.getByRole('region',{name:'Volgende halte'}).getByText('Amsterdam Centraal',{exact:true}).waitFor();
  await page.getByText('Recente liveposities',{exact:true}).waitFor();
  checks.push('expected route and recorded positions remain distinct; next stop survives route outage');
  await page.getByRole('button',{name:'Volg trein op de kaart'}).click();
  await page.screenshot({path:'output/playwright/train-1440-TESTGEGEVENS.png'});
  await page.setViewportSize({width:390,height:844});
  const followRect=await page.getByRole('button',{name:'Stop met trein volgen',exact:true}).boundingBox();
  check(followRect.y+followRect.height<774,'Follow button stays visible above mobile navigation');
  const nextRect=await page.getByRole('region',{name:'Volgende halte'}).boundingBox();
  const scrollRect=await page.locator('.tpScroll').boundingBox();
  check(nextRect.y>=scrollRect.y && nextRect.y+nextRect.height<=scrollRect.y+scrollRect.height,'Next stop is readable without scrolling the compact train panel');
  check(await tappable(page.locator('.mapZoomControls button').first()),'Zoom is tappable with a train open');
  await page.locator('.mapZoomControls button').first().click();
  const handle=page.getByRole('button',{name:'Paneel vergroten of verkleinen'});
  const handleRect=await handle.boundingBox();
  await page.mouse.move(handleRect.x+handleRect.width/2,handleRect.y+handleRect.height/2);
  await page.mouse.down();
  await page.mouse.move(handleRect.x+handleRect.width/2,handleRect.y-55,{steps:5});
  await page.mouse.up();
  check(await handle.getAttribute('aria-expanded')==='true','Dragging the handle expands the sheet');
  await handle.click();
  check(await handle.getAttribute('aria-expanded')==='false','The handle also collapses by tapping');
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
  check(await page.locator('.stationPhoto').count()===0,'Station board prioritizes departures over the photo');
  await page.getByRole('tab',{name:'Voorzieningen',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.stationPhoto img')?.naturalWidth>0);
  await page.getByRole('link',{name:/Toiletten.*spoor 20 en 21/}).waitFor();
  await page.screenshot({path:'output/playwright/station-voorzieningen-utrecht-TESTGEGEVENS.png'});
  await page.keyboard.press('ArrowRight');
  await page.getByRole('link',{name:/OV-fiets.*Stationsplein 2/}).waitFor();
  await page.getByRole('tab',{name:'Treinen',exact:true}).click();
  await page.getByText('Filters',{exact:true}).click();
  const platform=page.getByRole('combobox',{name:'Perronmodus',exact:true});
  await platform.selectOption('7');
  await page.getByText('Verplaatst naar spoor 5',{exact:true}).waitFor();
  check(await page.getByRole('button').filter({hasText:'Arriva · Stoptrein 9999'}).count()===0,'Other platforms are filtered out');
  await platform.selectOption('8');
  await page.getByRole('button').filter({hasText:'Arriva · Stoptrein 9999'}).waitFor();
  await page.screenshot({path:'output/playwright/station-perronmodus-utrecht-TESTGEGEVENS.png'});
  await platform.selectOption('');
  const operatorFilter=page.getByRole('combobox',{name:'Vervoerder',exact:true});
  await operatorFilter.selectOption('Arriva');
  check(await page.getByRole('button').filter({hasText:'Intercity 1234'}).count()===0,'Regional filter hides other operators');
  check(await page.locator('.stationOperatorIcon').count()===1,'Regional departure has its own icon');
  await page.getByRole('button').filter({hasText:'Arriva · Stoptrein 9999'}).click();
  await page.getByText('Geen geverifieerde foto voor deze trein',{exact:true}).waitFor();
  check(await page.locator('.stationTrainArt img').count()===0,'An operator alone does not imply a model photo');
  check(await page.getByRole('button',{name:'Bekijk op radar',exact:true}).isDisabled(),'Positionless row remains readable');
  await operatorFilter.selectOption('Blauwnet');
  const blauwnetArriva=page.getByRole('button').filter({hasText:'Blauwnet (Arriva) · Sneltrein 3823'});
  await blauwnetArriva.waitFor();
  const blauwnetKeolis=page.getByRole('button').filter({hasText:'Blauwnet (Keolis) · Sprinter 7925'});
  await blauwnetKeolis.waitFor();
  check(await page.locator('.stationResult').count()===2,'The Blauwnet filter groups both operators and excludes other services');
  await blauwnetKeolis.click();
  check(/\/trains\/photos\/blauwnet-flirt(?:-\d+)?\.webp$/.test(await page.locator('.stationTrainArt img').getAttribute('src')),'A confirmed Keolis FLIRT shows its own type photo');
  check(await page.getByRole('button',{name:'Bekijk op radar',exact:true}).isDisabled(),'Blauwnet departure without GPS does not open the radar');
  checks.push('Blauwnet groups Arriva and Keolis and shows its own artwork');
  await operatorFilter.selectOption('');
  await page.getByRole('button').filter({hasText:'Intercity 1234'}).click();
  await page.getByRole('button',{name:'Bekijk op radar',exact:true}).click();
  await page.getByRole('button',{name:'Terug',exact:true}).click();
  await page.getByRole('tab',{name:'Aankomst',exact:true}).click();
  await nav.getByRole('button',{name:'Favorieten',exact:true}).click();
  check(await page.getByRole('button',{name:'Utrecht Centraal UT',exact:true}).isVisible(),'Favorite shared between panels');
  checks.push('station photo, guide, keyboard tabs and platform changes; regional departure → train; operator filter and favorites');
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
    for(const [width,height] of [[360,640],[390,844],[667,375],[768,1024],[820,1180],[844,390],[1024,768],[1440,1000],[1920,1080]]) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(120);
      const metrics=await page.locator('.panelHost').evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),pageWidth:document.documentElement.scrollWidth}));
      check(metrics.rect.x>=0 && metrics.rect.right<=width+1,`Panel within ${width}/${theme}`);
      check(metrics.pageWidth<=width+1,`No horizontal overflow ${width}/${theme}`);
      const zoom=page.locator('.mapZoomControls button').first();
      check(await tappable(zoom),`Map zoom remains tappable at ${width}×${height}/${theme}`);
      if(width<768 && height>500) {
        const resize=page.getByRole('button',{name:'Paneel vergroten of verkleinen'});
        await resize.click(); check(await resize.getAttribute('aria-expanded')==='true','Expand');
        check(await tappable(page.getByRole('button',{name:'Sluit informatiepaneel'})),'Close remains tappable after expanding');
        await resize.click();
      } else if(width<1024) {
        const minimum=width<768 ? 286 : 328;
        check(metrics.rect.width>=minimum && metrics.rect.width<=384 && metrics.rect.x>=width/2,'Docked panel leaves the map alongside');
      } else check(metrics.rect.width>=380 && metrics.rect.width<=421,'Desktop panel width');
      await page.screenshot({path:`output/playwright/radar-${width}-${theme}-TESTGEGEVENS.png`});
    }
  }
  checks.push('nine portrait/landscape viewports × light/dark; mobile drag, expand and collapse; tablet dock; map controls');
  await page.setViewportSize({width:1440,height:1000});
  await nav.getByRole('button',{name:'Reisplanner',exact:true}).click();
  await page.getByRole('button',{name:'Route bewaren',exact:true}).click();
  await page.goto('http://localhost:3000/');
  const commute = page.getByRole('region',{name:'Bewaarde route',exact:true});
  const departure = commute.getByRole('button',{name:/Intercity.*Spoor 7 → 5/});
  await departure.waitFor();
  await page.screenshot({path:'output/playwright/saved-route-desktop-TESTGEGEVENS.png'});
  await departure.click();
  await page.getByRole('button',{name:'Volg trein op de kaart'}).waitFor();
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  const notice = commute.getByRole('button',{name:/Melding bij een station op je route/});
  await notice.waitFor();
  await page.screenshot({path:'output/playwright/saved-route-mobile-TESTGEGEVENS.png'});
  await notice.click();
  await page.getByText('Getroffen stations',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Zoek een andere route',exact:true}).click();
  const plannerOrigin=page.getByRole('combobox',{name:'Van',exact:true});
  await plannerOrigin.focus();
  await page.evaluate(()=>{
    Object.defineProperty(visualViewport,'height',{value:480,configurable:true});
    visualViewport.dispatchEvent(new Event('resize'));
  });
  const keyboardPanel=await page.locator('.panelHost').boundingBox();
  check(keyboardPanel.y+keyboardPanel.height<=480,'The journey form stays above the simulated keyboard');
  await page.evaluate(()=>{
    Reflect.deleteProperty(visualViewport,'height');
    visualViewport.dispatchEvent(new Event('resize'));
  });
  check(await page.getByRole('combobox',{name:'Van',exact:true}).inputValue()==='Utrecht Centraal','Disruption carries saved origin');
  check(await page.getByRole('combobox',{name:'Naar',exact:true}).inputValue()==='Amsterdam Centraal','Disruption carries saved destination');
  await page.getByRole('button',{name:'Zoek reizen',exact:true}).click();
  await page.getByRole('button',{name:'Bekijk trein op radar',exact:true}).waitFor();
  checks.push('saved departures and changed platform → live train; mobile alert → prefilled planner; keyboard resize');
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://localhost:3000/instellingen');
  await page.getByRole('heading',{name:'Instellingen',exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/settings.png'});
  await page.goto('http://localhost:3000/meldingen');
  await page.getByRole('complementary',{name:'Actuele meldingen',exact:true}).waitFor();
  await page.locator('.liveMap canvas').waitFor();
  await page.screenshot({path:'output/playwright/roads.png'});
  for (const [width,height] of [[360,640],[390,844],[667,375],[768,1024],[844,390]]) {
    await page.setViewportSize({width,height});
    check(await tappable(page.locator('.mapZoomControls button').first()),`Road alert zoom is tappable at ${width}×${height}`);
    check(await tappable(page.getByRole('button',{name:'Heel Nederland',exact:true})),`Road alert map reset is tappable at ${width}×${height}`);
    await page.locator('.mapStyleCurrent').click();
    await page.locator('.mapStyleMenu button').first().waitFor();
    check(await tappable(page.locator('.mapStyleMenu button').first()),`Road map style is selectable at ${width}×${height}`);
    await page.locator('.mapStyleCurrent').click();
  }
  checks.push('settings and road pages; road map controls on phone and tablet');
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://localhost:3000/');
  await page.getByRole('button',{name:'1 trein in beeld',exact:true}).waitFor();
  await search.fill('1234');
  await page.getByRole('option').filter({hasText:'Trein 1234'}).click();
  await page.getByRole('region',{name:'Volgende halte'}).getByText('Amsterdam Centraal',{exact:true}).waitFor();
  await page.waitForTimeout(750);
  await page.screenshot({path:'output/playwright/train-390-TESTGEGEVENS.png'});
  const touch=await page.context().newCDPSession(page);
  try {
    await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    const close=page.getByRole('button',{name:'Sluit informatiepaneel'});
    const closeRect=await close.boundingBox();
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:closeRect.x+22,y:closeRect.y+22}]});
    await page.waitForTimeout(100);
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.locator('.panelHost').waitFor({state:'hidden'});
    await page.getByRole('option').filter({hasText:'Trein 1234'}).click();
    const rect=await handle.boundingBox();
    const x=rect.x+rect.width/2, y=rect.y+rect.height/2;
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-80}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    check(await handle.getAttribute('aria-expanded')==='true','The handle responds to a touch swipe');
  } finally {
    await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await touch.detach();
  }
  checks.push('phone search → train; touch swipe to expand and touch tap to close');
  const result={checks,performance:await page.evaluate(()=>performance.getEntriesByType('navigation').map(n=>({domContentLoadedMs:Math.round(n.domContentLoadedEventEnd),loadMs:Math.round(n.loadEventEnd)})))};
  await page.evaluate(value=>{window.__radarAcceptance=value;},result);
  return result;
}
