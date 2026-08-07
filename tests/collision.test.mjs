/**
 * CollisionWorld contracts, provable without a browser.
 *
 * The orchestrator codes the controller against exactly this API, so the
 * things pinned here are the things deflection code will lean on: broad-phase
 * cell semantics, sweep t/normal/contact guarantees (normals unit-length and
 * never degenerate), yaw-rotated boxes actually rotating, kind filtering for
 * rails and triggers, and the no-allocation contract (caller-owned out
 * arrays, ONE shared result object per query type).
 *
 * Sampled sweeps (capsule/segment/box) are asserted to the documented
 * tolerance of one sample step; the analytic sphere sweep is asserted tight.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { CollisionWorld } from "../src/game/collisionWorld.js";

/** |v| for a result's normal. */
function nlen(hit) {
    return Math.hypot(hit.nx, hit.ny, hit.nz);
}

// ------------------------------------------------------------- broad phase

test("a sphere is findable from its own cell and a neighbouring cell within r", () => {
    const world = new CollisionWorld({ cellSize: 8 });
    const id = world.addSphere({ x: 4, y: 0, z: 4, r: 1, kind: "rock" });
    const out = [];

    // Dead centre of its own cell.
    assert.equal(world.queryCircle(4, 4, 1, out), 1);
    assert.equal(out[0].id, id);
    assert.equal(out[0].kind, "rock");

    // From the neighbouring cell, with a radius that reaches back across the
    // cell boundary at x = 8.
    assert.equal(world.queryCircle(12, 4, 5, out), 1);
    assert.equal(out[0].id, id);

    // From the neighbouring cell with a radius that does NOT reach the
    // occupied cell: broad phase is cell-granular, so nothing comes back.
    assert.equal(world.queryCircle(12, 4, 2, out), 0);

    // Far away.
    assert.equal(world.queryCircle(100, 100, 2, out), 0);
    assert.equal(out.length, 0);
});

test("remove() empties the collider's cells; clear() empties everything", () => {
    const world = new CollisionWorld({ cellSize: 8 });
    const a = world.addSphere({ x: 0, y: 0, z: 0, r: 2, kind: "rock" });
    const b = world.addSphere({ x: 40, y: 0, z: 40, r: 2, kind: "rock" });
    const out = [];

    assert.equal(world.remove(a), true);
    assert.equal(world.queryCircle(0, 0, 6, out), 0);
    // The other collider is untouched.
    assert.equal(world.queryCircle(40, 40, 6, out), 1);
    assert.equal(out[0].id, b);
    // Removing an unknown id is a no-op, not a throw.
    assert.equal(world.remove(a), false);

    world.clear();
    assert.equal(world.queryCircle(40, 40, 6, out), 0);
    assert.equal(world.nearest(40, 0, 40, 50, null), null);
});

// ------------------------------------------------------------ sphere sweeps

test("sweepSphere hits a sphere dead-on: t, normal and contact are exact", () => {
    const world = new CollisionWorld();
    world.addSphere({ x: 0, y: 0, z: 10, r: 1, kind: "rock" });

    const hit = world.sweepSphere(0, 0, 0, 0, 0, 20, 0.5);
    assert.ok(hit, "dead-on sweep must hit");
    // Contact when the centres are r + rec.r = 1.5 apart: z = 8.5, t = 0.425.
    assert.ok(hit.t > 0 && hit.t < 1);
    assert.ok(Math.abs(hit.t - 0.425) < 1e-9);
    // Normal points back toward the sweep origin.
    assert.ok(Math.abs(hit.nx) < 1e-9);
    assert.ok(Math.abs(hit.nz + 1) < 1e-9);
    assert.ok(Math.abs(nlen(hit) - 1) < 1e-9);
    // Contact point sits on the collider's surface (analytic: exact).
    const surf = Math.hypot(hit.px - 0, hit.py - 0, hit.pz - 10);
    assert.ok(Math.abs(surf - 1) < 1e-3);
});

test("sweepSphere misses when the path passes outside the combined radius", () => {
    const world = new CollisionWorld();
    world.addSphere({ x: 0, y: 0, z: 10, r: 1, kind: "rock" });
    // Lateral clearance 3 > combined radius 1.5.
    assert.equal(world.sweepSphere(3, 0, 0, 3, 0, 20, 0.5), null);
});

test("sweepSphere reuses ONE result object across calls", () => {
    const world = new CollisionWorld();
    world.addSphere({ x: 0, y: 0, z: 10, r: 1, kind: "rock" });

    const first = world.sweepSphere(0, 0, 0, 0, 0, 20, 0.5);
    const second = world.sweepSphere(0, 0, 5, 0, 0, 20, 0.5);
    assert.ok(first && second);
    // The documented contract: same object, fields overwritten. Callers copy
    // what they need before the next query.
    assert.equal(first, second);
});

// ----------------------------------------------------------- capsule sweeps

test("a vertical tree capsule blocks at trunk height and clears above the cap", () => {
    const world = new CollisionWorld();
    // An 8 m trunk at z = 10.
    world.addCapsule({ ax: 0, ay: 0, az: 10, bx: 0, by: 8, bz: 10, r: 0.4, kind: "tree" });

    const hit = world.sweepSphere(0, 1, 0, 0, 1, 20, 0.5);
    assert.ok(hit, "sweep at trunk height must hit");
    // Contact at z = 10 − 0.9; sampled sweep, so tolerance is one step
    // (max(0.5·0.5, 0.15) = 0.25 m over a 20 m sweep).
    const step = 0.25 / 20;
    assert.ok(hit.t > 0 && hit.t < 1);
    assert.ok(Math.abs(hit.t - 0.455) < step + 1e-6);
    assert.ok(hit.nz < -0.9, "normal must push back along the sweep");
    assert.ok(Math.abs(nlen(hit) - 1) < 1e-6);
    // Contact point on the capsule surface: 0.4 m off the axis.
    const axisDist = Math.hypot(hit.px - 0, hit.pz - 10);
    assert.ok(Math.abs(axisDist - 0.4) < 0.25);

    // Far above the cap: same XZ path, no contact.
    assert.equal(world.sweepSphere(0, 20, 0, 0, 20, 20, 0.5), null);
});

// --------------------------------------------------------------- box sweeps

test("a 45-degree box hits where its AABB stand-in would miss, and vice versa", () => {
    // A long thin wall, hx=4 hz=0.5, centred at z = 10.
    const rotated = new CollisionWorld();
    rotated.addBox({ x: 0, y: 0, z: 10, hx: 4, hy: 2, hz: 0.5, ry: Math.PI / 4, kind: "wall" });
    const aligned = new CollisionWorld();
    aligned.addBox({ x: 0, y: 0, z: 10, hx: 4, hy: 2, hz: 0.5, ry: 0, kind: "wall" });

    // Sweep A: along +x at z = 12. The axis-aligned wall only spans
    // z ∈ [9.5, 10.5] so it misses; the rotated wall's diagonal crosses
    // z = 12 near x ≈ −2.7 and is hit.
    const hitA = rotated.sweepSphere(-10, 0, 12, 10, 0, 12, 0.4);
    assert.ok(hitA, "rotation must bring the wall into this path");
    assert.ok(hitA.t > 0 && hitA.t < 1);
    assert.ok(hitA.nx < 0, "sweeping +x, the contact normal must push back −x");
    assert.ok(Math.abs(nlen(hitA) - 1) < 1e-6);
    assert.equal(aligned.sweepSphere(-10, 0, 12, 10, 0, 12, 0.4), null);

    // Sweep B: along +z at x = 3.8. Inside the axis-aligned wall's x-span
    // (±4), but the rotated wall only reaches |x| ≈ 3.18 — a miss.
    assert.equal(rotated.sweepSphere(3.8, 0, 0, 3.8, 0, 20, 0.4), null);
    const hitB = aligned.sweepSphere(3.8, 0, 0, 3.8, 0, 20, 0.4);
    assert.ok(hitB, "the unrotated wall does block this path");
});

// ------------------------------------------------------------ rails/nearest

test("nearest() with kinds=[\"rail\"] finds the rail and ignores other kinds", () => {
    const world = new CollisionWorld();
    const railId = world.addSegment({
        ax: -10, ay: 1, az: 30, bx: 10, by: 1, bz: 30, r: 0.05, kind: "rail",
    });
    const rockId = world.addSphere({ x: 0, y: 0, z: 33, r: 1, kind: "rock" });

    const rail = world.nearest(0, 1, 31, 5, ["rail"]);
    assert.ok(rail);
    assert.equal(rail.collider.id, railId);
    assert.equal(rail.collider.kind, "rail");
    // Surface distance: 1 m to the axis minus the 0.05 m radius, squared.
    assert.ok(Math.abs(rail.distSq - 0.95 * 0.95) < 1e-9);

    // Same point, filtered to rocks: the rail is invisible.
    const rock = world.nearest(0, 1, 31, 5, ["rock"]);
    assert.ok(rock);
    assert.equal(rock.collider.id, rockId);

    // A Set filter works too, and out-of-range returns null.
    assert.ok(world.nearest(0, 1, 31, 5, new Set(["rail"])));
    assert.equal(world.nearest(0, 1, 200, 5, ["rail"]), null);
});

// ------------------------------------------------------------ glancing hits

test("a glancing hit yields a unit normal with a usable lateral component", () => {
    const world = new CollisionWorld();
    world.addSphere({ x: 0, y: 0, z: 10, r: 1, kind: "rock" });

    // Clearance 1.3 against a combined radius of 1.5: a clip, not a wall.
    const hit = world.sweepSphere(1.3, 0, 0, 1.3, 0, 20, 0.5);
    assert.ok(hit, "path inside the combined radius must clip");
    assert.ok(Math.abs(nlen(hit) - 1) < 1e-6, "normal must be unit length");
    // Lateral (x) component carries the deflection; it must not vanish.
    assert.ok(hit.nx > 0.5, `lateral component too small: ${hit.nx}`);
    assert.ok(hit.nz < 0, "and it still opposes the sweep direction");
    assert.ok(Number.isFinite(hit.nx + hit.ny + hit.nz));
});

// -------------------------------------------------------------- allocation

test("10k queryCircle calls against 200 colliders reuse the caller's array", () => {
    const world = new CollisionWorld();
    // 20 × 10 grid of trees, 10 m apart.
    for (let i = 0; i < 20; i++) {
        for (let j = 0; j < 10; j++) {
            world.addSphere({ x: i * 10, y: 0, z: j * 10, r: 1, kind: "tree" });
        }
    }
    const out = [];
    for (let k = 0; k < 10000; k++) {
        const i = k % 20;
        const j = ((k / 20) | 0) % 10;
        const count = world.queryCircle(i * 10, j * 10, 4, out);
        // The count is the array's truth, every call, on the same array —
        // stale results from the previous call never leak through.
        assert.equal(count, out.length);
        assert.ok(count >= 1, "a query centred on a collider must find it");
        for (let n = 0; n < count; n++) assert.equal(out[n].kind, "tree");
    }
    // And an empty query really empties it.
    assert.equal(world.queryCircle(-500, -500, 3, out), 0);
    assert.equal(out.length, 0);
});

// ----------------------------------------------------------------- triggers

test("a gate sphere works as a trigger through nearest() filtering", () => {
    const world = new CollisionWorld();
    world.addSphere({ x: 0, y: 0, z: 50, r: 6, kind: "gate", data: { name: "finish" } });
    // A tree well outside the gate volume (the gate's surface reaches 6 m
    // from its centre, and surface distance is what nearest() ranks by).
    world.addCapsule({
        ax: 12, ay: 0, az: 40, bx: 12, by: 7, bz: 40, r: 0.3, kind: "tree",
    });

    // Inside the gate volume: surface distance is zero — "triggered".
    const inside = world.nearest(0, 0, 47, 10, ["gate"]);
    assert.ok(inside);
    assert.equal(inside.collider.kind, "gate");
    assert.equal(inside.collider.data.name, "finish");
    assert.equal(inside.distSq, 0);

    // Approaching: positive surface distance, still only gates considered
    // even though the tree is nearer.
    const approaching = world.nearest(0, 0, 40, 10, ["gate"]);
    assert.ok(approaching);
    assert.equal(approaching.collider.kind, "gate");
    assert.ok(Math.abs(approaching.distSq - 16) < 1e-9); // (10 − 6)²

    // Unfiltered, from beside the tree: the tree wins on distance (0.7 m to
    // its surface, versus ~10.3 m to the gate's — past maxR entirely).
    const any = world.nearest(12, 1, 39, 10, null);
    assert.equal(any.collider.kind, "tree");
    assert.ok(Math.abs(any.distSq - 0.49) < 1e-9);
});
