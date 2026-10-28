// Computed-color checks supplement keyboard and touch checks; they do not replace screen-reader testing.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const audit=()=>page.evaluate(()=>{
    const rgb=color=>color.match(/[\d.]+/g)?.slice(0,3).map(Number);
    const luminance=color=>rgb(color).map(c=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
    return [...document.querySelectorAll('h1,h2,h3,p,small,strong,span,time,button,a,label')].filter(el=>!el.children.length&&el.textContent.trim()&&el.getClientRects().length&&!el.closest('[disabled],.radarWordmark')).flatMap(el=>{
      const s=getComputedStyle(el);
      if(s.visibility==='hidden'||s.opacity==='0')return [];
      let ancestor=el,bg='';
      while(ancestor){const value=getComputedStyle(ancestor).backgroundColor;if(value!=='rgba(0, 0, 0, 0)'&&value!=='transparent'){bg=value;break;}ancestor=ancestor.parentElement;}
      if(!bg)return [];
      const a=luminance(s.color),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      const large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&parseInt(s.fontWeight)>=700);
      return ratio<(large?3:4.5)?[{text:el.textContent.trim().slice(0,65),class:el.className,ratio:Math.round(ratio*100)/100,color:s.color,bg}]:[];
    });
  });
  const results=[];
  for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);await page.waitForTimeout(450);results.push({screen:'planner',theme,failures:await audit()});}
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://localhost:3000/instellingen');
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent==='English'&&Object.keys(el).some(k=>k.startsWith('__reactProps$'))));
  await page.waitForTimeout(500);
  for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);await page.waitForTimeout(450);results.push({screen:'settings',theme,failures:await audit()});}
  return results;
}
