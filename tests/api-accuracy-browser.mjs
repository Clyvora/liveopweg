// Run after radar-browser.mjs. All source overrides stay in this browser.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page)=>{
  const check=(value,label)=>{if(!value)throw new Error(label);};
  let age=0,sendFleet,spriteRequests=0;
  let railRequests=0,crossingRequests=0;
  const emptyGeometry={type:'FeatureCollection',features:[]};
  await page.route('**/v1/geometry/rail',route=>{railRequests++;return route.fulfill({json:emptyGeometry});});
  await page.route('**/v1/geometry/rail/level-crossings',route=>{crossingRequests++;return route.fulfill({json:emptyGeometry});});
  const virmPhotos = /\/trains\/photos\/virm(?:-\d+)?\.webp$/;
  await page.route(virmPhotos,route=>route.abort());
  await page.route('**/train-virm-v1.png',route=>{spriteRequests++;return route.abort();});
  await page.routeWebSocket(/\/v1\/realtime(?:\?|$)/,ws=>{
    const observation=(id,number,material,sequence)=>{
      const at=new Date(Date.now()-age).toISOString();
      return {observationId:`${id}:${at}`,vehicleId:id,trainNumber:number,materialNumber:material,materialSequence:sequence,position:{longitude:5.11,latitude:52.09,elevationMeters:null,reference:'GPS_SOURCE',mapMatching:'NOT_APPLIED'},speed:{valueKmh:124,origin:'MEASURED_GPS'},headingDegrees:25,gpsQuality:{hdop:null,satellites:null,fix:'1'},time:{sourceMeasuredAt:at,sourceGeneratedAt:null,sourcePublishedAt:null,receivedAt:at,normalizedAt:at},provenance:{sourceId:'ndov.ns.train-positions.interface-5',sourceTopic:'/RIG/NStreinpositiesInterface5',schemaVersion:'TreinLocatie.xsd@2016-10-10',payloadSha256:'a'.repeat(64),origin:'SOURCE'},quality:{state:'FRESH_SOURCE',flags:[],freshnessThresholdSeconds:30}};
    };
    const data=()=>[observation('head','TEST-559','8656','1'),observation('tail','TEST-559','9544','2'),observation('flirt','TEST-8667','2015','1')];
    let sequence=0;
    sendFleet=()=>ws.send(JSON.stringify({protocolVersion:2,type:'rail.fleet.snapshot',sequence:sequence++,sentAt:new Date().toISOString(),data:data()}));
    sendFleet();const timer=setInterval(sendFleet,5000);ws.onClose(()=>clearInterval(timer));
    ws.onMessage(raw=>{const msg=JSON.parse(String(raw));if(msg.type==='select')ws.send(JSON.stringify({protocolVersion:2,type:'rail.selection.snapshot',sequence:sequence++,sentAt:new Date().toISOString(),vehicleId:msg.vehicleId,data:data().find(o=>o.vehicleId===msg.vehicleId)}));});
  });
  await page.evaluate(()=>{localStorage.setItem('theme','light');localStorage.setItem('liveopweg-language','nl');});
  await page.setViewportSize({width:1440,height:1000});
  const [overview] = await Promise.all([page.waitForResponse('**/rail/overview.geojson'),page.goto('http://localhost:3000/')]);
  check(overview.ok(),'Overview loads the bundled national rail network');
  await page.getByRole('button',{name:'2 treinen in beeld',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.liveMap')?.getAttribute('aria-busy')!=='true');
  check(railRequests===0&&crossingRequests===0,'Overview defers both detailed geometry transfers');
  // Let the map worker tile the downloaded overview before the visual capture.
  await page.waitForTimeout(750);
  await page.screenshot({path:'output/playwright/rail-network-overview-TESTGEGEVENS.png'});
  // Both fixture trains are at the same Utrecht coordinates in this viewport.
  await page.mouse.click(691,570);
  const choices = page.getByRole('complementary',{name:'Kies een trein'});
  await choices.getByRole('button',{name:/TEST-559/}).waitFor();
  await choices.getByRole('button',{name:/TEST-8667/}).waitFor();
  await choices.getByRole('button',{name:'Sluiten',exact:true}).click();
  const search=page.getByRole('combobox',{name:'Zoek trein, station of materieel'});
  await search.fill('9544');check(await page.getByRole('option').count()===1,'One result for a coupled passenger train');
  await page.getByRole('option').click();
  await page.getByText('Treinfoto’s konden niet worden geladen',{exact:true}).waitFor();
  check(await page.locator('.tpStockCaption').innerText().then(s=>s.includes('2 gekoppelde stellen')),'Composition remains readable');
  await page.getByText('≈ 270 m · 10 rijtuigen',{exact:true}).waitFor();
  const units = page.locator('.tpFormationUnit');
  check(await units.count()===2 && await units.nth(0).locator('.tpFormationCars > span').count()===6 && await units.nth(1).locator('.tpFormationCars > span').count()===4,'Carriage strip displays separate six- and four-car sets');
  const firstSet = page.getByRole('button',{name:'Instapgids voor treinstel 8656'});
  const secondSet = page.getByRole('button',{name:'Instapgids voor treinstel 9544'});
  const guide = page.getByRole('region',{name:'Instapgids'});
  await firstSet.focus();
  await page.keyboard.press('Enter');
  await guide.getByRole('heading',{name:'VIRM dubbeldekker · 8656'}).waitFor();
  check(await guide.locator('[data-area]').count()===3,'VIRM6 marks bicycle areas at each end and around the middle');
  await secondSet.click();
  await guide.getByRole('heading',{name:'VIRM dubbeldekker · 9544'}).waitFor();
  check(await guide.locator('[data-area]').count()===2 && await guide.locator('[data-area="middle"]').count()===0,'VIRM4 marks its two end areas');
  check(await firstSet.getAttribute('aria-expanded')==='false' && await secondSet.getAttribute('aria-expanded')==='true','Exactly one boarding guide can be open');
  await guide.getByRole('link',{name:/Rolstoelplaatsen/}).waitFor();
  await guide.getByRole('link',{name:/Stiltezones/}).waitFor();
  await guide.getByText('Stopplek langs het perron onbekend.').waitFor();
  await guide.getByRole('button',{name:'Sluit instapgids'}).click();
  check(await secondSet.evaluate(button=>button===document.activeElement),'Closing returns focus to the selected trainset');
  await page.waitForFunction(()=>document.querySelector('.liveMap')?.getAttribute('aria-busy')!=='true');
  await page.getByRole('button',{name:'Kaartlagen',exact:true}).click();
  check(await page.getByRole('checkbox',{name:'Overwegen',exact:true}).count()===0,'Level crossings are absent from map layers');
  for(let i=0;i<4;i++){await page.getByRole('button',{name:'Inzoomen op kaart'}).click();await page.waitForTimeout(300);}
  await page.getByRole('button',{name:'Sluit kaartlagen',exact:true}).click();
  await page.waitForTimeout(600);check(spriteRequests===0,'Map badges never download the old train sprite');
  check(railRequests===1&&crossingRequests===0,'Zoom loads detailed railway geometry once and makes no crossing requests');
  age=40_000;sendFleet();
  await page.getByRole('button',{name:'Live treinpositie niet beschikbaar',exact:true}).waitFor();
  await page.getByText('Treinlengte onbekend',{exact:true}).waitFor();
  check(await firstSet.count()===0,'Stale composition does not offer boarding guidance');
  check(await page.locator('.tpFacts strong').first().innerText()==='—','An old speed is not presented as current');
  await page.getByText(/Positie verouderd ·/).waitFor();
  age=360_000;sendFleet();await page.getByText('Geen actuele treinposities',{exact:true}).waitFor();
  age=0;sendFleet();await page.getByRole('button',{name:'Volg trein op de kaart',exact:true}).waitFor();
  await page.getByRole('button',{name:'Sluit treininformatie',exact:true}).click();
  await page.locator('.trainPanel').waitFor({state:'hidden'});
  await page.unroute(virmPhotos);await page.unroute('**/train-virm-v1.png');
  const loadedPhotos = new Set();
  page.on('request',request=>{if(virmPhotos.test(request.url()))loadedPhotos.add(new URL(request.url()).pathname);});
  const openCoupledTrain = async () => {
    await search.fill('9544');
    await page.getByRole('option').click();
    await page.locator('.tpIllustration img').waitFor();
    await page.waitForFunction(()=>document.querySelector('.tpIllustration img')?.naturalWidth>0);
    return page.locator('.tpIllustration img').getAttribute('src');
  };
  const startingPhoto = await openCoupledTrain();
  check(loadedPhotos.size===1&&loadedPhotos.has(startingPhoto),'The panel downloads only the selected photo');
  check(await page.locator('.tpIllustration button').count()===0,'There are no photo navigation buttons');
  sendFleet();
  check(startingPhoto===await page.locator('.tpIllustration img').getAttribute('src'),'Live updates keep the selected photo');
  let reopenedPhoto = startingPhoto;
  // A random draw can legitimately return the same photo.
  for (let attempt=0; attempt<8 && reopenedPhoto===startingPhoto; attempt++) {
    await page.getByRole('button',{name:'Sluit treininformatie',exact:true}).click();
    await page.locator('.trainPanel').waitFor({state:'hidden'});
    reopenedPhoto = await openCoupledTrain();
  }
  check(startingPhoto!==reopenedPhoto,'A new draw can show a different photo for the same train');
  check(loadedPhotos.size===2,'The reopened panel loads only its new photo');
  check(await page.locator('.tpIllustration img').evaluate(img=>getComputedStyle(img).objectFit==='cover'),'Type photos crop without stretching');
  await page.getByText('≈ 270 m · 10 rijtuigen',{exact:true}).waitFor();
  await firstSet.click();
  await guide.getByRole('heading',{name:'VIRM dubbeldekker · 8656'}).waitFor();
  await page.locator('.tpStock').screenshot({path:'output/playwright/boarding-guide-desktop-TESTGEGEVENS.png'});
  await search.fill('2015');await page.getByRole('option').click();
  await page.locator('.tpIllustration img').waitFor();
  await page.waitForFunction(()=>document.querySelector('.tpIllustration img')?.naturalWidth>0);
  check(/\/trains\/photos\/rnet(?:-\d+)?\.webp$/.test(await page.locator('.tpIllustration img').getAttribute('src')),'Uses an R-net FLIRT photo for its known trainset');
  await page.getByText('≈ 46 m · 2 rijtuigen',{exact:true}).waitFor();
  check(await units.locator('.tpFormationCars > span').count()===2,'A single two-car set has two carriage segments');
  await page.getByRole('button',{name:'Instapgids voor treinstel 2015'}).click();
  await guide.getByRole('heading',{name:'FLIRT · 2015'}).waitFor();
  check(await guide.locator('[data-area]').count()===0 && await guide.getByRole('link',{name:/Stiltezones/}).count()===0,'No precise bike location or quiet zone is assumed for R-net');
  await page.waitForTimeout(1200);
  await page.screenshot({path:'output/playwright/api-accuracy-TESTGEGEVENS.png'});
  return {checks:['overlapping markers open a train chooser','coupled train counting/search/composition','carriage strip and rounded length','trainset switching, verified facility locations and focus return','detailed geometry deferred until zoom and loaded once','image failure fallback and no map sprite downloads','stale speed, positions and boarding guidance','recovery after source expiry','intrinsic image ratio','dedicated FLIRT artwork and layout fallback']};
}
