/**
 * The vehicles, described once.
 *
 * Two so far: the classic snowboard RockerKaki has ridden for the life of this
 * project, and the rocket chair. A profile is data — a model, a set of
 * attachment points, and the numbers that place it — because the alternative is
 * per-vehicle offsets distributed across the rider, the contact writer and the
 * exhaust, which is the failure `boardSpec.js` exists to argue against.
 *
 * ---------------------------------------------------- where these numbers came from
 *
 * `rocket-chair-snowboard.glb` contains one unnamed mesh with one material:
 * 160,000 triangles of board, seat, booster and fins welded into a single
 * shell, under a node called `node_0`. Splitting it by loose parts yields 4,500
 * islands, none of which is "the seat" — so there is nothing in the file to
 * attach anything to, and reading it harder does not help.
 *
 * `tools/snow-burgers/measure-rocket-chair.py` therefore slices the mesh along
 * its length and profiles each slice for width, top and bottom. The result is
 * unambiguous, and every anchor below is read off it:
 *
 *   z +1.26 → +0.90   width narrows to 0.28, underside lifts to 0.19
 *                     — the nose, with its rocker. +Z is forward.
 *   z +0.90 → -0.73   underside at 0.029 … 0.079 … 0.030
 *                     — camber. Two contact patches with an arch between them,
 *                       which is a snowboard's own signature.
 *   z +0.34 → -0.16   top jumps 0.12 → 0.73, vertex density quadruples
 *                     — the seat. Pan at 0.39, backrest crest at 0.725.
 *   z -0.53 → -0.97   width swells to 0.582, underside reaches 0.000
 *                     — the booster and its fins. The lower fin is what
 *                       actually touches y = 0, not the board.
 *   z -1.00 → -1.26   width collapses 0.215 → 0.064 about y = 0.223
 *                     — the tail cone, tapering to a point.
 *
 * The last line of that is why the vehicle is not grounded on its bounding box.
 * `min.y` belongs to a fin hanging below the deck; grounding on it would float
 * the running surface three centimetres clear of the snow it is supposed to be
 * cutting. `contactY` is the underside of the contact patches instead.
 */

const BASE = (import.meta.env?.BASE_URL ?? "/") + "assets/models/snow-burgers/";

/**
 * @typedef {object} VehicleProfile
 * @property {string} id
 * @property {string} label
 * @property {string|null} url            runtime GLB, or null for the built-in board
 * @property {number} length              authored length along Z, metres
 * @property {number} contactY            underside of the contact patches, model space
 * @property {object} anchors             attachment points, model space, metres
 * @property {boolean} thrust             whether this vehicle burns fuel
 */

/**
 * The classic snowboard.
 *
 * Its geometry lives in `boardSpec.js` and its loading lives in
 * `rockerKaki.js`; this entry exists so the selector has two things to choose
 * between and so nothing has to special-case "no profile". It is the fallback
 * in every sense: if the rocket chair fails to load, this is what the rider is
 * still on.
 */
export const CLASSIC_SNOWBOARD = {
    id: "classic-snowboard",
    label: "Classic snowboard",
    url: null,
    length: 2.524,
    contactY: 0,
    anchors: {},
    thrust: false,
};

export const ROCKET_CHAIR = {
    id: "rocket-chair",
    label: "Rocket chair",
    url: BASE + "rocket-chair-snowboard.glb",
    length: 2.524,

    /**
     * The underside of the contact patches, in the model's own space.
     *
     * Measured at 0.029 near z = +0.90 and 0.030 near z = -0.73, arching to
     * 0.079 between them. Grounding here rather than on `min.y` = 0 is the
     * difference between a board resting on the snow and one hovering above it
     * while a fin does the touching.
     */
    contactY: 0.0295,

    /**
     * Effective edge: the span between the two contact patches.
     *
     * 1.63 m of a 2.524 m board, or 65%. The classic board's is 81%, which is
     * the difference between a snowboard and a snowboard with a rocket bolted
     * over its tail.
     */
    effectiveEdge: 1.63,
    waist: 0.43,

    anchors: {
        /** Seat pan, where the rider's weight goes. */
        seatAnchor: [0, 0.390, 0.180],
        /** Crest of the backrest, for checking the rider is not floating past it. */
        backrestTop: [0, 0.725, -0.100],
        /** Where the follow camera should look. */
        cameraTarget: [0, 0.560, -0.060],
        /** Collected ingredients are pulled to here. */
        cargoTrayAnchor: [0, 0.420, -0.320],

        frontContact: [0, 0.0295, 0.900],
        rearContact: [0, 0.0300, -0.730],
        leftEdgeContact: [-0.215, 0.070, 0.080],
        rightEdgeContact: [0.215, 0.070, 0.080],

        /**
         * The exhaust.
         *
         * This asset has one central booster, not the pair of side pods the
         * brief's node list assumes, and inventing a second one would mean
         * putting fire where there is no engine. `mainNozzle` sits just behind
         * the tail cone's point so the plume streams away from it instead of
         * through it; the two side vents are derived from the booster body's
         * measured radius at the fin root and exist to give the plume width,
         * not to claim the model has three engines.
         */
        mainNozzle: [0, 0.226, -1.285],
        leftVent: [-0.105, 0.223, -1.010],
        rightVent: [0.105, 0.223, -1.010],
        /** Unit vector the exhaust travels along, model space. */
        exhaustDirection: [0, 0, -1],
    },

    thrust: true,
};

/** @type {Record<string, VehicleProfile>} */
export const VEHICLES = {
    [CLASSIC_SNOWBOARD.id]: CLASSIC_SNOWBOARD,
    [ROCKET_CHAIR.id]: ROCKET_CHAIR,
};

export const DEFAULT_VEHICLE = CLASSIC_SNOWBOARD.id;
