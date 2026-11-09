import { chromium } from 'playwright';
const b = await chromium.launch();
const urls = process.argv.slice(2);
for (const u of urls) {
  for (const theme of ['light','dark']) {
    const ctx = await b.newContext({ viewport:{width:1440,height:900}, colorScheme: theme });
    const p = await ctx.newPage();
    try { await p.goto(u,{waitUntil:'networkidle',timeout:45000}); } catch(e){ console.log('timeout',u); }
    await p.waitForTimeout(2500);
    const name = u.replace(/https?:\/\//,'').replace(/[^a-z0-9]+/gi,'_')+'_'+theme;
    await p.screenshot({path:`/tmp/tuxu/shots/${name}.png`});
    console.log(name, await p.title());
    await ctx.close();
  }
}
await b.close();
