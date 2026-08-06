/**
 * The rocket chair under thrust, photographed on the move.
 *
 * A static render says nothing about an exhaust plume: what makes one read is
 * how it falls behind a rider doing twenty metres a second, and a stationary
 * board produces a puff that hangs on the nozzle. So this drives an actual
 * descent with the engine lit and photographs ignition, sustained thrust,
 * a boosted takeoff and the shutdown after landing.
 *
 * Usage:
 *   "/mnt/c/Program Files/nodejs/node.exe" \
 *     tools/snow-burgers/capture-rocket-run-windows.cjs --url http://127.0.0.1:5173
 */
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {chromium}=require("playwright");
function arg(n,d){const i=process.argv.indexOf(n);return i>=0&&process.argv[i+1]?process.argv[i+1]:d;}
const url=arg("--url","http://127.0.0.1:5173")+"?mode=free-ride";
const out=path.resolve(arg("--out","screenshots/snow-burgers/rocket-run"));
fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),"sb-run-"));
(async()=>{
  const ctx=await chromium.launchPersistentContext(profile,{
    executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless:true,viewport:{width:2560,height:1440},deviceScaleFactor:1,
    args:["--no-first-run","--no-default-browser-check","--ignore-gpu-blocklist","--disable-gpu-vsync"]});
  const page=ctx.pages()[0]||await ctx.newPage();
  const errs=[],gpu=[];
  const pat=/GPUValidationError|GPUInternalError|uncaptured error|device lost|Destroyed texture/i;
  page.on("pageerror",e=>errs.push(e.message));
  page.on("console",m=>{const l=m.type()+": "+m.text();if(m.type()==="error")errs.push(l);if(pat.test(l))gpu.push(l);});
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000});
  await page.waitForFunction(()=>window.__KAKISNOW__?.ready&&window.KAKISNOW?.rocketChair,null,{timeout:300000});

  // Start at the summit on the rocket, with the tank full and the throttle
  // forced open — `input.boost` is what the vehicle reads, so writing it is
  // exactly what holding the key does.
  await page.evaluate(()=>{
    const k=window.KAKISNOW;
    k.set("vehicle","rocket-chair");
    k.character.position.set(0,0,0);
    k.character.position.y=k.terrain.heightAt(0,0);
    k.character.velocity.set(0,0,0);
    k.character.facing=0; k.rig.yaw=0; k.rig.pitch=0.08; k.rig.distanceTarget=9;
    k.rocketChair.thrust.reset();
    k.rocketChair.thrust.infinite=true;
    if(window.__drive) cancelAnimationFrame(window.__drive);
    // `surf` is written by the mouse handlers and survives the frame poll, so
    // it can be held from here. `boost` cannot: `pollInput()` rewrites it from
    // held keys every frame, so it has to be a real key — see below.
    const tick=()=>{k.input.surf=true;k.rig.yaw=k.character.facing;window.__drive=requestAnimationFrame(tick);};
    tick();
  });

  // Hold the throttle the way a player does. Writing `input.boost` directly
  // would be overwritten by the next `pollInput()`, which is the same trap the
  // movement axes carry and the reason the first version of this tool measured
  // a rocket that never lit.
  await page.focus("#view").catch(()=>{});
  await page.keyboard.down("Shift");

  const shots=[];
  const shot=async(name)=>{await page.screenshot({path:path.join(out,name+".png")});shots.push(name);};
  await page.waitForTimeout(700);  await shot("01-ignition");
  await page.waitForTimeout(2600); await shot("02-sustained");
  const mid=await page.evaluate(()=>({z:window.KAKISNOW.character.position.z,speed:window.KAKISNOW.character.speed}));
  // A boosted takeoff off the ridgeline lip at z = 184.
  await page.waitForFunction(()=>window.KAKISNOW.character.position.z>150,null,{timeout:30000}).catch(()=>{});
  await page.waitForFunction(()=>!window.KAKISNOW.character.grounded,null,{timeout:20000}).catch(()=>{});
  await page.waitForTimeout(180); await shot("03-boosted-air");
  await page.waitForFunction(()=>window.KAKISNOW.character.grounded,null,{timeout:20000}).catch(()=>{});
  await shot("04-landing");
  // Shutdown: cut the throttle and let the ramp bring it down.
  await page.keyboard.up("Shift");
  await page.waitForTimeout(260); await shot("05-shutdown");

  const tel=await page.evaluate(()=>({
    telemetry:window.KAKISNOW.rocketChair.thrust.telemetry(),
    throttle:window.KAKISNOW.rocketChair.thrust.throttle,
    speed:+window.KAKISNOW.character.speed.toFixed(2),
    z:+window.KAKISNOW.character.position.z.toFixed(1),
    nan:!Number.isFinite(window.KAKISNOW.character.position.y+window.KAKISNOW.character.velocity.x),
  }));
  await page.evaluate(()=>{if(window.__drive)cancelAnimationFrame(window.__drive);});
  fs.writeFileSync(path.join(out,"rocket-run-report.json"),
    JSON.stringify({tool:"capture-rocket-run-windows.cjs",url,midRun:mid,...tel,shots,consoleErrors:errs,webgpuValidation:gpu},null,2)+"\n");
  console.error("speed "+tel.speed+" m/s at z="+tel.z+"  throttle "+tel.throttle.toFixed(3)+"  NaN:"+tel.nan);
  console.error("telemetry "+JSON.stringify(tel.telemetry));
  console.error(errs.length+" console errors, "+gpu.length+" gpu validation");
  for(const e of errs.slice(0,5))console.error("  "+e);
  await ctx.close();
  process.exit(errs.length||gpu.length||tel.nan?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
