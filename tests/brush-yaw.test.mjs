/**
 * The contact brushes have to point where the rider is pointing.
 *
 * `deformSim.fragment.wgsl` transforms a world offset into brush space as
 *
 *     q.x = (dx * cos(yaw) + dz * sin(yaw)) / (radius * elongation)
 *     q.y = (-dx * sin(yaw) + dz * cos(yaw)) / radius
 *
 * so the axis it stretches is `(cos yaw, sin yaw)` — the mathematical
 * convention. The controller's `facing` is a heading, where forward is
 * `(sin f, cos f)`. Those two agree at 45 degrees and nowhere else, and the
 * mismatch is a mirror rather than an offset: it turns the wrong way as the
 * rider turns, so no constant correction can hide it.
 *
 * This reimplements the shader's transform against the conversion the contact
 * writer uses. If the two ever disagree again, the board rides beside its own
 * trench, and this fails long before anyone has to notice that in a capture.
 */

import test from "node:test";
import assert from "node:assert/strict";

/** The shader's brush-space transform, transcribed. */
function toBrushSpace(dx, dz, yaw, radius, elongation) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return {
        long: (dx * c + dz * s) / (radius * elongation),
        short: (-dx * s + dz * c) / radius,
    };
}

/** The conversion `snowContact.js` applies. Kept in step with it by hand. */
function brushYaw(facing) {
    return Math.PI * 0.5 - facing;
}

const RADIUS = 0.191;
const ELONG = 5.34;
const HEADINGS = [0, 0.4, Math.PI * 0.25, Math.PI * 0.5, 2.1, Math.PI, -1.3, 5.9];

test("the brush's long axis lies along the rider's heading", () => {
    for (const facing of HEADINGS) {
        // One metre straight ahead of the rider.
        const dx = Math.sin(facing);
        const dz = Math.cos(facing);
        const q = toBrushSpace(dx, dz, brushYaw(facing), RADIUS, ELONG);

        // Ahead is purely along the long axis: nothing spills onto the short one.
        assert.ok(
            Math.abs(q.short) < 1e-12,
            `facing ${facing}: forward leaked ${q.short} onto the short axis`
        );
        assert.ok(
            Math.abs(q.long - 1 / (RADIUS * ELONG)) < 1e-12,
            `facing ${facing}: forward did not land on the long axis`
        );
    }
});

test("the brush's short axis lies across the rider", () => {
    for (const facing of HEADINGS) {
        // One metre off the rider's right.
        const dx = Math.cos(facing);
        const dz = -Math.sin(facing);
        const q = toBrushSpace(dx, dz, brushYaw(facing), RADIUS, ELONG);

        assert.ok(
            Math.abs(q.long) < 1e-12,
            `facing ${facing}: right leaked ${q.long} onto the long axis`
        );
        assert.ok(
            Math.abs(Math.abs(q.short) - 1 / RADIUS) < 1e-12,
            `facing ${facing}: right did not land on the short axis`
        );
    }
});

test("passing the heading through unconverted is wrong away from 45 degrees", () => {
    // The regression this guards. Straight down the Summit Line the old code
    // laid the trench square across the direction of travel.
    const dx = Math.sin(0);
    const dz = Math.cos(0);
    const q = toBrushSpace(dx, dz, 0, RADIUS, ELONG);
    assert.ok(
        Math.abs(q.long) < 1e-12,
        "expected the unconverted heading to put forward on the short axis"
    );
    assert.equal(Math.abs(q.short) > 1e-6, true);
});

test("the trench is the board's own footprint, not a shape chosen to look right",
    async () => {
        const { BOARD, setBoardScale } = await import("../src/character/boardSpec.js");
        setBoardScale(1);
        // The trench's short axis is the waist and its long axis the effective
        // edge. Both come off the mesh, or the groove stops being the board's.
        assert.ok(BOARD.halfWaist > 0 && BOARD.halfEdge > 0);
        assert.equal(BOARD.halfWaist, BOARD.waist * 0.5);
        assert.equal(BOARD.halfEdge, BOARD.effectiveEdge * 0.5);
        // The effective edge is shorter than the board: the rest is rocker.
        assert.ok(BOARD.effectiveEdge < BOARD.length);
        // The waist is narrower than the tips: that is what sidecut means.
        assert.ok(BOARD.waist < BOARD.width);
        // The deck the rider sits on is below the tips' topsheet.
        assert.ok(BOARD.deck < BOARD.envelope);
    });

test("resizing the board resizes its trench with it", async () => {
    const { BOARD, EDGE_TO_WAIST, setBoardScale } =
        await import("../src/character/boardSpec.js");

    setBoardScale(1);
    const unit = { ...BOARD };
    setBoardScale(1.5);

    // Everything the mesh is and everything the groove is move together. A
    // board scaled without its trench rides in a smaller board's track, which
    // is the failure this whole file exists to make impossible.
    for (const key of ["length", "width", "waist", "effectiveEdge",
                       "camber", "deck", "envelope", "halfEdge", "halfWaist"]) {
        assert.ok(
            Math.abs(BOARD[key] - unit[key] * 1.5) < 1e-9,
            `${key} did not scale: ${BOARD[key]} vs ${unit[key] * 1.5}`
        );
    }

    // The brush's elongation is a ratio, so it must NOT move — the contact
    // writer holds it as a constant and only re-reads the radius.
    assert.ok(Math.abs(BOARD.halfEdge / BOARD.halfWaist - EDGE_TO_WAIST) < 1e-9);

    setBoardScale(1);
});
