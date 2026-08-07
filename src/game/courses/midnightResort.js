/**
 * Midnight Resort — the night course.
 *
 * Six hundred metres of floodlit terrain park under a low cold moon: three
 * tabletop kickers in a row, three steel rails, a halfpipe, and two groomers
 * out grooming exactly where a rider would rather they weren't. The look is
 * the atmosphere block — the course chooses where the sky's sliders start,
 * cold moonlight against the camp's warm windows — and the game is the park:
 * this is where the trick system earns its keep, and Park Order says so out
 * loud with a trick-score medal gate.
 *
 * The snowcats are the first moving hazard: straight ping-pong patrols at
 * walking pace, red-bodied and warm-cabbed for the dark, humming before they
 * are ever in the line. Predictable on purpose — a hazard is a puzzle only
 * when it keeps its own schedule.
 */

export const MIDNIGHT_RESORT = {
    id: "midnight-resort",
    version: 1,
    title: "Midnight Resort",
    subtitle: "The night shift",
    difficulty: "black",
    description:
        "Floodlit park under a cold moon: tabletops, rails, the pipe, and " +
        "two groomers who did not expect company. Serve the village.",

    startZ: -40,
    finishZ: 560,
    baseCampZ: 588,
    runLength: 600,

    /**
     * Where the sky's sliders start on this mountain. Every key is an `S`
     * setting; the overlay can still move any of them afterwards.
     */
    atmosphere: {
        sunElevation: 6.5,
        sunAzimuth: 295,
        sunIntensity: 1.15,
        sunTempWarm: 0.0,
        ambientIntensity: 1.5,
        ambientBlue: 1.7,
        fogDensity: 0.0088,
        exposure: 0.125,
        shaftStrength: 0.12,
    },

    terrain: {
        gate: { zInFrom: -110, zInTo: -50, zOutFrom: 560, zOutTo: 630 },
        laneHalf: 32,
        laneFeather: 64,

        jumps: [
            { lip: 40, runIn: 22, drop: 20, height: 1.5 },
            { lip: 180, runIn: 24, drop: 22, height: 1.7 },
            { lip: 320, runIn: 24, drop: 22, height: 1.7 },
        ],

        pipes: [
            {
                from: 400, to: 460, featherIn: 22, featherOut: 22,
                wallFrom: 5, wallTo: 21, amp: 4.2,
                pack: 0.24, packFalloff: 0.008,
                gateXFrom: 27, gateXTo: 40,
            },
        ],

        ridges: [],
        features: [],
    },

    rails: [
        { ax: 18, az: 120, bx: 18, bz: 150, height: 1.0 },
        { ax: -12, az: 210, bx: -12, bz: 240, height: 1.05 },
        { ax: 8, az: 350, bx: 8, bz: 380, height: 1.0 },
    ],

    /** The groomers: two straight patrols crossing the park's flanks. */
    snowcats: [
        { ax: -44, az: 240, bx: -20, bz: 240, speed: 2.6 },
        { ax: 20, az: 470, bx: 44, bz: 470, speed: 2.4 },
    ],

    zones: {
        cheese: {
            id: "cheese",
            name: "Floodlight Gate",
            z: [-20, 4],
            x: [-24, 24],
            maxSlope: 0.62,
            risk: 0.25,
            note: "Under the first bank of lights, before the first table.",
        },
        patty: {
            id: "patty",
            name: "Tabletop Row",
            z: [88, 138],
            x: [-26, 26],
            maxSlope: 0.62,
            risk: 0.4,
            note: "Between the tables. Speed is everywhere here.",
        },
        tomato: {
            id: "tomato",
            name: "The Pipe",
            z: [406, 456],
            x: [-13, 13],
            maxSlope: 0.70,
            risk: 0.55,
            pipeZone: true,
            note: "In the halfpipe, under the floodlights.",
        },
        lettuce: {
            id: "lettuce",
            name: "Village Lights",
            z: [492, 526],
            x: [-14, 14],
            maxSlope: 0.66,
            risk: 0.45,
            note: "The last stretch, with the village glowing below.",
        },
        onion: {
            id: "onion",
            name: "Back Lot",
            z: [200, 260],
            x: [-42, 42],
            maxSlope: 0.6,
            risk: 0.7,
            excludeInnerX: 30,
            note: "Behind the floodlights, where the groomer works.",
        },
    },

    features: [
        { z: -40, label: "NIGHT GATE" },
        { z: 40, label: "FIRST TABLE" },
        { z: 180, label: "SECOND TABLE" },
        { z: 320, label: "THIRD TABLE" },
        { z: 400, label: "THE PIPE" },
        { z: 492, label: "VILLAGE LIGHTS" },
        { z: 560, label: "RESORT RUNOUT" },
    ],
    insideSpans: [
        { from: 400, to: 482, label: "THE PIPE" },
    ],

    dressing: {
        biome: "resort",
        seed: 20260808,
        density: 0.7,
        laneClear: 34,
        zoneClear: 26,
    },

    secrets: [
        { id: "tape-1", x: -38, z: 150 },
        { id: "tape-2", x: 32, z: 300 },
        { id: "tape-3", x: -22, z: 505 },
    ],

    events: ["night-shift", "park-order"],
};
