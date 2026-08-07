/**
 * Big Air Basin — the pipe, and the hill at the end of it.
 *
 * Four hundred metres of superpipe run the whole upper basin, deep enough to
 * lose the horizon in. Then the walls fall away, the lane opens onto an iced
 * in-run, and the mountain simply stops: a takeoff table, and a landing hill
 * that falls forty-eight metres away from under it. Everything before the lip
 * is about how fast you arrive at it.
 *
 * ----------------------------------------------------------------- the basin
 *
 * `terrainMacro` has no global downhill term — the descent any course rides is
 * whatever the dune and swell noise happens to do along its centreline, which
 * on this line is ±9 m of roll with uphill in it (measured;
 * `tools/big-air/profile-windows.cjs` prints the profile). So a jump on this
 * field cannot borrow its drop from the mountain. It has to dig its own, and
 * that is what the `skiJumps` primitive does: the hill is a basin cut into the
 * snowfield, the camp stands on its floor, and behind the camp the ground
 * climbs back onto the natural field over two hundred metres nobody can reach.
 * The course is named for the hole it makes.
 *
 * ------------------------------------------------------------- the numbers
 *
 * They are physics, not taste, and the physics were read rather than assumed.
 * `SURF_MAX` caps the classic board at 19.5 m/s and `controller.js` clamps a
 * ramp's carried vertical velocity to 9 m/s, which together fix the flight:
 * MEASURED at 2.51 s and 48 m, leaving the lip at z=299 and landing at z=348,
 * about 31 m below the table. The hill runs 120 m so a boosted rocket chair
 * still lands on snow that is falling away from it. A slow rider lands high on
 * the 50° knoll, a fast one low on the shallow runout; nobody lands on the
 * flat.
 *
 * Medal thresholds are MEASURED, like every other event here.
 */

export const BIG_AIR_BASIN = {
    id: "big-air-basin",
    version: 1,
    title: "Big Air Basin",
    subtitle: "Four hundred metres of pipe, and then the sky",
    difficulty: "double-black",
    description:
        "The long pipe runs the whole upper basin before the walls fall away " +
        "onto an iced in-run. One takeoff, one landing hill, one chance.",

    startZ: -300,
    finishZ: 470,
    baseCampZ: 512,
    runLength: 770,

    terrain: {
        gate: { zInFrom: -390, zInTo: -320, zOutFrom: 475, zOutTo: 595 },
        laneHalf: 30,
        laneFeather: 62,

        /**
         * None. Every additive kicker on this course would land inside a
         * replace-blended primitive and be erased by it — and the course does
         * not want a warm-up hit anyway. There is one jump here.
         */
        jumps: [],

        /**
         * The long pipe. One primitive, not three chained: `pipeGate`
         * accumulates with `max`, so two pipes crossfading along z leave a
         * band where the gate never reaches 1 and the natural field pushes
         * back up through the floor. A single 410 m span has no seam to have
         * that argument at.
         *
         * Deeper and wider than the Summit pipes — 6.4 m walls against 4.4,
         * transition starting at 6 m rather than 5 — because this one is the
         * course rather than a feature in it, and it is ridden for a minute.
         */
        pipes: [
            {
                from: -270, to: 122, featherIn: 34, featherOut: 32,
                wallFrom: 6, wallTo: 22, amp: 6.4,
                pack: 0.22, packFalloff: 0.008,
                gateXFrom: 27, gateXTo: 42,
            },
        ],

        ridges: [],

        /**
         * The hill. Fades in where the pipe has finished fading out — the two
         * replace regions never overlap, so there is no band where they share
         * a gate and argue about it. Between them the terrain is briefly, and
         * deliberately, just the mountain again: that gap is the moment the
         * basin opens up.
         */
        skiJumps: [
            {
                /**
                 * `holdFrom` is also where the profile takes its anchor
                 * height, so it is chosen off the measured mountain rather
                 * than for tidiness: the natural line sits at −4.3 m here and
                 * at +3.6 m thirty metres later. Anchoring on the bump made
                 * the pipe exit climb 9 m at up to 23°, which is a speed
                 * penalty collected immediately before the one takeoff.
                 */
                fadeInFrom: 154, holdFrom: 190,
                lipZ: 300,
                /**
                 * In-run: 110 m, of which the last 24 are the table. It drops
                 * 15 m — the natural line here CLIMBS between the pipe exit
                 * and the lip, and an in-run that arrives at a takeoff uphill
                 * is a takeoff that does not happen.
                 */
                inrunLen: 110, inrunDrop: 15,
                /**
                 * The table rises 7.2 m over its last 24, which is a 31° lip.
                 * That is deliberately steeper than it needs to be at top
                 * speed: the controller clamps carried vertical velocity to
                 * 9 m/s, and 0.6 of slope saturates that clamp at any speed
                 * above 15 m/s. A shallower lip metered the takeoff by how
                 * fast the rider happened to arrive, and the autopilot cleared
                 * it without leaving the ground at all on two runs in three.
                 */
                tableLen: 24, lipRise: 7.2,
                /**
                 * 48 m down over 120 m, steepest (50°) at the knoll. The
                 * length is the margin: the flight lands around 50 m out on
                 * the board and further on a boosted rocket chair, and the
                 * hill has to still be falling under the faster of those.
                 */
                hillLen: 120, hillDrop: 48,
                /** The floor the camp stands on. Barely tilted. */
                outrunLen: 130, outrunDrop: 3,
                /** The valley head, entirely outside the play radius. */
                closeLen: 200,
                /**
                 * The basin's own walls. Wide, and measured that way: at a
                 * 96 m outer gate the sides stood up at 66° — a quarry, not a
                 * mountain, and nothing the dressing could stand on. At 140 m
                 * they run under 30° at the deepest point and shallower up by
                 * the in-run, which is what a hill cut into a snowfield looks
                 * like, and it puts the grandstand slopes where a crowd could
                 * plausibly stand. The inner gate is tight for the same
                 * reason: a 116 m apron of dead-flat snow photographed as a
                 * runway on a plain, and the in-run should read as a track
                 * cut into the mountain with the mountain still either side.
                 */
                gateXFrom: 34, gateXTo: 140,
                bowl: 16,
            },
        ],

        features: [],
    },

    /**
     * Two rails, both outside the pipe: a rail down a halfpipe floor is a
     * grind through the one line the whole feature exists to make you carve.
     * One runs the in-run apron beside the ice, one the outrun past the
     * landing — style on the way in, style on the way home.
     */
    rails: [
        { ax: 24, az: 236, bx: 24, bz: 274, height: 1.0 },
        { ax: -16, az: 428, bx: -16, bz: 466, height: 1.05 },
    ],

    /**
     * The in-run is iced, the way a real one is. It is 72% less edge exactly
     * where the rider most wants to make a last correction, and it is visible
     * from the pipe exit — the glossy sheet the SSR pass lights stands where
     * the physics change, which is the only fair way to place them.
     */
    surfaces: [
        { zFrom: 230, zTo: 300, xFrom: -11, xTo: 11, hardness: 0.9 },
    ],

    zones: {
        cheese: {
            id: "cheese",
            name: "Drop-In",
            z: [-250, -200],
            x: [-14, 14],
            maxSlope: 0.70,
            risk: 0.25,
            note: "First hundred metres of pipe, before the speed arrives.",
        },
        patty: {
            id: "patty",
            name: "Mid Pipe",
            z: [-80, -20],
            x: [-14, 14],
            maxSlope: 0.70,
            risk: 0.4,
            pipeZone: true,
            note: "Deep in it, moving, with nothing to look at but wall.",
        },
        tomato: {
            id: "tomato",
            name: "The Opening",
            z: [84, 120],
            x: [-16, 16],
            maxSlope: 0.68,
            risk: 0.5,
            pipeZone: true,
            note: "Last stop in the pipe. The hill is already visible.",
        },
        lettuce: {
            id: "lettuce",
            name: "Landing Flat",
            z: [424, 468],
            x: [-24, 24],
            maxSlope: 0.62,
            risk: 0.35,
            note: "On the basin floor, past the hill. Easy — if you are upright.",
        },
        /**
         * Out of the pipe entirely, on the open mountain beside it.
         *
         * It was first authored on the in-run apron at z=186..236 and the
         * 100-seed sweep returned zero anchors for it: inside the jump's
         * lateral gate the apron is a dead-flat replace-blend, and outside
         * `excludeInnerX` there was nothing left that was both off the fast
         * line and not on the blend into natural ground. Out here the rider
         * has to climb the pipe wall, cross the rim and come back, which is
         * what an onion detour is supposed to cost.
         */
        onion: {
            id: "onion",
            name: "The Rim",
            z: [-162, -112],
            x: [-52, 52],
            maxSlope: 0.60,
            risk: 0.7,
            excludeInnerX: 34,
            note: "Over the pipe wall and out. You have to climb out to get it.",
        },
    },

    features: [
        { z: -300, label: "BASIN GATE" },
        { z: -270, label: "PIPE ENTRY" },
        { z: -60, label: "MID PIPE" },
        { z: 122, label: "PIPE EXIT" },
        { z: 190, label: "THE IN-RUN" },
        { z: 300, label: "TAKEOFF" },
        { z: 366, label: "LANDING HILL" },
        { z: 470, label: "FINISH" },
    ],
    insideSpans: [
        { from: -270, to: 150, label: "THE LONG PIPE" },
        { from: 288, to: 420, label: "THE BIG HILL" },
    ],

    /**
     * The venue. `venue.js` reads this and nothing else — a course without the
     * block gets no structures, which is every other course.
     *
     * The stands are not placed at authored x: `zFrom`..`zTo` in steps of
     * `spacing`, each row marches outward from `innerX` and drops a bank every
     * `rise` metres of height gained, up to `tiers`. That is why they sit on
     * the wall the whole length of the basin even though the wall is twice as
     * deep at the outrun as it is at the knoll.
     */
    venue: {
        /** The start gantry, at the head of the in-run. */
        gantry: { z: 196, halfWidth: 13, bays: 3 },
        /** Beside the landing hill, up on the wall, looking at the knoll. */
        judges: { x: -47, z: 356, ry: 1.45, height: 16 },
        stands: {
            zFrom: 326, zTo: 534, spacing: 11,
            innerX: 36, outerX: 128, rise: 3.6, tiers: 4,
        },
        flags: { zFrom: 306, zTo: 530, spacing: 16, halfWidth: 30 },
        /** Wind is what a jumper reads before committing. Say so. */
        windsocks: [
            { x: 15, z: 292 }, { x: -15, z: 292 },
            { x: 27, z: 348 }, { x: -27, z: 396 },
        ],
        lights: [
            { x: 34, z: 372, height: 15 }, { x: -34, z: 372, height: 15 },
            { x: 34, z: 452, height: 15 }, { x: -34, z: 452, height: 15 },
        ],
        lift: {
            x: -118, zFrom: 150, zTo: 520,
            pylons: 5, height: 13, chairs: 8,
        },
    },

    /**
     * Competition daylight. The mountain's default is a low, hazy 13° sun,
     * which on a course whose whole subject is a sixty-metre hole in the
     * ground erased the hole: the first showcase frames are a white void with
     * no depth cue in them anywhere. The sun goes up to 22° so the landing
     * hill's face shades against its walls, and the fog comes down to less
     * than half, because aerial perspective at this depth was doing the
     * erasing.
     */
    atmosphere: {
        sunElevation: 22,
        sunAzimuth: 62,
        sunIntensity: 4.6,
        ambientIntensity: 0.9,
        ambientBlue: 1.1,
        fogDensity: 0.0024,
    },

    dressing: {
        biome: "alpine",
        seed: 20260810,
        density: 0.85,
        laneClear: 44,
        zoneClear: 26,
    },

    secrets: [
        { id: "tape-1", x: -44, z: -224 },
        { id: "tape-2", x: 48, z: 226 },
        { id: "tape-3", x: -36, z: 452 },
    ],

    events: ["big-air-basin-stack"],
};
