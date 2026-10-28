// Browser-only long catalog verifies real scroll restoration across lazy panels.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  await page.evaluate(()=>localStorage.setItem('liveopweg-language','nl'));
  await page.route('**/v1/stations/catalog',route=>route.fulfill({json:{source:'NS API',fetchedAt:new Date().toISOString(),stations:Array.from({length:250},(_,i)=>({code:`T${i}`,name:`TESTGEGEVENS station ${String(i).padStart(3,'0')}`,latitude:52.1,longitude:5.1,category:'megastation'}))}}));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://localhost:3000/?panel=stations');
  const item=page.getByRole('button',{name:'TESTGEGEVENS station 080 T80',exact:true});
  await item.scrollIntoViewIfNeeded();
  const before=await page.locator('.panelHost').evaluate(el=>el.scrollTop);
  if(before<500)throw new Error('Long catalog must scroll');
  await item.click();
  await page.getByRole('button',{name:'Terug',exact:true}).click();
  await item.waitFor();
  const after=await page.locator('.panelHost').evaluate(el=>el.scrollTop);
  if(Math.abs(before-after)>2)throw new Error(`Scroll not restored: ${before} → ${after}`);
  await page.unroute('**/v1/stations/catalog');
  return {checks:['Long stations list → station → back restores actual scroll offset'],before,after};
}
