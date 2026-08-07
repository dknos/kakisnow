/**
 * CollisionWorld — the static-obstacle index for Snow-Burgers.
 *
 * Pure scalar math, zero imports. The controller queries this every physics
 * step, and the same file runs under node:test with no renderer — which is
 * why there is no Babylon Vector3 anywhere in here: the one thing both
 * consumers agree on is plain numbers.
 *
 * ------------------------------------------------------------------ the hash
 *
 * A spatial hash over XZ only. The mountain is a heightfield: obstacles are
 * spread across a huge horizontal area and a trivial vertical one, so hashing
 * the Y axis would triple the bookkeeping to distinguish nothing. Y is
 * resolved in the narrow phase instead (a sweep over a tree canopy misses on
 * the closest-point math, not on cell membership).
 *
 * A collider is registered in every cell its XZ AABB overlaps, so a query
 * only ever has to look at the cells under its own footprint. Cell keys are
 * packed integers rather than strings because string keys allocate on every
 * lookup, and the whole point of the query API is that the per-frame path
 * allocates nothing.
 *
 * ------------------------------------------------------------- allocation rules
 *
 * `queryCircle` writes into a caller-owned array; `sweepSphere` and `nearest`
 * each return ONE shared result object, reused on every call. Read what you
 * need from a result before issuing the next query — holding the reference
 * across queries reads the later query's answer. This is deliberate: these
 * run per frame per rider, and a fresh result object per call is garbage the
 * frame budget pays for.
 *
 * Deduplication across cells (a collider straddling two cells must not be
 * reported twice) uses a query stamp on each record instead of a Set,
 * for the same reason.
 *
 * ------------------------------------------------------------------ the sweep
 *
 * Sphere-vs-sphere is solved analytically (one quadratic — exact, cheap).
 * Capsule, segment and box sweeps are sampled: the sweep is walked in steps
 * of `max(r * 0.5, 0.15)` metres, and the first penetrating interval is
 * refined by bisection. Sampling is correct-enough here because a frame's
 * sweep is short (a rider at 20 m/s moves ~0.33 m in a 60 Hz frame), and the
 * iteration count is clamped at MAX_SWEEP_STEPS so a pathological teleport
 * degrades to a coarser step instead of a stall. The contact normal is
 * guaranteed unit-length and finite: when the geometric normal degenerates
 * (dead-centre overlap), it falls back to the reversed sweep direction, and
 * failing that to straight up — deflection code downstream must never see
 * NaN or a zero vector.
 *
 * Box yaw follows Babylon's Matrix.RotationY row-vector convention
 * (local→world: wx = cos·lx + sin·lz, wz = −sin·lx + cos·lz), so a `ry`
 * captured from `MountainDressing.propRecords` drops in unchanged.
 */

// ------------------------------------------------------------------ constants

/**
 * Cell-key packing: key = (cx + HALF) * SPAN + (cz + HALF). Unique while
 * |cx|,|cz| < 32768 — with the default 8 m cells that is a ±262 km world,
 * versus a course a few hundred metres long.
 */
const KEY_HALF = 32768;
const KEY_SPAN = 65536;

/**
 * Iteration clamp for sampled sweeps. A frame-length sweep at the documented
 * step never gets near this; it exists so one bad (teleport-sized) sweep
 * costs a coarser step, not an unbounded loop.
 */
const MAX_SWEEP_STEPS = 256;
/** Bisection refinements after the sampled walk brackets a hit. */
const REFINE_STEPS = 20;

const EPS = 1e-9;

// ------------------------------------------------------------ shared scratch
// Module scope, single-threaded by construction. See the allocation rules
// in the header: one result object per query type, reused every call.

/** The ONE sweepSphere result object. Copy fields out before the next sweep. */
const _sweepResult = { collider: null, t: 0, nx: 0, ny: 0, nz: 0, px: 0, py: 0, pz: 0 };
/** The ONE nearest() result object. Copy fields out before the next query. */
const _nearestResult = { collider: null, distSq: 0 };
/** Closest-point scratch, filled by the core-distance helpers. */
const _cp = { x: 0, y: 0, z: 0 };
/** Narrow-phase scratch: the candidate hit under evaluation. */
const _hit = { t: 0, nx: 0, ny: 0, nz: 0, px: 0, py: 0, pz: 0 };

// ------------------------------------------------------- core-distance helpers
// Each returns the distance from a point to the collider's CORE (segment
// axis, box solid, sphere centre) and leaves the closest core point in _cp.
// The narrow phase and nearest() both build on these, so surface distance is
// always core distance minus the core's radius, computed in one place each.

/** Point to capsule/segment axis. */
function segCoreDist(rec, px, py, pz) {
    const ex = rec.bx - rec.ax;
    const ey = rec.by - rec.ay;
    const ez = rec.bz - rec.az;
    const ee = ex * ex + ey * ey + ez * ez;
    let t = 0;
    if (ee > EPS) {
        t = ((px - rec.ax) * ex + (py - rec.ay) * ey + (pz - rec.az) * ez) / ee;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
    }
    _cp.x = rec.ax + ex * t;
    _cp.y = rec.ay + ey * t;
    _cp.z = rec.az + ez * t;
    const dx = px - _cp.x;
    const dy = py - _cp.y;
    const dz = pz - _cp.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Point to solid yaw-rotated box: rotate the point into the box frame by
 * −ry, clamp to the half extents, rotate back. Returns 0 for a point inside
 * (the clamp is then the identity), which is exactly what nearest() wants a
 * trigger volume to report.
 */
function boxCoreDist(rec, px, py, pz) {
    const tx = px - rec.x;
    const ty = py - rec.y;
    const tz = pz - rec.z;
    const lx = rec.cos * tx - rec.sin * tz;
    const lz = rec.sin * tx + rec.cos * tz;
    let cx = lx;
    if (cx < -rec.hx) cx = -rec.hx;
    else if (cx > rec.hx) cx = rec.hx;
    let cy = ty;
    if (cy < -rec.hy) cy = -rec.hy;
    else if (cy > rec.hy) cy = rec.hy;
    let cz = lz;
    if (cz < -rec.hz) cz = -rec.hz;
    else if (cz > rec.hz) cz = rec.hz;
    _cp.x = rec.x + rec.cos * cx + rec.sin * cz;
    _cp.y = rec.y + cy;
    _cp.z = rec.z - rec.sin * cx + rec.cos * cz;
    const dx = px - _cp.x;
    const dy = py - _cp.y;
    const dz = pz - _cp.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Point to sphere centre. */
function sphereCoreDist(rec, px, py, pz) {
    _cp.x = rec.x;
    _cp.y = rec.y;
    _cp.z = rec.z;
    const dx = px - rec.x;
    const dy = py - rec.y;
    const dz = pz - rec.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function coreDist(rec, px, py, pz) {
    if (rec.shape === "box") return boxCoreDist(rec, px, py, pz);
    if (rec.shape === "sphere") return sphereCoreDist(rec, px, py, pz);
    return segCoreDist(rec, px, py, pz);
}

/** The core's own radius: what surface distance subtracts from core distance. */
function coreRadius(rec) {
    return rec.shape === "box" ? 0 : rec.r;
}

// -------------------------------------------------------------- narrow phase

/**
 * Fallback normal when the geometric one degenerates: the reversed sweep
 * direction (push the rider back where it came from), or straight up when
 * the sweep itself has no length. Never zero, never NaN — the contract the
 * deflection code relies on.
 */
function fallbackNormal(dx, dy, dz) {
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l > EPS) {
        _hit.nx = -dx / l;
        _hit.ny = -dy / l;
        _hit.nz = -dz / l;
    } else {
        _hit.nx = 0;
        _hit.ny = 1;
        _hit.nz = 0;
    }
}

/**
 * A box the sweep STARTS inside has no closest surface point to aim a normal
 * along (the clamp returned the query point itself). Use the shallowest face
 * instead — the cheapest way out of the box is the direction the response
 * should push.
 */
function insideBoxNormal(rec, px, py, pz) {
    const tx = px - rec.x;
    const ty = py - rec.y;
    const tz = pz - rec.z;
    const lx = rec.cos * tx - rec.sin * tz;
    const lz = rec.sin * tx + rec.cos * tz;
    const depthX = rec.hx - Math.abs(lx);
    const depthY = rec.hy - Math.abs(ty);
    const depthZ = rec.hz - Math.abs(lz);
    let lnx = 0;
    let lny = 0;
    let lnz = 0;
    if (depthX <= depthY && depthX <= depthZ) lnx = lx >= 0 ? 1 : -1;
    else if (depthY <= depthZ) lny = ty >= 0 ? 1 : -1;
    else lnz = lz >= 0 ? 1 : -1;
    _hit.nx = rec.cos * lnx + rec.sin * lnz;
    _hit.ny = lny;
    _hit.nz = -rec.sin * lnx + rec.cos * lnz;
}

/**
 * Analytic swept sphere vs static sphere: |p0 + t·d − c|² = (r + rec.r)².
 * Exact, so the contact point genuinely lies on the collider's surface.
 * Fills _hit; returns true on a hit with t in [0, 1].
 */
function narrowSphere(rec, px, py, pz, dx, dy, dz, r) {
    const R = r + rec.r;
    const mx = px - rec.x;
    const my = py - rec.y;
    const mz = pz - rec.z;
    const c = mx * mx + my * my + mz * mz - R * R;
    if (c <= 0) {
        // Already overlapping at the start of the sweep: report t = 0 with a
        // normal from the collider centre toward the sphere, so response code
        // can still push the rider out.
        const l = Math.sqrt(mx * mx + my * my + mz * mz);
        if (l > EPS) {
            _hit.nx = mx / l;
            _hit.ny = my / l;
            _hit.nz = mz / l;
        } else {
            fallbackNormal(dx, dy, dz);
        }
        _hit.t = 0;
        _hit.px = rec.x + _hit.nx * rec.r;
        _hit.py = rec.y + _hit.ny * rec.r;
        _hit.pz = rec.z + _hit.nz * rec.r;
        return true;
    }
    const a = dx * dx + dy * dy + dz * dz;
    if (a < EPS) return false;
    const b = mx * dx + my * dy + mz * dz;
    if (b >= 0) return false; // moving away, and not overlapping
    const disc = b * b - a * c;
    if (disc < 0) return false;
    const t = (-b - Math.sqrt(disc)) / a;
    if (t < 0 || t > 1) return false;
    const hx = px + dx * t;
    const hy = py + dy * t;
    const hz = pz + dz * t;
    // |h − c| = R > 0 here by construction, so this normalize is safe.
    _hit.nx = (hx - rec.x) / R;
    _hit.ny = (hy - rec.y) / R;
    _hit.nz = (hz - rec.z) / R;
    _hit.t = t;
    _hit.px = hx - _hit.nx * r;
    _hit.py = hy - _hit.ny * r;
    _hit.pz = hz - _hit.nz * r;
    return true;
}

/**
 * Sampled swept sphere vs capsule/segment/box. Step = max(r · 0.5, 0.15) m,
 * iteration count clamped at MAX_SWEEP_STEPS (see header for why sampling is
 * acceptable here); the bracketed interval is bisected REFINE_STEPS times, so
 * the reported t is far tighter than the step. Fills _hit; returns true on a
 * hit with t in [0, 1].
 */
function narrowSampled(rec, px, py, pz, dx, dy, dz, r) {
    const core = coreRadius(rec);
    const R = r + core;
    const d0 = coreDist(rec, px, py, pz);
    if (d0 < R) {
        // Overlapping at the start of the sweep.
        if (d0 > EPS) {
            _hit.nx = (px - _cp.x) / d0;
            _hit.ny = (py - _cp.y) / d0;
            _hit.nz = (pz - _cp.z) / d0;
        } else if (rec.shape === "box") {
            insideBoxNormal(rec, px, py, pz);
        } else {
            fallbackNormal(dx, dy, dz);
        }
        _hit.t = 0;
        _hit.px = _cp.x + _hit.nx * core;
        _hit.py = _cp.y + _hit.ny * core;
        _hit.pz = _cp.z + _hit.nz * core;
        return true;
    }
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < EPS) return false;
    const step = Math.max(r * 0.5, 0.15);
    let steps = Math.ceil(len / step);
    if (steps > MAX_SWEEP_STEPS) steps = MAX_SWEEP_STEPS;
    let tPrev = 0;
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const d = coreDist(rec, px + dx * t, py + dy * t, pz + dz * t);
        if (d < R) {
            // Penetration between tPrev (outside) and t (inside): bisect to
            // the crossing, keeping the first penetrating parameter.
            let lo = tPrev;
            let hi = t;
            for (let k = 0; k < REFINE_STEPS; k++) {
                const mid = (lo + hi) * 0.5;
                const dm = coreDist(rec, px + dx * mid, py + dy * mid, pz + dz * mid);
                if (dm < R) hi = mid;
                else lo = mid;
            }
            const th = hi;
            const sx = px + dx * th;
            const sy = py + dy * th;
            const sz = pz + dz * th;
            const dh = coreDist(rec, sx, sy, sz); // refills _cp at the hit
            if (dh > EPS) {
                _hit.nx = (sx - _cp.x) / dh;
                _hit.ny = (sy - _cp.y) / dh;
                _hit.nz = (sz - _cp.z) / dh;
            } else if (rec.shape === "box") {
                insideBoxNormal(rec, sx, sy, sz);
            } else {
                fallbackNormal(dx, dy, dz);
            }
            _hit.t = th;
            _hit.px = _cp.x + _hit.nx * core;
            _hit.py = _cp.y + _hit.ny * core;
            _hit.pz = _cp.z + _hit.nz * core;
            return true;
        }
        tPrev = t;
    }
    return false;
}

/** kinds may be null (any), a Set, or an array. Checked per record, so no allocation. */
function kindMatches(kinds, kind) {
    if (!kinds) return true;
    if (typeof kinds.has === "function") return kinds.has(kind);
    for (let i = 0; i < kinds.length; i++) {
        if (kinds[i] === kind) return true;
    }
    return false;
}

// ------------------------------------------------------------------ the world

export class CollisionWorld {
    /**
     * @param {object} [opts]
     * @param {number} [opts.cellSize] XZ hash cell size in metres. 8 matches
     *   the dressing's typical prop spacing: most cells hold zero or one
     *   collider, so a query touches a handful of records, not a band's worth.
     */
    constructor({ cellSize = 8 } = {}) {
        this.cellSize = cellSize;
        /** @type {Map<number, object>} id → collider record */
        this._colliders = new Map();
        /** @type {Map<number, object[]>} packed cell key → records in that cell */
        this._cells = new Map();
        this._nextId = 1;
        /** Query stamp for cross-cell dedupe; monotonically increasing. */
        this._stamp = 0;
    }

    // ------------------------------------------------------------- add/remove

    /**
     * @param {{x:number, y:number, z:number, r:number, kind?:string, data?:*}} s
     * @returns {number} collider id
     */
    addSphere({ x, y, z, r, kind, data }) {
        const rec = this._makeRecord("sphere", kind, data);
        rec.x = x;
        rec.y = y;
        rec.z = z;
        rec.r = r;
        return this._insert(rec, x - r, x + r, z - r, z + r);
    }

    /**
     * A capsule between two points — the vertical tree trunk case, but the
     * axis may lean (bent trees, ice shards).
     * @param {{ax:number, ay:number, az:number, bx:number, by:number, bz:number,
     *          r:number, kind?:string, data?:*}} c
     * @returns {number} collider id
     */
    addCapsule({ ax, ay, az, bx, by, bz, r, kind, data }) {
        const rec = this._makeRecord("capsule", kind, data);
        rec.ax = ax;
        rec.ay = ay;
        rec.az = az;
        rec.bx = bx;
        rec.by = by;
        rec.bz = bz;
        rec.r = r;
        return this._insert(
            rec,
            Math.min(ax, bx) - r, Math.max(ax, bx) + r,
            Math.min(az, bz) - r, Math.max(az, bz) + r
        );
    }

    /**
     * A yaw-rotated box (half extents hx/hy/hz). `ry` uses Babylon's
     * Matrix.RotationY convention — see the module header.
     * @param {{x:number, y:number, z:number, hx:number, hy:number, hz:number,
     *          ry?:number, kind?:string, data?:*}} b
     * @returns {number} collider id
     */
    addBox({ x, y, z, hx, hy, hz, ry = 0, kind, data }) {
        const rec = this._makeRecord("box", kind, data);
        rec.x = x;
        rec.y = y;
        rec.z = z;
        rec.hx = hx;
        rec.hy = hy;
        rec.hz = hz;
        rec.ry = ry;
        rec.cos = Math.cos(ry);
        rec.sin = Math.sin(ry);
        // The rotated box's world-axis extents, for cell membership.
        const ex = Math.abs(rec.cos) * hx + Math.abs(rec.sin) * hz;
        const ez = Math.abs(rec.sin) * hx + Math.abs(rec.cos) * hz;
        return this._insert(rec, x - ex, x + ex, z - ez, z + ez);
    }

    /**
     * A thin capsule for rails and edges: geometrically identical to
     * addCapsule, kept as its own shape name so gameplay can tell "I hit a
     * tree" from "I am on a rail" without inspecting radii.
     * @param {{ax:number, ay:number, az:number, bx:number, by:number, bz:number,
     *          r:number, kind?:string, data?:*}} s kind is usually "rail"
     * @returns {number} collider id
     */
    addSegment({ ax, ay, az, bx, by, bz, r, kind, data }) {
        const rec = this._makeRecord("segment", kind, data);
        rec.ax = ax;
        rec.ay = ay;
        rec.az = az;
        rec.bx = bx;
        rec.by = by;
        rec.bz = bz;
        rec.r = r;
        return this._insert(
            rec,
            Math.min(ax, bx) - r, Math.max(ax, bx) + r,
            Math.min(az, bz) - r, Math.max(az, bz) + r
        );
    }

    /**
     * Remove one collider from the index, including every cell it occupies.
     * @param {number} id
     * @returns {boolean} whether the id was known
     */
    remove(id) {
        const rec = this._colliders.get(id);
        if (!rec) return false;
        const cs = this.cellSize;
        const cx0 = Math.floor(rec.minX / cs);
        const cx1 = Math.floor(rec.maxX / cs);
        const cz0 = Math.floor(rec.minZ / cs);
        const cz1 = Math.floor(rec.maxZ / cs);
        for (let cz = cz0; cz <= cz1; cz++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const key = (cx + KEY_HALF) * KEY_SPAN + (cz + KEY_HALF);
                const cell = this._cells.get(key);
                if (!cell) continue;
                const i = cell.indexOf(rec);
                if (i >= 0) {
                    // Swap-remove: order inside a cell carries no meaning, and
                    // splice would allocate its removed-elements array.
                    cell[i] = cell[cell.length - 1];
                    cell.pop();
                }
                if (cell.length === 0) this._cells.delete(key);
            }
        }
        this._colliders.delete(id);
        return true;
    }

    /** Drop every collider. Ids keep counting up so stale ids never resolve. */
    clear() {
        this._colliders.clear();
        this._cells.clear();
    }

    // ---------------------------------------------------------------- queries

    /**
     * Broad phase: push every collider record whose XZ cells intersect the
     * circle into `out`. Cell-granular by design — the caller narrows.
     *
     * `out.length` is reset to 0 first: the intended usage is one scratch
     * array reused every frame, and append semantics would make forgetting to
     * clear it the default bug.
     *
     * @param {number} x
     * @param {number} z
     * @param {number} r
     * @param {object[]} out caller-owned, reused array
     * @returns {number} count pushed (=== out.length)
     */
    queryCircle(x, z, r, out) {
        out.length = 0;
        const cs = this.cellSize;
        const stamp = ++this._stamp;
        const cx0 = Math.floor((x - r) / cs);
        const cx1 = Math.floor((x + r) / cs);
        const cz0 = Math.floor((z - r) / cs);
        const cz1 = Math.floor((z + r) / cs);
        const rr = r * r;
        for (let cz = cz0; cz <= cz1; cz++) {
            const minZ = cz * cs;
            let qz = z;
            if (qz < minZ) qz = minZ;
            else if (qz > minZ + cs) qz = minZ + cs;
            const dz = z - qz;
            for (let cx = cx0; cx <= cx1; cx++) {
                const minX = cx * cs;
                let qx = x;
                if (qx < minX) qx = minX;
                else if (qx > minX + cs) qx = minX + cs;
                const dx = x - qx;
                // Closest point of the cell rect to the circle centre: the
                // cell is in range only if the circle actually reaches it,
                // not merely the circle's AABB.
                if (dx * dx + dz * dz > rr) continue;
                const cell = this._cells.get((cx + KEY_HALF) * KEY_SPAN + (cz + KEY_HALF));
                if (!cell) continue;
                for (let i = 0; i < cell.length; i++) {
                    const rec = cell[i];
                    if (rec._q === stamp) continue;
                    rec._q = stamp;
                    out.push(rec);
                }
            }
        }
        return out.length;
    }

    /**
     * Narrow phase: sweep a sphere of radius r from (x0,y0,z0) to (x1,y1,z1)
     * and report the earliest contact, or null.
     *
     * Returns THE shared result object — see the module header. Fields:
     * `collider` (the record), `t` (0..1 along the sweep), `nx/ny/nz` (unit
     * contact normal pointing off the collider, back toward the sweep), and
     * `px/py/pz` (contact point on the collider surface; exact for spheres,
     * within the documented sample step for capsule/segment/box).
     *
     * @returns {{collider:object, t:number, nx:number, ny:number, nz:number,
     *            px:number, py:number, pz:number}|null}
     */
    sweepSphere(x0, y0, z0, x1, y1, z1, r) {
        const cs = this.cellSize;
        const stamp = ++this._stamp;
        const minX = (x0 < x1 ? x0 : x1) - r;
        const maxX = (x0 > x1 ? x0 : x1) + r;
        const minZ = (z0 < z1 ? z0 : z1) - r;
        const maxZ = (z0 > z1 ? z0 : z1) + r;
        const cx0 = Math.floor(minX / cs);
        const cx1 = Math.floor(maxX / cs);
        const cz0 = Math.floor(minZ / cs);
        const cz1 = Math.floor(maxZ / cs);
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dz = z1 - z0;
        let bestT = Infinity;
        let best = null;
        let bnx = 0;
        let bny = 1;
        let bnz = 0;
        let bpx = 0;
        let bpy = 0;
        let bpz = 0;
        for (let cz = cz0; cz <= cz1; cz++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const cell = this._cells.get((cx + KEY_HALF) * KEY_SPAN + (cz + KEY_HALF));
                if (!cell) continue;
                for (let i = 0; i < cell.length; i++) {
                    const rec = cell[i];
                    if (rec._q === stamp) continue;
                    rec._q = stamp;
                    // Cheap XZ AABB cull before any real math.
                    if (rec.maxX < minX || rec.minX > maxX
                        || rec.maxZ < minZ || rec.minZ > maxZ) continue;
                    const hit = rec.shape === "sphere"
                        ? narrowSphere(rec, x0, y0, z0, dx, dy, dz, r)
                        : narrowSampled(rec, x0, y0, z0, dx, dy, dz, r);
                    if (hit && _hit.t < bestT) {
                        bestT = _hit.t;
                        best = rec;
                        bnx = _hit.nx;
                        bny = _hit.ny;
                        bnz = _hit.nz;
                        bpx = _hit.px;
                        bpy = _hit.py;
                        bpz = _hit.pz;
                    }
                }
            }
        }
        if (!best) return null;
        _sweepResult.collider = best;
        _sweepResult.t = bestT;
        _sweepResult.nx = bnx;
        _sweepResult.ny = bny;
        _sweepResult.nz = bnz;
        _sweepResult.px = bpx;
        _sweepResult.py = bpy;
        _sweepResult.pz = bpz;
        return _sweepResult;
    }

    /**
     * Nearest collider whose kind passes the filter, within maxR of (x,y,z).
     *
     * Distance is to the collider's SURFACE, not its centre — 0 when the
     * point is inside — because both users of this call care about surfaces:
     * triggers ("am I in the gate volume") and deflection assists ("how far
     * is the nearest rail"). `distSq` is that surface distance, squared.
     *
     * Returns THE shared result object — see the module header.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} maxR
     * @param {string[]|Set<string>|null} kinds null = any kind
     * @returns {{collider:object, distSq:number}|null}
     */
    nearest(x, y, z, maxR, kinds) {
        const cs = this.cellSize;
        const stamp = ++this._stamp;
        const cx0 = Math.floor((x - maxR) / cs);
        const cx1 = Math.floor((x + maxR) / cs);
        const cz0 = Math.floor((z - maxR) / cs);
        const cz1 = Math.floor((z + maxR) / cs);
        let best = null;
        let bestSq = Infinity;
        const maxSq = maxR * maxR;
        for (let cz = cz0; cz <= cz1; cz++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const cell = this._cells.get((cx + KEY_HALF) * KEY_SPAN + (cz + KEY_HALF));
                if (!cell) continue;
                for (let i = 0; i < cell.length; i++) {
                    const rec = cell[i];
                    if (rec._q === stamp) continue;
                    rec._q = stamp;
                    if (!kindMatches(kinds, rec.kind)) continue;
                    let d = coreDist(rec, x, y, z) - coreRadius(rec);
                    if (d < 0) d = 0;
                    const dSq = d * d;
                    if (dSq <= maxSq && dSq < bestSq) {
                        bestSq = dSq;
                        best = rec;
                    }
                }
            }
        }
        if (!best) return null;
        _nearestResult.collider = best;
        _nearestResult.distSq = bestSq;
        return _nearestResult;
    }

    // -------------------------------------------------------------- internals

    /**
     * One record shape for every collider, unused fields zeroed. Mixing four
     * ad-hoc shapes would make every cell array polymorphic and deopt the
     * query loops — the very loops the design promises are cheap.
     */
    _makeRecord(shape, kind, data) {
        return {
            id: this._nextId++,
            shape,
            kind: kind ?? null,
            data: data ?? null,
            x: 0, y: 0, z: 0, r: 0,
            ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0,
            hx: 0, hy: 0, hz: 0, ry: 0, cos: 1, sin: 0,
            minX: 0, maxX: 0, minZ: 0, maxZ: 0,
            _q: 0,
        };
    }

    /** Register a record under every cell its XZ AABB overlaps. */
    _insert(rec, minX, maxX, minZ, maxZ) {
        rec.minX = minX;
        rec.maxX = maxX;
        rec.minZ = minZ;
        rec.maxZ = maxZ;
        const cs = this.cellSize;
        const cx0 = Math.floor(minX / cs);
        const cx1 = Math.floor(maxX / cs);
        const cz0 = Math.floor(minZ / cs);
        const cz1 = Math.floor(maxZ / cs);
        for (let cz = cz0; cz <= cz1; cz++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const key = (cx + KEY_HALF) * KEY_SPAN + (cz + KEY_HALF);
                let cell = this._cells.get(key);
                if (!cell) {
                    cell = [];
                    this._cells.set(key, cell);
                }
                cell.push(rec);
            }
        }
        this._colliders.set(rec.id, rec);
        return rec.id;
    }
}
