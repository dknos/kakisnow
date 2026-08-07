/**
 * Glacier Gorge — the ice course.
 *
 * Seven hundred metres of blue hour: an open snowfield with a warning shot —
 * the first crevasse — then the canyon closes in and the mountain offers two
 * answers. The switchbacks wind the open left side between the walls; the
 * Blue Slot runs straight and iced on the right, faster than anything else
 * on this mountain and nearly impossible to carve. They rejoin above the
 * second crevasse and the final iced chute drops into the research camp.
 *
 * Ice is the course's argument: hardness comes from the `surfaces` list, the
 * controller loses 72% of its edge on it, drag falls, and the glossy sheet
 * the SSR pass lights is standing exactly where the physics change — visible
 * three turns before it matters. Crevasses are ridge primitives at their
 * meanest: narrow in z, the width of the course in x, two and a half metres
 * deep. At speed they are a gap jump; hesitating, they are a hole.
 */

export const GLACIER_GORGE = {
    id: "glacier-gorge",
    version: 1,
    title: "Glacier Gorge",
    subtitle: "The blue hour",
    difficulty: "double-black",
    description:
        "Two crevasses, a walled canyon, and the Blue Slot — straight, iced, " +
        "and faster than your edges. Deliver to the research camp.",

    startZ: -140,
    finishZ: 560,
    baseCampZ: 588,
    runLength: 700,

    terrain: {
        gate: { zInFrom: -210, zInTo: -150, zOutFrom: 560, zOutTo: 630 },
        laneHalf: 32,
        laneFeather: 64,

        jumps: [
            { lip: 0, runIn: 22, drop: 20, height: 1.5 },
            { lip: 528, runIn: 24, drop: 20, height: 1.55 },
        ],

        pipes: [],

        ridges: [
            // The canyon walls.
            {
                zFrom: 140, zTo: 400, featherZ: 30,
                xCentre: -34, halfWidth: 10, featherX: 10, height: 3.2,
            },
            {
                zFrom: 140, zTo: 400, featherZ: 30,
                xCentre: 34, halfWidth: 10, featherX: 10, height: 3.2,
            },
            // The divider that makes the Slot a slot.
            {
                zFrom: 180, zTo: 360, featherZ: 26,
                xCentre: 0, halfWidth: 7, featherX: 8, height: 2.6,
            },
            // The crevasses: full-width slots, deep, feathered tight.
            {
                zFrom: 62, zTo: 70, featherZ: 4,
                xCentre: 0, halfWidth: 60, featherX: 20, height: -2.4,
            },
            {
                zFrom: 486, zTo: 494, featherZ: 4,
                xCentre: 0, halfWidth: 60, featherX: 20, height: -2.4,
            },
        ],

        features: [],
    },

    rails: [
        // Steel on the switchback shoulder — the slower route's style answer.
        { ax: -26, az: 296, bx: -22, bz: 330, height: 1.0 },
    ],

    /** Where the snow stops being snow. Physics, audio and the glossy sheet
     *  all read these same rectangles. */
    surfaces: [
        { zFrom: 180, zTo: 360, xFrom: 8, xTo: 26, hardness: 1 },
        { zFrom: 500, zTo: 556, xFrom: -14, xTo: 14, hardness: 0.85 },
    ],

    zones: {
        cheese: {
            id: "cheese",
            name: "Snowfield Gate",
            z: [-76, -40],
            x: [-24, 24],
            maxSlope: 0.62,
            risk: 0.25,
            note: "The open field above the first crevasse. Build speed.",
        },
        patty: {
            id: "patty",
            name: "Switchback Bowl",
            z: [200, 260],
            x: [-28, -6],
            maxSlope: 0.64,
            risk: 0.4,
            note: "The canyon's slow side. Carvable, sheltered, honest.",
        },
        tomato: {
            id: "tomato",
            name: "Blue Slot",
            z: [330, 390],
            x: [8, 26],
            maxSlope: 0.66,
            risk: 0.6,
            note: "On the ice. Getting in is easy. Slowing down is not.",
        },
        lettuce: {
            id: "lettuce",
            name: "Runout Gate",
            z: [444, 474],
            x: [-18, 18],
            maxSlope: 0.66,
            risk: 0.45,
            note: "Between the rejoin and the second crevasse. Commit.",
        },
        onion: {
            id: "onion",
            name: "Serac Field",
            z: [90, 130],
            x: [-44, 44],
            maxSlope: 0.6,
            risk: 0.7,
            excludeInnerX: 30,
            note: "Out among the ice blocks. A detour, and a cold one.",
        },
    },

    features: [
        { z: -140, label: "GORGE GATE" },
        { z: 0, label: "SNOWFIELD HIT" },
        { z: 66, label: "FIRST CREVASSE" },
        { z: 140, label: "CANYON MOUTH" },
        { z: 330, label: "BLUE SLOT" },
        { z: 404, label: "REJOIN" },
        { z: 490, label: "SECOND CREVASSE" },
        { z: 528, label: "CHUTE KICKER" },
        { z: 560, label: "RESEARCH RUNOUT" },
    ],
    insideSpans: [
        { from: 60, to: 74, label: "CREVASSE" },
        { from: 484, to: 498, label: "CREVASSE" },
        { from: 140, to: 404, label: "THE CANYON" },
    ],

    dressing: {
        biome: "glacier",
        seed: 20260807,
        density: 0.8,
        laneClear: 36,
        zoneClear: 26,
    },

    secrets: [
        { id: "tape-1", x: -42, z: 100 },
        { id: "tape-2", x: 17, z: 300 },
        { id: "tape-3", x: 32, z: 524 },
    ],

    events: ["blue-plate", "handle-with-care"],
};
