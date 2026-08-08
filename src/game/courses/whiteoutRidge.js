/**
 * Whiteout Ridge — the final course.
 *
 * Eight hundred and twenty metres into a storm front, with the mountain
 * coming down behind. All five ingredients, the longest commits, and the
 * choice that defines it: the sheltered lower switchback, longer and honest,
 * against the exposed ridge shelf where the wind owns your line and the
 * gusts push toward the edge. Rescue beacons mark the way; the emergency
 * camp grills at the bottom.
 *
 * The avalanche is a scalar with a voice (see avalanche.js): base pace near
 * a decent rider's, rubber-banded so it menaces the slow and paces the fast,
 * a catch that is exactly one crash, and a reset that gives the relief the
 * brief demands — intense, never arbitrary.
 */

export const WHITEOUT_RIDGE = {
    id: "whiteout-ridge",
    // v2 reserves player-error margin in deterministic ingredient routes.
    version: 2,
    title: "Whiteout Ridge",
    subtitle: "The avalanche special",
    difficulty: "double-black",
    description:
        "Five ingredients, one storm, and the whole mountain moving behind " +
        "you. Deliver to the emergency camp — if you get there first.",

    startZ: -260,
    finishZ: 560,
    baseCampZ: 588,
    runLength: 820,

    /** Storm light: flat, close, grey-white. The far range disappears. */
    atmosphere: {
        sunElevation: 18,
        sunIntensity: 2.2,
        sunTempWarm: 0.15,
        ambientIntensity: 1.6,
        ambientBlue: 1.25,
        fogDensity: 0.0165,
        fogHeightFalloff: 0.02,
        aerialStrength: 1.6,
        windStrength: 1.8,
        shaftStrength: 0,
    },

    /** The chase. Tuning lives here, beside the course it chases. */
    avalanche: {
        startBehind: 90,
        lead: 55,
        basePace: 13,
        catchup: 0.5,
        maxPace: 21,
    },

    terrain: {
        gate: { zInFrom: -330, zInTo: -270, zOutFrom: 560, zOutTo: 630 },
        laneHalf: 32,
        laneFeather: 64,

        jumps: [
            { lip: -130, runIn: 22, drop: 20, height: 1.5 },
            { lip: 470, runIn: 24, drop: 22, height: 1.7 },
        ],

        pipes: [],

        ridges: [
            // The divider between switchback and ridge shelf.
            {
                zFrom: 0, zTo: 340, featherZ: 32,
                xCentre: 0, halfWidth: 7, featherX: 8, height: 2.2,
            },
            // The exposed shelf itself, standing proud on the right.
            {
                zFrom: 0, zTo: 340, featherZ: 30,
                xCentre: 22, halfWidth: 9, featherX: 9, height: 1.2,
            },
        ],

        features: [],
    },

    rails: [
        // A storm-bent barrier rail on the switchback side.
        { ax: -24, az: 150, bx: -20, bz: 184, height: 1.0 },
    ],

    /**
     * Gust lanes: on the shelf the wind shoves toward the drop. Push is
     * m/s² of lateral acceleration while grounded inside the rectangle.
     */
    gusts: [
        { zFrom: 20, zTo: 170, xFrom: 6, xTo: 34, push: 3.4 },
        { zFrom: 200, zTo: 340, xFrom: 6, xTo: 34, push: -3.0 },
    ],

    zones: {
        cheese: {
            id: "cheese",
            name: "Storm Gate",
            z: [-226, -186],
            x: [-24, 24],
            maxSlope: 0.62,
            risk: 0.3,
            note: "Above the first beacon, while the wall is still far.",
        },
        onion: {
            id: "onion",
            name: "Deadfall Flats",
            z: [-92, -36],
            x: [-42, 42],
            maxSlope: 0.6,
            risk: 0.7,
            excludeInnerX: 26,
            note: "Off the line, early — the detour the avalanche prices.",
        },
        patty: {
            id: "patty",
            name: "Shelter Bowl",
            z: [56, 116],
            x: [-30, -8],
            maxSlope: 0.64,
            risk: 0.4,
            note: "The sheltered side. Longer, calmer, honest.",
        },
        tomato: {
            id: "tomato",
            name: "Exposure Shelf",
            z: [200, 270],
            x: [8, 28],
            maxSlope: 0.64,
            risk: 0.65,
            note: "Up in the wind. Faster, if the gusts let you keep it.",
        },
        lettuce: {
            id: "lettuce",
            name: "Beacon Line",
            z: [380, 430],
            x: [-18, 18],
            maxSlope: 0.66,
            risk: 0.45,
            note: "The rejoin, beacon to beacon, wall at your back.",
        },
    },

    features: [
        { z: -260, label: "RIDGE GATE" },
        { z: -130, label: "STORM HIT" },
        { z: 0, label: "THE COMMIT" },
        { z: 200, label: "EXPOSURE SHELF" },
        { z: 360, label: "REJOIN" },
        { z: 470, label: "LAST KICKER" },
        { z: 560, label: "EMERGENCY CAMP" },
    ],
    insideSpans: [
        { from: 0, to: 360, label: "RIDGE & SHELTER" },
    ],

    dressing: {
        biome: "storm",
        seed: 20260809,
        density: 0.9,
        laneClear: 30,
        zoneClear: 24,
    },

    secrets: [
        { id: "tape-1", x: -38, z: -150 },
        { id: "tape-2", x: 30, z: 250 },
        { id: "tape-3", x: 22, z: 500 },
    ],

    events: ["avalanche-special", "five-alarm"],
};
