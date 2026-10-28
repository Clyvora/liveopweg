// Run after radar-browser.mjs so its isolated source fixtures are active.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const checks=[];
  await page.evaluate(()=>{localStorage.setItem('liveopweg-language','nl');localStorage.setItem('theme','light');});
  for(const kind of ['stations','planner','stats','notices','layers','train']){
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(`http://localhost:3000/${['layers','train'].includes(kind)?'':`?panel=${kind}`}`);
    await page.getByRole('button',{name:'1 treinen in beeld',exact:true}).waitFor();
    if(kind==='layers')await page.getByRole('button',{name:'Kaartlagen',exact:true}).click();
    if(kind==='train'){
      await page.getByRole('combobox',{name:'Zoek trein, station of materieel'}).fill('1234');
      await page.getByRole('option').filter({hasText:'Trein 1234'}).click();
    }
    await page.getByRole('dialog').waitFor();
    for(const theme of ['light','dark']){
      await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
      for(const width of [390,768,1024,1440,1920]){
        await page.setViewportSize({width,height:1000});await page.waitForTimeout(250);
        const state=await page.evaluate(()=>({panel:document.querySelector('.panelHost').getBoundingClientRect().toJSON(),nav:document.querySelector('.topbar').getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth>innerWidth}));
        if(state.overflow||state.panel.x<0||state.panel.right>width+1)throw new Error(`Overflow: ${kind}/${theme}/${width}`);
        if(width<1024&&Math.abs(state.nav.bottom-1000)>1)throw new Error(`Navigation: ${kind}/${theme}/${width}`);
        if(kind==='train'){
          const rect=await page.getByRole('button',{name:'Volg trein op de kaart',exact:true}).boundingBox();
          if(rect.y+rect.height>(width<1024?922:976))throw new Error(`Follow hidden: ${theme}/${width}`);
        }
      }
      await page.screenshot({path:`output/playwright/${kind}-1920-${theme}.png`});
    }
    checks.push(`${kind}: five widths × light/dark`);
  }
  for(const path of ['instellingen','meldingen']){
    await page.goto(`http://localhost:3000/${path}`);
    for(const theme of ['light','dark']){
      await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
      for(const width of [390,768,1024,1440,1920]){
        await page.setViewportSize({width,height:1000});await page.waitForTimeout(250);
        if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(`Page overflow: ${path}/${theme}/${width}`);
      }
    }
    checks.push(`${path}: five widths × light/dark`);
  }
  return {checks};
}
