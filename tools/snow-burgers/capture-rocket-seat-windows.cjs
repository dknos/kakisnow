/**
 * Seat calibration for the rocket chair, photographed rather than asserted.
 *
 * The chair is furniture built around a person; RockerKaki is a 2.58 m chibi
 * authored seated. Those two were made for different worlds, and no amount of
 * reading either file says what one scale factor reconciles them. So this
 * sweeps `S.rocketChairScale` and photographs the result from three angles,
 * and the number that goes into settings comes out of looking at the sheet.
 *
 * Usage:
 *   "/mnt/c/Program Files/nodejs/node.exe" \
 *     tools/snow-burgers/capture-rocket-seat-windows.cjs \
 *     --url http://127.0.0.1:5173 --scales 1.0,1.6,2.2
 */
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {chromium}=require("playwright");
function arg(n,d){const i=process.argv.indexOf(n);return i>=0&&process.argv[i+1]?process.argv[i+1]:d;}
const url=arg("--url","http://127.0.0.1:5173")+"?mode=free-ride";
const out=path.resolve(arg("--out","screenshots/snow-burgers/rocket-seat"));
const scales=arg("--scales","1.0,1.6,2.2").split(",").map(Number);
fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),"sb-seat-"));
(async()=>{
  const ctx=await chromium.launchPersistentContext(profile,{
    executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless:true,viewport:{width:1920,height:1080},deviceScaleFactor:1,
    args:["--no-first-run","--no-default-browser-check","--ignore-gpu-blocklist","--disable-gpu-vsync"]});
  const page=ctx.pages()[0]||await ctx.newPage();
  const errs=[]; page.on("pageerror",e=>errs.push(e.message));
  page.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});
  await page.waitForFunction(()=>window.__KAKISNOW__?.ready&&window.KAKISNOW?.rocketChair,null,{timeout:300000});
  const avail=await page.evaluate(()=>window.KAKISNOW.rocketChair.available);
  console.log("rocket chair available:", avail);
  // Flat, open snow away from the course features, so nothing about the
  // terrain is doing the framing.
  await page.evaluate(()=>{
    const k=window.KAKISNOW;
    k.set("vehicle","rocket-chair");
    k.character.position.set(-260,0,-260);
    k.character.position.y=k.terrain.heightAt(-260,-260);
    k.character.velocity.set(0,0,0);
    k.character.facing=0; k.character.surf=0;
  });
  // Let the follow rig arrive at the teleported rider before anything is
  // framed. It eases, and it only eases on a non-zero timestep.
  await page.waitForTimeout(2000);
  const views=[["side",1.5708,0.06],["three-quarter",0.9,0.14],["rear",3.14159,0.10]];
  for(const s of scales){
    await page.evaluate((s)=>window.KAKISNOW.set("rocketChairScale",s),s);
    await page.waitForTimeout(700);
    for(const [name,yaw,pitch] of views){
      await page.evaluate(({yaw,pitch})=>{
        const k=window.KAKISNOW;
        k.rig.yaw=yaw; k.rig.pitch=pitch; k.rig.distance=7.5; k.rig.distanceTarget=7.5;
      },{yaw,pitch});
      await page.waitForTimeout(1600);
      await page.screenshot({path:path.join(out,`scale-${s}-${name}.png`)});
    }
    console.log("captured scale "+s);
  }
  console.log("ERRORS "+errs.length+(errs.length?": "+errs.slice(0,3).join(" | "):""));
  await ctx.close();
  process.exit(errs.length?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
