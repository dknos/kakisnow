/**
 * Pinecone Pass — the forest course.
 *
 * Six hundred and fifty metres from an open alpine gate down into the trees:
 * an intro hit on the snowfield, then the mountain splits — a sunken creek
 * line on the left, technical and sheltered, against an elevated ridge shelf
 * on the right, faster and exposed — and the two rejoin for a tight treeline
 * chute over the last kicker into the ranger camp.
 *
 * The split is two signed ridge primitives: a trench for the creek, a mound
 * for the shelf, with the natural forest floor left standing between them as
 * the divider. Riding the shelf to its feathered end is a natural takeoff —
 * the "bigger jumps" of the ridge route are the ridge itself running out, not
 * an authored kicker crossing both lanes.
 *
 * Route maths that are load-bearing (the 0.84 lateral-ratio rule): the creek
 * and shelf zones sit 70+ metres apart along z, so a route that picks the
 * creek's Patty and the shelf's Tomato stays inside a rider's turning
 * authority. Tighten these spans and `selectRoute` starts exhausting retries.
 */

export const PINECONE_PASS = {
    id: "pinecone-pass",
    version: 1,
    title: "Pinecone Pass",
    subtitle: "The treeline split",
    difficulty: "black",
    description:
        "Into the firs: pick the sunken creek or the exposed ridge shelf, " +
        "thread the treeline chute, and serve at the ranger camp.",

    startZ: -80,
    finishZ: 570,
    baseCampZ: 596,
    runLength: 650,

    terrain: {
        gate: { zInFrom: -150, zInTo: -95, zOutFrom: 570, zOutTo: 640 },
        laneHalf: 30,
        laneFeather: 62,

        jumps: [
            // The intro hit, on the open snowfield before the trees close in.
            { lip: 60, runIn: 22, drop: 20, height: 1.5 },
            // The chute kicker, after the rejoin, carrying into the camp.
            { lip: 500, runIn: 24, drop: 22, height: 1.65 },
        ],

        pipes: [],

        ridges: [
            // The creek: a sunken left line. Its own edges are the banks.
            {
                zFrom: 130, zTo: 380, featherZ: 34,
                xCentre: -18, halfWidth: 8, featherX: 8, height: -1.7,
            },
            // The shelf: an elevated right line. Running off its feathered
            // end at speed is a real launch.
            {
                zFrom: 130, zTo: 380, featherZ: 30,
                xCentre: 20, halfWidth: 9, featherX: 9, height: 1.4,
            },
        ],

        features: [],
    },

    rails: [
        // A fallen log along the creek's inner bank — fat, warm timber,
        // readable from the split where thin park steel disappeared.
        { ax: -8, az: 300, bx: -8, bz: 336, height: 0.9, style: "log" },
    ],

    zones: {
        cheese: {
            id: "cheese",
            name: "Treeline Gate",
            z: [-16, 24],
            x: [-24, 24],
            maxSlope: 0.62,
            risk: 0.25,
            note: "The open gate before the forest. Taken flat out.",
        },
        patty: {
            id: "patty",
            name: "Creek Bowl",
            z: [150, 200],
            x: [-28, -8],
            maxSlope: 0.64,
            risk: 0.4,
            note: "Down in the creek. Sheltered, technical, banked.",
        },
        tomato: {
            id: "tomato",
            name: "Ridge Shelf",
            z: [270, 330],
            x: [10, 28],
            maxSlope: 0.62,
            risk: 0.55,
            note: "Up on the shelf. Exposed, fast, and a long way down.",
        },
        lettuce: {
            id: "lettuce",
            name: "Chute Gate",
            z: [428, 462],
            x: [-20, 20],
            maxSlope: 0.66,
            risk: 0.45,
            note: "The rejoin, where both routes funnel into the chute.",
        },
        onion: {
            id: "onion",
            name: "Log Detour",
            z: [90, 140],
            x: [-40, 40],
            maxSlope: 0.6,
            risk: 0.7,
            excludeInnerX: 30,
            note: "Off both lines, in the deadfall. A detour, paid in time.",
        },
    },

    features: [
        { z: -80, label: "PASS GATE" },
        { z: 60, label: "TIMBER HIT" },
        { z: 130, label: "THE SPLIT" },
        { z: 300, label: "CREEK RAIL" },
        { z: 410, label: "REJOIN" },
        { z: 500, label: "CHUTE KICKER" },
        { z: 570, label: "RANGER RUNOUT" },
    ],
    insideSpans: [
        { from: 130, to: 410, label: "RIDGE & CREEK" },
    ],

    dressing: {
        biome: "forest",
        seed: 20260806,
        // Denser trees, closer to the lane: the slalom IS the course.
        density: 1.9,
        laneClear: 26,
        zoneClear: 22,
    },

    events: ["timber-melt", "branch-manager"],
};
