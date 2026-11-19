// Run after radar-browser.mjs. All source overrides stay in this browser.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page)=>{
  const check=(value,label)=>{if(!value)throw new Error(label);};
  let age=0,sendFleet,spriteRequests=0;
  let railRequests=0,crossingRequests=0;
  const emptyGeometry={type:'FeatureCollection',features:[]};
  await page.route('**/v1/geometry/rail',route=>{railRequests++;return route.fulfill({json:emptyGeometry});});
  await page.route('**/v1/geometry/rail/level-crossings',route=>{crossingRequests++;return route.fulfill({json:emptyGeometry});});
  await page.route('**/trains/side-virm.png',route=>route.abort());
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
  await page.setViewportSize({width:1440,height:1000});await page.goto('http://localhost:3000/');
  await page.getByRole('button',{name:'2 treinen in beeld',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.liveMap')?.getAttribute('aria-busy')!=='true');
  check(railRequests===0&&crossingRequests===0,'Overview defers both detailed geometry transfers');
  const search=page.getByRole('combobox',{name:'Zoek trein, station of materieel'});
  await search.fill('9544');check(await page.getByRole('option').count()===1,'One result for a coupled passenger train');
  await Promise.all([page.waitForRequest('**/v1/geometry/rail/level-crossings'),page.getByRole('option').click()]);
  await page.getByText('Treinafbeelding niet beschikbaar',{exact:true}).waitFor();
  check(await page.locator('.tpStockCaption').innerText().then(s=>s.includes('2 gekoppelde stellen')),'Composition remains readable');
  await page.waitForFunction(()=>document.querySelector('.liveMap')?.getAttribute('aria-busy')!=='true');
  for(let i=0;i<3;i++){await page.getByRole('button',{name:'Inzoomen op kaart'}).click();await page.waitForTimeout(300);}
  await page.waitForTimeout(600);check(spriteRequests===0,'Map badges never download the old train sprite');
  check(railRequests===1&&crossingRequests===1,'Zoom loads each detailed geometry source once');
  age=40_000;sendFleet();
  await page.getByRole('button',{name:'Live treinpositie niet beschikbaar',exact:true}).waitFor();
  check(await page.locator('.tpFacts strong').first().innerText()==='—','An old speed is not presented as current');
  await page.getByText(/Positie verouderd ·/).waitFor();
  age=360_000;sendFleet();await page.getByText('Geen actuele treinposities',{exact:true}).waitFor();
  age=0;sendFleet();await page.getByRole('button',{name:'2 treinen in beeld',exact:true}).waitFor();
  await page.unroute('**/trains/side-virm.png');await page.unroute('**/train-virm-v1.png');
  await page.goto('http://localhost:3000/?train=TEST-559');
  await page.locator('.tpIllustration img').waitFor();
  await page.waitForFunction(()=>document.querySelector('.tpIllustration img')?.naturalWidth>0);
  const ratio=await page.locator('.tpIllustration img').evaluate(img=>{const r=img.getBoundingClientRect();return Math.abs(r.width/r.height-img.naturalWidth/img.naturalHeight);});
  check(ratio<.02,'Side illustration keeps its intrinsic aspect ratio');
  await search.fill('2015');await page.getByRole('option').click();
  await page.getByRole('img',{name:'Algemene treinafbeelding FLIRT',exact:true}).waitFor();
  check(await page.locator('.tpImageFallback').isVisible()&&await page.locator('.tpIllustration img').count()===0,'No wrong dedicated train model is substituted for FLIRT');
  await page.waitForTimeout(1200);
  await page.screenshot({path:'output/playwright/api-accuracy-TESTGEGEVENS.png'});
  return {checks:['coupled train counting/search/composition','geometry deferred until zoom and loaded once','image failure fallback and no map sprite downloads','stale speed and positions','recovery after source expiry','intrinsic image ratio','known type with honest generic artwork']};
}
