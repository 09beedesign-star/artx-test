import { chromium } from 'playwright';
const b = await chromium.launch();
for (const theme of ['light','dark']) {
const ctx = await b.newContext({ viewport:{width:1440,height:900}, colorScheme: theme });
const p = await ctx.newPage();
await p.goto('https://www.tuxuai.com/',{waitUntil:'networkidle',timeout:45000}).catch(()=>{});
await p.waitForTimeout(2000);
const pick = async (label, sel) => {
  const h = await p.$(sel); if(!h){console.log(label,'NOTFOUND',sel);return}
  const s = await h.evaluate(e=>{const c=getComputedStyle(e);const r=e.getBoundingClientRect();return {tag:e.tagName,cls:e.className?.toString().slice(0,80),bg:c.backgroundColor,color:c.color,border:c.border,radius:c.borderRadius,shadow:c.boxShadow,font:c.fontSize+'/'+c.fontWeight+' '+c.fontFamily.slice(0,60),h:Math.round(r.height),w:Math.round(r.width),pad:c.padding,trans:c.transition.slice(0,80)}});
  console.log(theme,label,JSON.stringify(s));
  return h;
};
await pick('body','body');
await pick('app-root','#app > *');
for (const t of ['模板灵感','登录','注册','设计模板','图片生成']) {
  const h = await p.getByText(t,{exact:true}).first().elementHandle().catch(()=>null);
  if(!h){console.log('nf',t);continue}
  const btn = await h.evaluateHandle(e=>e.closest('button,a,[role=button]')||e);
  const get = ()=>btn.evaluate(e=>{const c=getComputedStyle(e);const r=e.getBoundingClientRect();return {tag:e.tagName,bg:c.backgroundColor,color:c.color,border:c.border,radius:c.borderRadius,shadow:c.boxShadow,font:c.fontSize+'/'+c.fontWeight,h:Math.round(r.height),pad:c.padding,trans:c.transition.slice(0,90)}});
  console.log(theme,t,JSON.stringify(await get()));
  await btn.hover().catch(()=>{}); await p.waitForTimeout(400);
  console.log(theme,t,'HOVER',JSON.stringify(await get()));
  await p.mouse.move(5,5);
}
const ta = await p.$('textarea');
if (ta) { const box = await ta.evaluateHandle(e=>{let n=e;for(let i=0;i<6;i++){n=n.parentElement;const c=getComputedStyle(n);if(c.boxShadow!=='none'||parseFloat(c.borderRadius)>10)return n}return e.parentElement});
  console.log(theme,'promptbox',JSON.stringify(await box.evaluate(e=>{const c=getComputedStyle(e);return {bg:c.backgroundColor,border:c.border,radius:c.borderRadius,shadow:c.boxShadow,pad:c.padding,cls:e.className}})));
  console.log(theme,'textarea',JSON.stringify(await ta.evaluate(e=>{const c=getComputedStyle(e);return {color:c.color,font:c.fontSize+'/'+c.lineHeight,ph:e.placeholder}})));
  await ta.focus(); await p.waitForTimeout(300);
  console.log(theme,'promptbox FOCUS',JSON.stringify(await box.evaluate(e=>{const c=getComputedStyle(e);return {border:c.border,shadow:c.boxShadow,outline:c.outline}})));
}
const btns = await p.$$eval('button',bs=>bs.map(e=>{const c=getComputedStyle(e);const r=e.getBoundingClientRect();return [e.getAttribute('aria-label')||e.textContent.trim().slice(0,12),Math.round(r.width)+'x'+Math.round(r.height),c.backgroundColor,c.color,c.borderRadius,c.border].join(' | ')}));
console.log(theme,'BUTTONS\n'+btns.join('\n'));
await ctx.close();
}
await b.close();
