// Browser-only tile failures and a synthetic satellite tile; never public data.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  await page.evaluate(()=>{localStorage.setItem('liveopweg-language','nl');localStorage.setItem('theme','light');localStorage.removeItem('liveopweg-map-style');});
  const tile=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,256,256);return canvas.toDataURL('image/png').split(',')[1];});
  await page.route('https://tile.openstreetmap.org/**',route=>route.abort('failed'));
  await page.route('https://service.pdok.nl/**',route=>route.fulfill({contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:Buffer.from(tile,'base64')}));
  await page.goto('http://localhost:3000/');
  await page.getByText('Kaartachtergrond niet beschikbaar',{exact:true}).waitFor();
  await page.locator('.mapStatusNotice').getByRole('button',{name:'Kies kaartweergave',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'Luchtfoto',exact:true}).click();
  await page.waitForTimeout(1000);
  await page.getByText('Kaartachtergrond niet beschikbaar',{exact:true}).waitFor({state:'hidden'});
  await page.getByRole('combobox',{name:'Zoek trein, station of materieel'}).fill('1234');
  await page.getByRole('option').filter({hasText:'Trein 1234'}).waitFor();
  await page.unroute('https://tile.openstreetmap.org/**');
  await page.unroute('https://service.pdok.nl/**');
  await page.evaluate(()=>localStorage.removeItem('liveopweg-map-style'));
  await page.route('https://tiles.openfreemap.org/**',route=>route.abort('failed'));
  await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:Buffer.from(tile,'base64')}));
  await page.setViewportSize({width:1200,height:850});
  await page.goto('http://localhost:3000/');
  await page.locator('.liveMap canvas').waitFor();
  await page.getByRole('button',{name:'Kaartlagen',exact:true}).click();
  await page.locator('.mapStyleInline .mapStyleCurrent').click();
  await page.getByRole('menuitemradio',{name:'Nacht',exact:true}).click();
  const credits = page.getByRole('button',{name:'Kaartbronnen',exact:true});
  if (await credits.getAttribute('aria-expanded') === 'false') await credits.click();
  await page.locator('#map-credits').getByText('OpenFreeMap',{exact:true}).waitFor();
  const fallbackTile=page.waitForResponse(response=>/^https:\/\/tile\.openstreetmap\.org\/(?:8|9|1\d)\//.test(response.url()) && response.ok());
  await page.getByRole('button',{name:'Inzoomen op kaart',exact:true}).click();
  await page.getByRole('button',{name:'Inzoomen op kaart',exact:true}).click();
  await fallbackTile;
  await page.getByRole('button',{name:'Kaartlagen',exact:true}).click();
  await page.getByText('Kaartachtergrond niet beschikbaar',{exact:true}).waitFor({state:'hidden'});
  const sampleMap=async()=>{
    const png=await page.screenshot({clip:{x:8,y:340,width:8,height:8}});
    return page.evaluate(async base64=>{
      const image=new Image();
      image.src=`data:image/png;base64,${base64}`;
      await image.decode();
      const canvas=document.createElement('canvas');
      canvas.width=image.width;canvas.height=image.height;
      const context=canvas.getContext('2d');
      context.drawImage(image,0,0);
      return Math.max(...context.getImageData(4,4,1,1).data.slice(0,3));
    },png.toString('base64'));
  };
  if(await sampleMap()>80) throw new Error('White fallback tiles must render dark in night mode');
  await page.reload();
  await page.locator('main[data-night-map]').waitFor();
  await page.getByRole('button',{name:'Kaartlagen',exact:true}).click();
  await page.locator('.mapStyleInline .mapStyleCurrent').getByText('Nacht',{exact:true}).waitFor();
  const controls=await page.locator('.mapZoomControls').evaluate(el=>getComputedStyle(el).backgroundColor);
  if(controls!=='rgb(29, 32, 37)') throw new Error('Night map controls must use dark surfaces');
  await page.unroute('https://tiles.openfreemap.org/**');
  await page.unroute('https://tile.openstreetmap.org/**');
  await page.evaluate(()=>localStorage.removeItem('liveopweg-map-style'));
  return {checks:['Tile source failure has an explanation','Map style remains usable','Source recovery clears warning','Train search remains available','Night mode darkens white fallback tiles and survives reload with dark controls']};
}
