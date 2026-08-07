/**
 * Summit Line — the original course, as data.
 *
 * Until this file existed the course lived in three unsynchronised copies:
 * WGSL literals in `heightBake.fragment.wgsl` (the only place the jump heights
 * were written at all), a hand-mirrored constants block in
 * `ingredientPlacement.js`, and a second mirror in `courseHud.js` whose pipe
 * windows had already drifted from `burgerRun._inPipe`'s. This is now the one
 * copy: the bake uploads it as primitives, placement derives its exclusions
 * from it, the HUD reads its features, and the drift class of bug is gone.
 *
 * Every number here reproduces the shipped Summit Line exactly. The proof is
 * `tools/full-game/bake-profile-windows.cjs`: the fingerprint after the
 * data-driven bake matches the one captured before it, so records, ghosts and
 * the measured medal thresholds all still describe this terrain.
 */

export const SUMMIT_LINE = {
    id: "summit-line",
    version: 1,
    title: "Summit Line",
    subtitle: "The classic descent",
    difficulty: "black",
    description:
        "Five hundred metres of open alpine piste: three kickers, two pipes, " +
        "and Burger Base Camp waiting at the bottom.",

    startZ: 0,
    finishZ: 520,
    baseCampZ: 548,
    /** Shown on course cards; also the HUD's progress denominator. */
    runLength: 520,

    terrain: {
        /**
         * Where the authored course blends into the natural snowfield along z.
         * Fade fully in between the first pair, fade fully out across the
         * second — everything outside is the untouched study.
         */
        gate: { zInFrom: -72, zInTo: -28, zOutFrom: 520, zOutTo: 585 },
        /** Full-strength lane half-width, and where its feather reaches zero. */
        laneHalf: 34,
        laneFeather: 68,

        /** Additive kickers, gated by the lane and the z gate. */
        jumps: [
            { lip: 50, runIn: 22, drop: 20, height: 1.55 },
            { lip: 184, runIn: 26, drop: 24, height: 1.80 },
            { lip: 496, runIn: 26, drop: 24, height: 1.75 },
        ],

        /**
         * Halfpipes. Not additive: inside its gate a pipe *replaces* the
         * terrain with a centreline-pinned target, which is what keeps its
         * floor rideable whatever dunes happen to cross it.
         */
        pipes: [
            {
                from: 292, to: 370, featherIn: 22, featherOut: 24,
                wallFrom: 5, wallTo: 21, amp: 4.4,
                pack: 0.24, packFalloff: 0.008,
                gateXFrom: 27, gateXTo: 40,
            },
            {
                from: 410, to: 450, featherIn: 22, featherOut: 20,
                wallFrom: 5, wallTo: 21, amp: 4.0,
                pack: 0.24, packFalloff: 0.008,
                gateXFrom: 27, gateXTo: 40,
            },
        ],

        /** Future primitives (banks, bowls, ridges, chutes, surface strips). */
        features: [],
    },

    /**
     * Ingredient zones. `pipeZone` marks the two that live inside a pipe and
     * get the softer wall rule; `excludeInnerX` carves the onion's annulus.
     */
    zones: {
        cheese: {
            id: "cheese",
            name: "Cheese Chute",
            z: [92, 140],
            x: [-26, 26],
            maxSlope: 0.62,
            risk: 0.25,
            note: "Upper mountain. First real line choice, taken at speed.",
        },
        patty: {
            id: "patty",
            name: "Patty Bowl",
            z: [224, 262],
            x: [-30, 30],
            maxSlope: 0.58,
            risk: 0.35,
            note: "Wide powder bowl. Several approaches, all of them fast.",
        },
        tomato: {
            id: "tomato",
            name: "Tomato Pipe",
            z: [300, 366],
            x: [-13, 13],
            maxSlope: 0.70,
            risk: 0.55,
            pipeZone: true,
            note: "In the north pipe. Rewards a transfer, punishes a lazy line.",
        },
        lettuce: {
            id: "lettuce",
            name: "Lettuce Ledge",
            z: [412, 458],
            x: [-18, 18],
            maxSlope: 0.66,
            risk: 0.45,
            pipeZone: true,
            note: "Lower technical line through the south pipe.",
        },
        onion: {
            id: "onion",
            name: "Onion Outrun",
            z: [230, 268],
            x: [-50, 50],
            maxSlope: 0.60,
            risk: 0.70,
            excludeInnerX: 26,
            note: "Outside the lane. A detour, paid for in time.",
        },
    },

    /**
     * Landmarks along the course, in downhill order. The trail-map HUD names
     * the next one; checkpoints and crash recovery will anchor to them.
     */
    features: [
        { z: 0, label: "SUMMIT GATE" },
        { z: 50, label: "FIRST HIT" },
        { z: 184, label: "RIDGELINE HIT" },
        { z: 292, label: "NORTH PIPE" },
        { z: 410, label: "SOUTH PIPE" },
        { z: 496, label: "FINISH KICKER" },
        { z: 520, label: "RUNOUT" },
    ],
    /**
     * Spans where the HUD keeps naming the feature the rider is inside rather
     * than the next one ahead. Wider than the pipes' scored windows on
     * purpose: the HUD should say "NORTH PIPE" for the whole feathered bowl,
     * while scoring counts only the true pipe.
     */
    insideSpans: [
        { from: 292, to: 394, label: "NORTH PIPE" },
        { from: 410, to: 470, label: "SOUTH PIPE" },
    ],

    dressing: {
        biome: "alpine",
        seed: 20260805,
    },

    /** Event ids this course offers, in menu order. */
    events: ["summit-stack"],
};
