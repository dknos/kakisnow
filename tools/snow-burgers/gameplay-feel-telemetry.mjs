import { CharacterController } from "../../src/character/controller.js";
import { input } from "../../src/core/input.js";
import { RocketThrust } from "../../src/vehicles/rocketThrust.js";
import { BIG_AIR_BASIN } from "../../src/game/courses/bigAirBasin.js";

class FlatTerrain {
    heightAt() { return 0; }
    normalAt(_x, _z, out) { return out.set(0, 1, 0); }
}

class KickerTerrain {
    heightAt(_x, z) {
        if (z <= 2) return z * 0.62;
        if (z < 2.22) return 1.24 - (z - 2) * 5.4;
        return 0.052;
    }

    normalAt(x, z, out) {
        const e = 0.01;
        const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
        const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
        return out.set(-hx, 2 * e, -hz).normalize();
    }
}

const rig = {
    yaw: 0,
    trauma: 0,
    getFlatForward(out) { return out.set(0, 0, 1); },
    getFlatRight(out) { return out.set(1, 0, 0); },
    addTrauma(value) { this.trauma += value; },
};

function resetInput() {
    input.moveX = 0;
    input.moveZ = 0;
    input.moving = false;
    input.surf = false;
    input.sprint = false;
    input.boost = 0;
    input.jumpPressed = false;
    input.spin = 0;
    input.trickMod = false;
}

function ride({ dt, seconds, hardness = 0, moveX = 0, boost = 0 }) {
    resetInput();
    input.surf = true;
    input.moveX = moveX;
    input.boost = boost;
    const c = new CharacterController(new FlatTerrain());
    c.surfaceHardness = hardness;
    const samples = [];
    const frames = Math.ceil(seconds / dt);
    for (let i = 0; i < frames; i++) {
        c.surfaceHardness = hardness;
        input.moveX = moveX;
        input.boost = boost;
        c.update(dt, rig);
        if (i === 0 || i === Math.floor(frames * 0.1) || i === frames - 1) {
            samples.push({
                t: +(((i + 1) * Math.min(dt, 1 / 30))).toFixed(4),
                speed: +c.speed.toFixed(4),
                x: +c.position.x.toFixed(4),
                z: +c.position.z.toFixed(4),
                facing: +c.facing.toFixed(4),
                carve: +c.carve.toFixed(4),
            });
        }
    }
    return {
        dt,
        seconds,
        hardness,
        moveX,
        boost,
        final: samples.at(-1),
        samples,
    };
}

function jump({ dt }) {
    resetInput();
    const c = new CharacterController(new FlatTerrain());
    input.jumpPressed = true;
    c.update(dt, rig);
    input.jumpPressed = false;
    let apex = c.position.y;
    let landing = null;
    const maxFrames = Math.ceil(3 / dt);
    for (let i = 0; i < maxFrames; i++) {
        c.update(dt, rig);
        apex = Math.max(apex, c.position.y);
        if (c.landed) {
            landing = {
                frame: i + 2,
                time: +((i + 2) * Math.min(dt, 1 / 30)).toFixed(4),
                impact: +c.landingImpact.toFixed(4),
                grade: c.landingGrade,
                airtime: +c.landingAirTime.toFixed(4),
            };
            break;
        }
    }
    return { dt, apex: +apex.toFixed(4), landing };
}

function rocket({ dt, seconds }) {
    resetInput();
    input.surf = true;
    const c = new CharacterController(new FlatTerrain());
    const thrust = new RocketThrust();
    const frames = Math.ceil(seconds / dt);
    for (let i = 0; i < frames; i++) {
        thrust.update(dt, 1, c);
        c.boost = thrust.throttle;
        c.update(dt, rig);
    }
    return {
        dt,
        seconds,
        finalSpeed: +c.speed.toFixed(4),
        distance: +c.position.z.toFixed(4),
        throttle: +thrust.throttle.toFixed(4),
        fuel: +thrust.fuel.toFixed(4),
        maxSpeed: +thrust.maxSpeed.toFixed(4),
        telemetry: thrust.telemetry(),
    };
}

function railCatch() {
    resetInput();
    input.surf = true;
    const c = new CharacterController(new FlatTerrain());
    c.position.set(0, 1.45, 9.9);
    c.velocity.set(0, 0, 8);
    c.verticalVelocity = -0.5;
    c.grounded = false;
    c.airborne = true;
    c.world = {
        nearest() {
            return {
                collider: {
                    kind: "rail",
                    data: { ax: 0, ay: 1, az: 8, bx: 0, by: 1, bz: 20 },
                },
                distSq: 0,
            };
        },
        sweepSphere() { return null; },
    };
    const before = { position: c.position.asArray(), velocity: c.velocity.asArray() };
    c.update(1 / 60, rig);
    return {
        before,
        after: {
            position: c.position.asArray(),
            velocity: c.velocity.asArray(),
            grinding: c.grinding,
            started: c.grindStarted,
            facing: +c.facing.toFixed(4),
        },
    };
}

function crashDecay() {
    resetInput();
    const c = new CharacterController(new FlatTerrain());
    c.velocity.set(16, 0, 0);
    c.grounded = true;
    c._startCrash();
    const speeds = [];
    for (let i = 0; i < 90; i++) {
        c.update(1 / 60, rig);
        if (i === 0 || i === 29 || i === 59 || i === 89) {
            speeds.push({
                t: +((i + 1) / 60).toFixed(4),
                speed: +c.speed.toFixed(4),
                needsRecovery: c.needsRecovery,
            });
        }
    }
    return { crashCount: c.crashCount, speeds };
}

function bufferedNaturalTakeoff() {
    resetInput();
    input.surf = true;
    const terrain = new KickerTerrain();
    const c = new CharacterController(terrain);
    c.position.set(0, terrain.heightAt(0, 1.72), 1.72);
    c.velocity.set(0, 0, 11);
    c.surf = 1;
    let framesToAir = 0;
    for (; framesToAir < 18 && !c.airborne; framesToAir++) c.update(1 / 60, rig);
    const afterLip = { jumpCount: c.jumpCount, verticalVelocity: +c.verticalVelocity.toFixed(4) };
    input.jumpPressed = true;
    c.update(1 / 60, rig);
    input.jumpPressed = false;
    return {
        framesToAir,
        afterLip,
        afterBufferedSpace: {
            jumpCount: c.jumpCount,
            verticalVelocity: +c.verticalVelocity.toFixed(4),
            coyoteConsumed: c.jumpCount === afterLip.jumpCount,
        },
    };
}

function sweptNaturalTakeoff() {
    return [30, 45, 60, 90, 120].map((hz) => {
        resetInput();
        input.surf = true;
        const terrain = new KickerTerrain();
        const c = new CharacterController(terrain);
        c.position.set(0, terrain.heightAt(0, 1.72), 1.72);
        c.velocity.set(0, 0, 11);
        c.surf = 1;
        let launchFrame = -1;
        let launchVelocity = 0;
        let launchClearance = 0;
        let apex = c.position.y;
        let landingAirTime = null;
        for (let frame = 0; frame < 300; frame++) {
            c.update(1 / hz, rig);
            apex = Math.max(apex, c.position.y);
            if (c.airborne && launchFrame < 0) {
                launchFrame = frame;
                launchVelocity = c.verticalVelocity;
                launchClearance = c.position.y - c.groundY;
            }
            if (c.landed) {
                landingAirTime = c.landingAirTime;
                break;
            }
        }
        return {
            hz,
            launchFrame,
            jumpCount: c.jumpCount,
            launchVelocity: +launchVelocity.toFixed(4),
            launchClearance: +launchClearance.toFixed(4),
            apex: +apex.toFixed(4),
            landingAirTime: landingAirTime === null
                ? null
                : +landingAirTime.toFixed(4),
        };
    });
}

function phaseSweep() {
    const results = [];
    for (let i = 0; i <= 80; i++) {
        const startZ = 1.6 + i * 0.005;
        resetInput();
        input.surf = true;
        const terrain = new KickerTerrain();
        const c = new CharacterController(terrain);
        c.position.set(0, terrain.heightAt(0, startZ), startZ);
        c.velocity.set(0, 0, 11);
        c.surf = 1;
        let launchFrame = -1;
        let minAirClearance = Infinity;
        let landings = 0;
        for (let frame = 0; frame < 300; frame++) {
            c.update(1 / 30, rig);
            if (c.airborne) {
                if (launchFrame < 0) launchFrame = frame;
                minAirClearance = Math.min(
                    minAirClearance,
                    c.position.y - c.groundY,
                );
            }
            if (c.landed) landings++;
        }
        results.push({
            startZ,
            launchFrame,
            jumpCount: c.jumpCount,
            landings,
            minAirClearance: +minAirClearance.toFixed(7),
        });
    }
    return {
        fromZ: 1.6,
        toZ: 2,
        stepM: 0.005,
        rateHz: 30,
        probes: results.length,
        allLaunchOnce: results.every((result) => result.jumpCount === 1),
        allLandOnce: results.every((result) => result.landings === 1),
        minimumAirClearance: Math.min(...results.map((result) => result.minAirClearance)),
        launchFrameRange: [
            Math.min(...results.map((result) => result.launchFrame)),
            Math.max(...results.map((result) => result.launchFrame)),
        ],
    };
}

function authoredProbe({ hz, x = 0, z = 300, vx = 0, vz = 10 }) {
    resetInput();
    input.surf = true;
    const c = new CharacterController(new FlatTerrain());
    c.setTakeoffAssist({
        jump: BIG_AIR_BASIN.terrain.skiJumps[0],
        laneHalf: BIG_AIR_BASIN.terrain.laneHalf,
    });
    c.position.set(x, 0, z);
    c.velocity.set(vx, 0, vz);
    c.surf = 1;
    c.update(1 / hz, rig);
    return c;
}

function authoredWindowSweep() {
    const rates = [30, 45, 60, 90, 120];
    let denseProbes = 0;
    let denseLaunches = 0;
    for (const hz of rates) {
        for (let i = 0; i <= 59; i++) {
            const c = authoredProbe({ hz, z: 298 + i * 0.1 });
            denseProbes++;
            if (c.airborne && c.jumpCount === 1) denseLaunches++;
        }
    }

    let laneProbes = 0;
    let laneLaunches = 0;
    for (const hz of rates) {
        for (const [x, vx] of [[24.1, -30], [-24.1, 30]]) {
            const c = authoredProbe({ hz, x, vx, z: 303.9 });
            laneProbes++;
            if (c.airborne && c.jumpCount === 1) laneLaunches++;
        }
    }

    let falseProbes = 0;
    let falseLaunches = 0;
    for (const hz of rates) {
        for (const probe of [
            { z: 304.01 },
            { x: 24.2, vx: -20, z: 303.9 },
            { x: -24.2, vx: 20, z: 303.9 },
        ]) {
            const c = authoredProbe({ hz, ...probe });
            falseProbes++;
            if (c.airborne || c.jumpCount !== 0) falseLaunches++;
        }
    }
    return {
        densePhaseProbes: denseProbes,
        densePhaseLaunches: denseLaunches,
        laneCrossingProbes: laneProbes,
        laneCrossingLaunches: laneLaunches,
        nonIntersectingProbes: falseProbes,
        falseLaunches: falseLaunches,
    };
}

const output = {
    generatedAt: new Date().toISOString(),
    baselineCommit: "50097a5",
    startup: [1 / 120, 1 / 60, 1 / 30].map((dt) => ride({ dt, seconds: 1 })),
    carve: [0, 1].map((moveX) => ride({ dt: 1 / 60, seconds: 1.5, moveX })),
    ice: [0, 0.5, 1].map((hardness) => ride({ dt: 1 / 60, seconds: 1.5, hardness })),
    jump: [1 / 120, 1 / 60, 1 / 30].map((dt) => jump({ dt })),
    rocket: [1 / 60, 1 / 30].map((dt) => rocket({ dt, seconds: 2 })),
    railCatch: railCatch(),
    crashDecay: crashDecay(),
    bufferedNaturalTakeoff: bufferedNaturalTakeoff(),
    sweptNaturalTakeoff: sweptNaturalTakeoff(),
    phaseSweep: phaseSweep(),
    authoredWindowSweep: authoredWindowSweep(),
};

console.log(JSON.stringify(output, null, 2));
