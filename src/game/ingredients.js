/**
 * The ingredients, described once.
 *
 * Five imported models, five zones on the Summit Line, one colour each. Every
 * other part of the game layer — the order card, the HUD chips, the pickup
 * effect, the route validator, the assembly sequence — reads this file rather
 * than carrying its own copy of "what is a tomato", which is the same argument
 * `boardSpec.js` makes about the board.
 *
 * `size` is the finished world size the optimisation pipeline scaled each asset
 * to, measured off its own bounding box and recorded in
 * `art/source-assets/snow-burgers/OPTIMIZATION_REPORT.md`. It is repeated here
 * because the pedestal, the beacon and the pickup radius are all proportions of
 * it, and re-measuring a Draco-compressed mesh at load to recover a number the
 * pipeline already knew would be a second source of truth.
 */

// `import.meta.env` is Vite's, and is simply absent under bare Node. Falling
// back to "/" lets the unit tests import these definitions without a bundler;
// nothing in a test fetches a URL, but a throw at module scope would take the
// whole file with it.
const BASE = (import.meta.env?.BASE_URL ?? "/") + "assets/models/snow-burgers/";

/**
 * @typedef {object} IngredientDefinition
 * @property {string} id
 * @property {string} label      shown on the order card and the HUD
 * @property {string} url        runtime GLB
 * @property {[number,number,number]} colour  route colour, linear 0..1
 * @property {number} size       longest horizontal extent, metres
 * @property {number} lift       height of the model's centre above its pedestal
 * @property {number} spin       radians/second of idle rotation
 * @property {number} bob        vertical bob amplitude, metres
 */

/** @type {Record<string, IngredientDefinition>} */
export const INGREDIENTS = {
    cheese: {
        id: "cheese",
        label: "Cheese",
        url: BASE + "ingredient-cheese.glb",
        // Warm amber. Bright against snow without going fluorescent — the
        // beacon and the HUD chip both take their colour from here, so a value
        // that reads as "arcade" here reads as arcade in three places.
        colour: [0.98, 0.72, 0.24],
        size: 1.10,
        lift: 0.86,
        spin: 0.55,
        bob: 0.07,
    },
    patty: {
        id: "patty",
        label: "Patty",
        url: BASE + "ingredient-patty.glb",
        colour: [0.62, 0.33, 0.20],
        size: 1.25,
        lift: 0.80,
        spin: 0.42,
        bob: 0.05,
    },
    tomato: {
        id: "tomato",
        label: "Tomato",
        url: BASE + "ingredient-tomato.glb",
        colour: [0.90, 0.24, 0.20],
        size: 1.00,
        lift: 0.92,
        spin: 0.50,
        bob: 0.08,
    },
    lettuce: {
        id: "lettuce",
        label: "Lettuce",
        url: BASE + "ingredient-lettuce.glb",
        colour: [0.52, 0.80, 0.30],
        size: 1.25,
        lift: 0.88,
        spin: 0.62,
        bob: 0.09,
    },
    onion: {
        id: "onion",
        label: "Onion",
        url: BASE + "ingredient-onion.glb",
        colour: [0.86, 0.72, 0.86],
        size: 1.05,
        lift: 0.90,
        spin: 0.48,
        bob: 0.06,
    },
};

/** The completed reward. Not a route pickup — the finish awards it. */
export const BURGER_MODEL = BASE + "burger-complete.glb";

/** The second vehicle. Loaded by the vehicle profile, not by the ingredient field. */
export const ROCKET_CHAIR_MODEL = BASE + "rocket-chair-snowboard.glb";

export const INGREDIENT_IDS = Object.keys(INGREDIENTS);
