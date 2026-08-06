const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {chromium}=require("playwright");
const out=path.resolve("screenshots/snow-burgers/ingredients");
fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),"sb-ing-"));
(async()=>{
  const ctx=await chromium.launchPersistentContext(profile,{
    executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless:true,viewport:{width:2560,height:1440},deviceScaleFactor:1,
    args:["--no-first-run","--no-default-browser-check","--ignore-gpu-blocklist","--disable-gpu-vsync"]});
  const page=ctx.pages()[0]||await ctx.newPage();
  const errs=[]; page.on("pageerror",e=>errs.push(e.message));
  page.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
  await page.goto("http://127.0.0.1:5173",{waitUntil:"domcontentloaded",timeout:120000});
  await page.waitForFunction(()=>window.__KAKISNOW__?.ready&&window.KAKISNOW?.game,null,{timeout:300000});
  await page.evaluate(()=>{const g=window.KAKISNOW.game;g.selectMode("burger-run");g.start(1);});
  await page.waitForTimeout(4200); // let the countdown pass so pickups are live
  const items=await page.evaluate(()=>window.KAKISNOW.game.field.items.map(i=>({id:i.id,x:i.anchor.x,y:i.anchor.y,z:i.anchor.z})));
  for(const it of items){
    // Park the rider uphill of the pickup, looking down the approach.
    await page.evaluate(({x,y,z})=>{
      const k=window.KAKISNOW;
      k.game.run.state="order";           // freeze the clock; do not score this
      k.character.position.set(x, y, z-22);
      k.character.position.y=k.terrain.heightAt(x, z-22);
      k.character.velocity.set(0,0,0);
      k.character.facing=0; k.rig.yaw=0; k.rig.pitch=0.10; k.rig.distance=11;
      k.rig.distanceTarget=11;
    }, it);
    await page.waitForTimeout(1400);
    await page.screenshot({path:path.join(out, it.id+".png")});
    console.log("shot "+it.id+" at "+it.x.toFixed(1)+","+it.z.toFixed(1));
  }
  console.log("ERRORS "+errs.length+(errs.length?": "+errs.slice(0,3).join(" | "):""));
  await ctx.close();
})().catch(e=>{console.error(e);process.exit(1)});
