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
 * Every number here was measured off the shipped asset rather than authored,
 * so the mesh is the source of truth and this file is its description.
 * `RockerKaki._loadBoard` re-measures on import and warns if the two ever stop
 * agreeing.
 */

/**
 * Tip to tail, metres. The asset is authored at real-world scale, so this is
 * the size it already is rather than a size imposed on it.
 */
export const BOARD_LENGTH = 2.524;

/** Widest point, metres. That is out near the tips, not under the rider. */
export const BOARD_WIDTH = 0.533;

/**
 * Waist, metres — the narrowest point, at the middle.
 *
 * This is the width that matters: sidecut means the tips are 40% wider than
 * the section actually pressed into the snow, and cutting the trench at the
 * tip width would leave the board sitting in a groove half again too wide.
 */
export const BOARD_WAIST = 0.382;

/**
 * Effective edge, metres: the run between the contact points, where the base
 * reaches the snow at all.
 *
 * Measured as the span whose base sits at or below the contact plane. It comes
 * out at 81% of the length, the rest being tip and tail rocker — which is what
 * a real cambered board gives up, and is why the trench is shorter than the
 * board is long.
 */
export const EFFECTIVE_EDGE = 2.04;

/**
 * Camber, metres: unweighted, the base at the waist stands this far above the
 * contact points.
 *
 * It is why the mesh touches down at two patches rather than one, and it is
 * the gap the rider's weight closes. The visual adapter grounds the *contact
 * points*, not the waist, so the board sits on the snow the way the geometry
 * says it should.
 */
export const BOARD_CAMBER = 0.025;

/**
 * Deck height above the contact plane at the waist — where the rider sits.
 *
 * At the waist specifically. The tips sit higher, because the rocker lifts the
 * whole section, and seating the rider on the tip figure floats her above the
 * deck by the difference.
 */
export const BOARD_DECK = 0.060;

/**
 * Total vertical extent, metres: the tips' topsheet down to the contact plane.
 *
 * Not a placement number — nothing is positioned from it. It is here so the
 * adapter has a second measurement to check the imported mesh against, since
 * width alone cannot catch a re-export that changed the camber or the rocker.
 */
export const BOARD_ENVELOPE = 0.076;

/** Half the effective edge. The trench's long half-axis. */
export const HALF_EDGE = EFFECTIVE_EDGE * 0.5;

/** Half the waist. The trench's short half-axis. */
export const HALF_WAIST = BOARD_WAIST * 0.5;
