import { chromium } from 'playwright';
const b = await chromium.launch();
const out = process.argv[2] || 'before';
for (const path of ['/', '/ecommerce-canvas', '/billing']) {
  for (const theme of ['dark','light']) {
    const ctx = await b.newContext({ viewport:{width:1440,height:900} });
    await ctx.addInitScript((t)=>{ try{localStorage.setItem('theme',t)}catch{} }, theme);
    const p = await ctx.newPage();
    try { await p.goto('http://localhost:3000'+path,{waitUntil:'networkidle',timeout:45000}); } catch(e){}
    await p.waitForTimeout(2500);
    const n = `${out}_${path.replace(/\W+/g,'_')||'home'}_${theme}`;
    await p.screenshot({path:`/tmp/tuxu/shots/${n}.png`});
    console.log(n, p.url(), await p.evaluate(()=>document.documentElement.className));
    await ctx.close();
  }
}
await b.close();
