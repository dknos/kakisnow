import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import {
    ZONES, JUMPS, PIPES, BASE_CAMP_Z, candidatesFor, selectRoute, protectedSpans, rng,
} from "../src/game/ingredientPlacement.js";
import { INGREDIENTS, INGREDIENT_IDS } from "../src/game/ingredients.js";
import { BIG_AIR_BASIN } from "../src/game/courses/bigAirBasin.js";

/**
 * A stand-in for the baked heightfield.
 *
 * Deliberately not a plane: the rejection rules are about slope and about local
 * relief, and a flat test field would pass every anchor and prove nothing. The
 * ripples are chosen to put some cells over the relief limit without making the
 * whole course unusable, which is the shape the real terrain has.
 *
 * `normalAt` differentiates `heightAt` rather than returning an analytic
 * normal, so the two can never disagree — the same reason the real heightfield
 * is read back from its own bake.
 */
class RollingCourse {
    heightAt(x, z) {
        return (
            -0.34 * z +
            2.1 * Math.sin(x * 0.041) +
            1.35 * Math.cos(z * 0.027) +
            0.42 * Math.sin(x * 0.19 + z * 0.11)
        );
    }

    normalAt(x, z, out) {
        const e = 0.05;
        const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
        const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
        return out.set(-hx, 2 * e, -hz).normalize();
    }
}

/** A cliff face everywhere: nothing may be placed on it. */
class Wall {
    heightAt(_x, z) {
        return -z * 6;
    }

    normalAt(_x, _z, out) {
        return out.set(0, 1, 6).normalize();
    }
}

const REQUIRED = ["cheese", "patty", "tomato", "lettuce"];
const field = new RollingCourse();

test("every ingredient has a zone and every zone has an ingredient", () => {
    for (const id of INGREDIENT_IDS) {
        assert.ok(ZONES[id], `no zone for ${id}`);
    }
    for (const id of Object.keys(ZONES)) {
        assert.ok(INGREDIENTS[id], `zone ${id} has no ingredient`);
    }
});

test("zones are ordered downhill and do not overlap along the course", () => {
    const lane = REQUIRED.map((id) => ZONES[id]);
    for (let i = 1; i < lane.length; i++) {
        assert.ok(
            lane[i].z[0] > lane[i - 1].z[1],
            `${lane[i].id} starts at ${lane[i].z[0]} before ${lane[i - 1].id} ends`
        );
    }
});

/**
 * `protectedSpans` takes a terrain BLOCK, and handing it the bare `jumps`
 * array returns an empty list rather than throwing — which un-protects every
 * jump on every course, silently. That is exactly the mistake the signature
 * change introduced at one internal call site, and the reason this asserts on
 * the failure mode rather than on the happy path.
 */
test("protectedSpans reads a terrain block, not a jumps array", () => {
    const fromBlock = protectedSpans(BIG_AIR_BASIN.terrain);
    assert.ok(fromBlock.length >= 2, "the jumping hill contributes spans");
    const fromArray = protectedSpans(BIG_AIR_BASIN.terrain.skiJumps);
    assert.equal(fromArray.length, 0, "an array has no jumps or skiJumps keys");
});

test("the jumping hill's in-run and landing are protected end to end", () => {
    const jump = BIG_AIR_BASIN.terrain.skiJumps[0];
    const spans = protectedSpans(BIG_AIR_BASIN.terrain);
    const covered = (z) => spans.some(s => z >= s.from && z <= s.to);
    for (const z of [
        jump.lipZ - jump.inrunLen + 1,   // top of the in-run
        jump.lipZ - 1,                   // the table
        jump.lipZ + 1,                   // the knoll
        jump.lipZ + jump.hillLen - 1,    // the bottom of the landing hill
    ]) {
        assert.ok(covered(z), `z=${z} is on the hill and must be protected`);
    }
    // The outrun is NOT protected: crash recovery has to be able to drop a
    // breadcrumb on the flat, or a fall on the runout rewinds the whole jump.
    assert.ok(
        !covered(jump.lipZ + jump.hillLen + jump.outrunLen - 10),
        "the outrun flat stays available to crash recovery"
    );
});

test("no zone overlaps a jump approach or landing", () => {
    const spans = protectedSpans();
    for (const zone of Object.values(ZONES)) {
        for (const s of spans) {
            const overlaps = zone.z[0] < s.to && zone.z[1] > s.from;
            assert.ok(
                !overlaps,
                `${zone.id} [${zone.z}] overlaps protected span [${s.from}, ${s.to}] (${s.reason})`
            );
        }
    }
});

test("every zone yields candidate anchors on rolling terrain", () => {
    for (const zone of Object.values(ZONES)) {
        const { anchors } = candidatesFor(zone, field, 1);
        assert.ok(anchors.length >= 4, `${zone.id} produced only ${anchors.length} anchors`);
    }
});

test("candidate anchors sit inside their zone and above the terrain", () => {
    for (const zone of Object.values(ZONES)) {
        const { anchors } = candidatesFor(zone, field, 7);
        for (const a of anchors) {
            assert.ok(a.z >= zone.z[0] && a.z <= zone.z[1], `${zone.id} z out of range`);
            assert.ok(a.x >= zone.x[0] && a.x <= zone.x[1], `${zone.id} x out of range`);
            assert.equal(a.y, field.heightAt(a.x, a.z), `${zone.id} anchor is not on the surface`);
            assert.ok(a.slope <= zone.maxSlope, `${zone.id} anchor exceeds its slope limit`);
        }
    }
});

test("the onion stays out of the lane the patty owns", () => {
    const { anchors } = candidatesFor(ZONES.onion, field, 3);
    assert.ok(anchors.length > 0);
    for (const a of anchors) {
        assert.ok(Math.abs(a.x) >= 26, `onion anchor at x=${a.x} is inside the lane`);
    }
});

test("no candidate lands on a halfpipe wall", () => {
    for (const zone of Object.values(ZONES)) {
        const { anchors } = candidatesFor(zone, field, 11);
        for (const a of anchors) {
            for (const p of PIPES) {
                if (a.z < p.from || a.z > p.to) continue;
                assert.ok(
                    Math.abs(a.x) <= p.wallFrom + 3,
                    `${zone.id} anchor at x=${a.x.toFixed(1)}, z=${a.z.toFixed(1)} is up a pipe wall`
                );
            }
        }
    }
});

test("a cliff produces no anchors at all", () => {
    const wall = new Wall();
    for (const zone of Object.values(ZONES)) {
        const { anchors, rejected } = candidatesFor(zone, wall, 1);
        assert.equal(anchors.length, 0, `${zone.id} placed an anchor on a cliff`);
        assert.ok(rejected.length > 0);
    }
});

test("the same seed always produces the same route", () => {
    for (const seed of [1, 42, 9999]) {
        const a = selectRoute(REQUIRED, field, seed);
        const b = selectRoute(REQUIRED, field, seed);
        assert.deepEqual(a.placements, b.placements);
    }
});

test("different seeds produce different routes", () => {
    const seen = new Set();
    for (let seed = 1; seed <= 40; seed++) {
        const r = selectRoute(REQUIRED, field, seed);
        seen.add(r.placements.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).join("|"));
    }
    assert.ok(seen.size > 20, `only ${seen.size} distinct routes across 40 seeds`);
});

test("100 consecutive seeds all produce a completable route", () => {
    const failures = [];
    for (let seed = 1; seed <= 100; seed++) {
        const r = selectRoute(REQUIRED, field, seed);
        if (!r.ok) {
            failures.push(`seed ${seed}: ${r.reason}`);
            continue;
        }
        assert.equal(r.placements.length, 4, `seed ${seed} placed ${r.placements.length}`);

        for (let i = 1; i < r.placements.length; i++) {
            const a = r.placements[i - 1];
            const b = r.placements[i];
            const dz = b.z - a.z;
            assert.ok(dz > 0, `seed ${seed} requires riding uphill`);
            assert.ok(
                Math.abs(b.x - a.x) <= dz * 0.84 + 1e-9,
                `seed ${seed} needs an impossible lateral shift`
            );
        }
        const last = r.placements[r.placements.length - 1];
        assert.ok(last.z < BASE_CAMP_Z, `seed ${seed} places a pickup past the finish`);

        const ids = r.placements.map((p) => p.ingredient);
        assert.deepEqual(ids, REQUIRED, `seed ${seed} lost an ingredient`);
    }
    assert.deepEqual(failures, [], `${failures.length} of 100 seeds failed`);
});

test("a five-ingredient order including the onion also completes", () => {
    // The onion's zone overlaps the patty's along z, so it is ordered after it
    // and the route check has to tolerate a near-zero downhill gap being
    // rejected rather than accepted.
    const ids = ["cheese", "patty", "onion", "tomato", "lettuce"];
    let ok = 0;
    for (let seed = 1; seed <= 100; seed++) {
        if (selectRoute(ids, field, seed).ok) ok++;
    }
    assert.ok(ok >= 90, `only ${ok} of 100 five-ingredient seeds completed`);
});

test("the seeded generator is stable across calls", () => {
    const a = rng(1234);
    const b = rng(1234);
    for (let i = 0; i < 50; i++) assert.equal(a(), b());
});

test("jump and pipe constants still match the course they describe", () => {
    // A guard against this file and heightBake.fragment.wgsl drifting apart.
    // If the shader's course changes, this fails and the zones get revisited
    // rather than silently sitting in a landing zone.
    assert.deepEqual(JUMPS.map((j) => j.lip), [50, 184, 496]);
    assert.deepEqual(PIPES.map((p) => [p.from, p.to]), [[292, 370], [410, 450]]);
});
