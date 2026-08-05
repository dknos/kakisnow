/**
 * The snowboard, described once.
 *
 * Two systems have to agree about this board or the illusion collapses: the
 * visual adapter in `rockerKaki.js` that places the mesh, and the contact
 * writer in `snowContact.js` that cuts the trench. Disagree by a few
 * centimetres and the board rides *beside* its own groove — which reads
 * instantly as a decal sliding under a prop, and is exactly the failure this
 * file exists to make impossible.
 *
 * Everything here is one authored length and a set of proportions measured off
 * the shipped asset, so the mesh is the source of truth and this file is its
 * description. That split is what makes the board resizable: `S.boardScale`
 * moves the length, every proportion follows it, and the trench stays the
 * board's own footprint at any size. Scaling the mesh without scaling the
 * groove would put a bigger board in a smaller board's track.
 *
 * `RockerKaki._loadBoard` re-measures the import and warns if the asset and
 * these proportions ever stop agreeing.
 */

/**
 * The asset's authored length, metres, tip to tail. It arrives at real-world
 * scale, so this is the size it already is rather than a size imposed on it.
 */
export const BOARD_BASE_LENGTH = 2.524;

/**
 * Proportions of the length, measured off the mesh.
 *
 * `waist` is the narrowest point and is the width that matters: sidecut makes
 * the tips 40% wider than the section actually pressed into the snow, and
 * cutting the trench at the tip width leaves the board sitting in a groove half
 * again too wide for it.
 *
 * `effectiveEdge` is the run between the contact points, measured as the span
 * whose base sits at or below the contact plane. It comes out at 81% of the
 * length, the rest being tip and tail rocker — which is why the trench is
 * shorter than the board is long.
 *
 * `camber` is how far the base at the waist stands above the contact points
 * unweighted. It is why the mesh touches down at two patches rather than one.
 *
 * `deck` is the topsheet at the waist, where the rider sits — not at the tips,
 * which stand higher because the rocker lifts the whole section. `envelope` is
 * that full vertical extent, and exists only so the import has a second
 * measurement to check against; width alone cannot catch a re-export that
 * changed the camber or the rocker.
 */
const RATIO = {
    width: 0.5317 / BOARD_BASE_LENGTH,
    waist: 0.3820 / BOARD_BASE_LENGTH,
    effectiveEdge: 2.0400 / BOARD_BASE_LENGTH,
    camber: 0.0246 / BOARD_BASE_LENGTH,
    deck: 0.0599 / BOARD_BASE_LENGTH,
    envelope: 0.0764 / BOARD_BASE_LENGTH,
};

/**
 * The board at its current scale, in metres.
 *
 * A live object rather than constants, because the size is a setting. Consumers
 * read fields off it every frame; nothing here allocates.
 */
export const BOARD = {
    scale: 1,
    length: 0,
    width: 0,
    waist: 0,
    effectiveEdge: 0,
    camber: 0,
    deck: 0,
    envelope: 0,
    /** Half the effective edge — the trench's long half-axis. */
    halfEdge: 0,
    /** Half the waist — the trench's short half-axis. */
    halfWaist: 0,
};

/**
 * The trench's long-to-short axis ratio.
 *
 * Scale-invariant, because it is a ratio of two proportions of the same length.
 * The brush's elongation therefore never has to be recomputed when the board
 * resizes — only its radius does.
 */
export const EDGE_TO_WAIST = RATIO.effectiveEdge / RATIO.waist;

/** @param {number} scale multiple of the authored length */
export function setBoardScale(scale) {
    const s = Math.max(0.1, scale || 1);
    BOARD.scale = s;
    BOARD.length = BOARD_BASE_LENGTH * s;
    BOARD.width = BOARD.length * RATIO.width;
    BOARD.waist = BOARD.length * RATIO.waist;
    BOARD.effectiveEdge = BOARD.length * RATIO.effectiveEdge;
    BOARD.camber = BOARD.length * RATIO.camber;
    BOARD.deck = BOARD.length * RATIO.deck;
    BOARD.envelope = BOARD.length * RATIO.envelope;
    BOARD.halfEdge = BOARD.effectiveEdge * 0.5;
    BOARD.halfWaist = BOARD.waist * 0.5;
    return BOARD;
}

setBoardScale(1);
