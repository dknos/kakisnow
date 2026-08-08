/**
 * What the game layer costs when it is actually drawing.
 *
 * `profile-windows.cjs` measures Free Ride Lab, where every ingredient, the
 * burger, the base camp and the rocket chair are disabled — which is the right
 * comparison against the pre-game baseline and says nothing at all about the
 * game. This measures the same build twice, in the same session, on the same
 * frame of the same course: once in Free Ride Lab and once mid-Burger-Run with
 * the pickups, their sites and the camp all standing.
 *
 * Same session and same position on purpose. Frame time on this renderer moves
 * with what is on screen, so two runs at two places measure the terrain, not
 * the change.
 */
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {chromium}=require("playwright");
function arg(n,d){const i=process.argv.indexOf(n);return i>=0&&process.argv[i+1]?process.argv[i+1]:d;}
const url=arg("--url","http://127.0.0.1:5173");
const out=path.resolve(arg("--out","screenshots/snow-burgers/perf/game-layer.json"));
const seconds=Number(arg("--seconds","6"));
fs.mkdirSync(path.dirname(out),{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),"sb-perf-"));

function stats(v){
  const s=v.slice().sort((a,b)=>a-b);
  const mean=v.reduce((a,b)=>a+b,0)/v.length;
  return {
    frames:v.length,
    mean:+mean.toFixed(3),
    median:+s[Math.floor(s.length*0.5)].toFixed(3),
    p95:+s[Math.floor(s.length*0.95)].toFixed(3),
    p99:+s[Math.min(s.length-1,Math.floor(s.length*0.99))].toFixed(3),
    max:+s[s.length-1].toFixed(3),
  };
}

(async()=>{
  const ctx=await chromium.launchPersistentContext(profile,{
    executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless:true,viewport:{width:2560,height:1440},deviceScaleFactor:1,
    args:["--no-first-run","--no-default-browser-check","--ignore-gpu-blocklist",
          "--disable-frame-rate-limit","--disable-gpu-vsync"]});
  const page=ctx.pages()[0]||await ctx.newPage();
  const errs=[];
  page.on("pageerror",e=>errs.push(e.message));
  page.on("console",m=>{if(m.type()==="error")errs.push(m.text());});
  await page.goto(url+"?mode=free-ride",{waitUntil:"domcontentloaded",timeout:120000});
  await page.waitForFunction(()=>window.__KAKISNOW__?.ready&&window.KAKISNOW?.game,null,{timeout:300000});

  // A fixed vantage part-way down the course, used for both samples.
  const park=()=>page.evaluate(()=>{
    const k=window.KAKISNOW;
    k.character.position.set(0,0,240);
    k.character.position.y=k.terrain.heightAt(0,240);
    k.character.velocity.set(0,0,0);
    k.character.facing=0; k.rig.yaw=0; k.rig.pitch=0.08;
  });

  const sample=()=>page.evaluate((ms)=>new Promise(res=>{
    const times=[]; let last=performance.now(); const end=last+ms;
    const tick=()=>{
      const now=performance.now();
      times.push(now-last); last=now;
      if(now<end) requestAnimationFrame(tick);
      else res({
        times,
        drawCalls:window.KAKISNOW.perfStats?.drawCalls??null,
        submittedTriangles:window.KAKISNOW.perfStats?.triangles??null,
      });
    };
    requestAnimationFrame(tick);
  }), seconds*1000);

  await park(); await page.waitForTimeout(2500);
  const free=await sample();

  // Same place, but with the whole game layer standing.
  await page.evaluate(()=>{ window.KAKISNOW.game.start(1); });
  await page.waitForTimeout(4200);          // clear the countdown
  await park(); await page.waitForTimeout(2500);
  const game=await sample();

  const counts=await page.evaluate(()=>{
    const g=window.KAKISNOW.game;
    let tris=0, meshes=0;
    for(const a of g.field.assets.values()) if(a.active){tris+=a.triangles;meshes+=a.meshes.length;}
    for(const s of g.field.sites.values()) if(s.active){tris+=s.triangles;meshes+=s.meshes.length;}
    if(g.director.camp.asset.active){tris+=g.director.camp.asset.triangles;meshes+=g.director.camp.asset.meshes.length;}
    return {gameTriangles:tris, gameMeshes:meshes};
  });

  const report={
    tool:"tools/snow-burgers/perf-game-layer-windows.cjs",
    url, seconds, viewport:{width:2560,height:1440},
    note:"Uncapped rAF presentation intervals in headless Windows Chrome. "+
         "Useful for the delta between the two samples, not as an absolute frame cost.",
    freeRideLab:{
      ...stats(free.times.slice(2)),
      drawCalls:free.drawCalls,
      submittedTriangles:free.submittedTriangles,
    },
    burgerRun:{
      ...stats(game.times.slice(2)),
      drawCalls:game.drawCalls,
      submittedTriangles:game.submittedTriangles,
    },
    ...counts,
    consoleErrors:errs,
  };
  const d=+(report.burgerRun.mean-report.freeRideLab.mean).toFixed(3);
  report.deltaMeanMs=d;
  fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
  console.error(`free ride  mean ${report.freeRideLab.mean} ms  p99 ${report.freeRideLab.p99}`);
  console.error(`burger run mean ${report.burgerRun.mean} ms  p99 ${report.burgerRun.p99}`);
  console.error(`delta ${d>=0?"+":""}${d} ms for ${counts.gameTriangles} triangles in ${counts.gameMeshes} meshes`);
  console.error(errs.length+" console errors");
  await ctx.close();
  process.exit(errs.length?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
