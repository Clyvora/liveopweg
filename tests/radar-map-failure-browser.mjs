// Browser-only tile failures and a synthetic satellite tile; never public data.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  await page.evaluate(()=>localStorage.setItem('liveopweg-language','nl'));
  const tile=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const context=canvas.getContext('2d');context.fillStyle='#e5ede7';context.fillRect(0,0,256,256);return canvas.toDataURL('image/png').split(',')[1];});
  await page.route('https://tile.openstreetmap.org/**',route=>route.abort('failed'));
  await page.route('https://server.arcgisonline.com/**',route=>route.fulfill({contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:Buffer.from(tile,'base64')}));
  await page.goto('http://localhost:3000/');
  await page.getByText('Kaartachtergrond niet beschikbaar',{exact:true}).waitFor();
  await page.locator('.mapStatusNotice').getByRole('button',{name:'Kies kaartweergave',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'Satelliet',exact:true}).click();
  await page.waitForTimeout(1000);
  await page.getByText('Kaartachtergrond niet beschikbaar',{exact:true}).waitFor({state:'hidden'});
  await page.getByRole('combobox',{name:'Zoek trein, station of materieel'}).fill('1234');
  await page.getByRole('option').filter({hasText:'Trein 1234'}).waitFor();
  await page.unroute('https://tile.openstreetmap.org/**');
  await page.unroute('https://server.arcgisonline.com/**');
  return {checks:['Tile source failure has an explanation','Map style remains usable','Source recovery clears warning','Train search remains available']};
}
