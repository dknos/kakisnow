/**
 * Course primitives → bake-texture rows.
 *
 * Lives beside the course data rather than in the heightfield because the
 * encoding is pure and the tests want it in bare Node — heightfield.js pulls
 * renderer modules Node cannot resolve. The heightfield imports this; the
 * numbers land in the RawTexture the bake shader loops over.
 *
 * Row layout (RGBA texels; x = texel index, y = primitive row) — must match
 * the reader in `heightBake.fragment.wgsl`:
 *   kind 1, JUMP:  t0 = (1, lip, runIn, drop)         t1 = (height, 0, 0, 0)
 *   kind 2, PIPE:  t0 = (2, fadeInFrom, from, to)     t1 = (fadeOutTo, wallFrom, wallTo, amp)
 *                  t2 = (pack, packFalloff, gateXFrom, gateXTo)
 */

export const PRIM_COLS = 4;
export const MAX_PRIMS = 32;

/**
 * Flatten a course's terrain block into primitive rows.
 *
 * @param {object} terrain a course definition's `terrain` block
 * @param {Float32Array} data PRIM_COLS*MAX_PRIMS*4 floats, zeroed here
 * @returns {number} how many rows were written
 */
export function encodeCoursePrimitives(terrain, data) {
    data.fill(0);
    let row = 0;
    const put = (col, a, b, c, d) => {
        const o = (row * PRIM_COLS + col) * 4;
        data[o] = a; data[o + 1] = b; data[o + 2] = c; data[o + 3] = d;
    };

    for (const j of terrain.jumps ?? []) {
        put(0, 1, j.lip, j.runIn, j.drop);
        put(1, j.height, 0, 0, 0);
        row++;
    }
    for (const q of terrain.pipes ?? []) {
        put(0, 2, q.from - q.featherIn, q.from, q.to);
        put(1, q.to + q.featherOut, q.wallFrom, q.wallTo, q.amp);
        put(2, q.pack, q.packFalloff, q.gateXFrom, q.gateXTo);
        row++;
    }

    if (row > MAX_PRIMS) {
        throw new Error(
            `course encodes ${row} primitives; the bake texture holds ${MAX_PRIMS}`
        );
    }
    return row;
}
