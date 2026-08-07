/**
 * Mountain dressing — conifers, wind-bent trees, shrubs, rocks and ice.
 *
 * Everything here is procedural geometry placed by a seeded blue-noise sample
 * and merged into a handful of meshes. Nothing is imported, for the same reason
 * the base camp is not: an imported tree would bring back exactly the
 * provenance problem this project already has seven of.
 *
 * -------------------------------------------------------------- one draw call
 *
 * The brief asks for thin instancing. This merges instead, and the reason is
 * the shader: `rocker.vertex.wgsl` takes its transform as `uniform world`, with
 * no instance attributes — and it is the one vertex shader shared by the rider,
 * the board, the rocket chair, every ingredient, the burger, the pickup sites
 * and the base camp. Adding an instancing path to it to dress a mountain would
 * put all of that at risk for scenery.
 *
 * Merging reaches the same goal the brief is actually after, which is that a
 * repeated prop must not cost a draw call each. Every prop of a family within a
 * band of the course is baked into one vertex buffer, so the whole forest is a
 * handful of draws rather than several hundred. What it gives up is per-prop
 * culling; the bands are what buys that back, coarsely.
 *
 * ------------------------------------------------------------------ placement
 *
 * Bridson's Poisson-disc sampling, seeded. A jittered grid was the cheaper
 * option and is visibly a grid the moment two rows line up on a slope, which is
 * the specific failure the brief names.
 *
 * A sample survives only if it is outside the racing lane and its margin,
 * outside every jump approach and landing, outside both halfpipes, outside all
 * five ingredient zones, outside the base camp, and on ground whose slope suits
 * the family being placed. Trees take the gentler lower ground, rocks the
 * steeper, ice the high exposed ridges — so the dressing describes the terrain
 * rather than being sprinkled over it.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreatePolyhedron } from "@babylonjs/core/Meshes/Builders/polyhedronBuilder.js";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader.js";
// Side effect, not a symbol. The fir set reuses its five trees across more
// nodes than meshes, so the loader builds InstancedMesh — and in a tree-shaken
// Babylon build that class is absent unless something imports it. The failure
// is a load-time throw, which this system catches and answers by falling back
// to cones, so the forest quietly stayed procedural until this line existed.
import "@babylonjs/core/Meshes/instancedMesh.js";

import { ShadedAsset } from "../render/shadedAsset.js";
import { rng, protectedSpans } from "./ingredientPlacement.js";

const MODELS = (import.meta.env?.BASE_URL ?? "/") + "assets/models/snow-burgers/";
/**
 * The authored trees, in the order a placement draws from them.
 *
 * The fir set is five small trees at about 700 triangles each; the pine is one
 * large one at six thousand, decimated from 246,000. They are weighted rather
 * than picked evenly — a mountainside is mostly small trees with the occasional
 * big one, and an even draw puts a hero pine every fifth trunk.
 */
const TREE_MODELS = [
    { url: MODELS + "dressing-firs.glb", weight: 5, group: "prefix" },
    { url: MODELS + "dressing-pine.glb", weight: 1, group: "prefix" },
];
/**
 * Shrubs and rocks, from the same supplied photogrammetry.
 *
 * Grouped per mesh rather than per name prefix: these arrive as a dozen
 * separate objects in one file with no naming convention between them, so each
 * mesh is its own variant and the pool is as varied as the file is.
 */
const SHRUB_MODELS = [{ url: MODELS + "dressing-bush.glb", weight: 1, group: "mesh" }];
const ROCK_MODELS = [{ url: MODELS + "dressing-rock.glb", weight: 1, group: "mesh" }];

const SNOW = new Color3(0.93, 0.95, 1.0);
const NEEDLE = new Color3(0.12, 0.19, 0.15);
const TRUNK = new Color3(0.15, 0.11, 0.09);
const ROCK = new Color3(0.26, 0.26, 0.29);
const ICE = new Color3(0.62, 0.79, 0.92);

/**
 * How far outside the lane dressing may start.
 *
 * The lane is full strength to 34 m and feathers to 68. Props begin at 40, so
 * there is six metres of clear snow between the fastest line a player can take
 * and the first thing they could hit — which matters because nothing in this
 * game collides with a tree, and a tree the rider passes through is worse the
 * closer it is.
 */
/** Defaults a course's `dressing` block may override. The values are the
 *  Summit tuning, verbatim — a course that says nothing gets the alpine look
 *  the numbers below were measured for. */
const LANE_CLEAR = 40;
/** Outer edge of the dressed band. Beyond this the clipmap has no detail left. */
const OUTER = 190;
/** Metres of course per merged band. One draw call per family per band. */
const BAND = 160;
/** Keep dressing off the pickup sites. */
const ZONE_CLEAR = 26;

/**
 * @typedef {object} Family
 * @property {string} id
 * @property {number} radius     Poisson-disc separation, metres
 * @property {[number,number]} slope  acceptable ground slope, radians
 * @property {number} chance     rejection after the disc, 0..1
 */
/**
 * Density, and why it is this low.
 *
 * The first version of these families was tuned against procedural shapes of
 * thirty triangles. The authored replacements are a thousand to three thousand
 * each, and keeping the counts produced 2.3 million triangles of dressing —
 * more than the terrain it was dressing. The separation radii below are the
 * answer: fewer props, larger, further apart, which is also what a real
 * treeline above the snowline looks like.
 */
const FAMILIES = [
    // Conifers want the sheltered lower-angle ground; they are also the tallest
    // thing out there, so they are the most separated.
    { id: "conifer", radius: 26, slope: [0.0, 0.62], chance: 0.7 },
    // Wind-bent trees live where the conifers give up: steeper and rougher.
    { id: "bent", radius: 30, slope: [0.5, 0.95], chance: 0.45 },
    { id: "shrub", radius: 34, slope: [0.0, 0.8], chance: 0.5 },
    { id: "rock", radius: 38, slope: [0.35, 1.3], chance: 0.55 },
    // Ice forms on the steepest exposed faces and nowhere else.
    { id: "ice", radius: 30, slope: [0.72, 1.4], chance: 0.35 },
];

export class MountainDressing {
    /**
     * @param {object} deps
     * @param {import("@babylonjs/core/scene").Scene} deps.scene
     * @param {import("../render/sky.js").Sky} deps.sky
     * @param {import("../render/shadows.js").ShadowSystem} deps.shadows
     * @param {import("../render/depthPass.js").DepthPass} deps.depthPass
     * @param {import("../terrain/terrain.js").Terrain} deps.terrain
     * @param {object} deps.course the course being dressed — bounds,
     *   exclusions and biome tuning all come off its definition
     */
    constructor({ scene, sky, shadows, depthPass, terrain, course }) {
        this.course = course;
        const d = course.dressing ?? {};
        // The dressed window and the exclusion clearances, per course.
        this._zFrom = course.startZ - 80;
        this._zTo = course.baseCampZ + 90;
        this._laneClear = d.laneClear ?? LANE_CLEAR;
        this._zoneClear = d.zoneClear ?? ZONE_CLEAR;
        /** Density multiplier: Poisson radii shrink by its square root, so 2
         *  reads as roughly twice the props, not four times. */
        this._density = d.density ?? 1;
        this.scene = scene;
        this.terrain = terrain;
        this.asset = new ShadedAsset({ scene, sky, shadows, depthPass, name: "dressing" });
        this.built = false;
        /** Authored variant pools, empty until `load`. */
        this.firs = [];
        this.shrubs = [];
        this.rocks = [];
        this.propCount = 0;
        this.triangles = 0;
        this.drawCalls = 0;
        /**
         * One record per placed prop: `{ x, y, z, family, ry, height, radius,
         * soft }`, world metres, `ry` in Babylon RotationY radians.
         *
         * These exist for `src/game/collisionWorld.js` to consume. Placement
         * is deterministic but the per-prop transform is destroyed the moment
         * `appendTransformed` merges the vertices, and re-running the
         * placement math elsewhere WILL drift (IMPLEMENTATION_MAP.md, Phase 3
         * dressing colliders) — so the transform is snapshotted here, at the
         * one point it exists. Rebuilt from scratch by every `build()`;
         * purely additive bookkeeping with zero effect on the merged
         * geometry, so the fingerprint tools see the same draw output.
         */
        this.propRecords = [];
    }

    /**
     * Read the fir set, and turn it into placeable variants.
     *
     * Five authored trees at about 700 triangles each, split by material into
     * needles, snow load and trunk. They replace the cones this system shipped
     * with first — a cone is a cone at any distance, and the treeline was the
     * one place the mountain looked authored by a programmer.
     *
     * The geometry is taken out of the import and the meshes are disposed
     * immediately: what the dressing needs is vertex data to bake into merged
     * buffers, and holding five trees as live meshes as well would be paying
     * twice for one forest.
     */
    async load() {
        this.firs = await this._pool(TREE_MODELS);
        this.shrubs = await this._pool(SHRUB_MODELS);
        this.rocks = await this._pool(ROCK_MODELS);
        return this.firs.length > 0;
    }

    /** Import a set of models and flatten them into a weighted variant pool. */
    async _pool(models) {
        const variants = new Map();
        for (const model of models) {
            let result;
            try {
                result = await ImportMeshAsync(model.url, this.scene);
            } catch (error) {
                console.warn("[snow-burgers] dressing model unavailable:", model.url, error);
                continue;
            }
            this._collect(result, variants, model.weight, model.group);
            for (const mesh of result.meshes) mesh.dispose(false, true);
            for (const node of result.transformNodes || []) node.dispose();
        }
        const pool = [];
        for (const v of variants.values()) {
            if (!v.parts.length) continue;
            for (let i = 0; i < v.weight; i++) pool.push(v);
        }
        return pool;
    }

    /** Pull every mesh out of one import and group it into tree variants. */
    _collect(result, variants, weight, group = "prefix") {
        for (const mesh of result.meshes) {
            if (mesh.getTotalVertices() <= 0) continue;
            // "FirTreeSnowA_FirTreeGreen_0" — the variant is the part before
            // the first underscore group, the material name is the rest.
            const name = mesh.name;
            const variant = group === "mesh" ? name : name.split("_")[0];
            const data = VertexData.ExtractFromMesh(mesh);
            const src = mesh.material;
            const colour = src?.albedoColor
                ? new Color3(src.albedoColor.r, src.albedoColor.g, src.albedoColor.b)
                : NEEDLE;
            const bounds = mesh.getBoundingInfo().boundingBox;
            const size = bounds.maximum.subtract(bounds.minimum);
            let entry = variants.get(variant);
            if (!entry) {
                entry = { parts: [], height: 0, min: Infinity, weight };
                variants.set(variant, entry);
            }
            entry.weight = weight;
            entry.parts.push({ data, colour, key: name.split("_")[1] ?? name });
            // The set is authored Z-up, so the tall axis is measured rather
            // than assumed — a re-export that landed it Y-up would otherwise
            // plant a forest of trees lying on their sides.
            // Orientation comes from the biggest part of the tree, not the
            // last one seen. A fir arrives as needles, a snow load and a
            // trunk, and the trunk is very nearly a cube — asking it which way
            // is up gives an answer that is arbitrary, and the first version of
            // this planted whole variants on their sides because the trunk
            // happened to be processed last.
            const extent = Math.max(size.x, size.y, size.z);
            if (extent > entry.height) {
                entry.height = extent;
                entry.tallAxis = size.y >= size.x && size.y >= size.z ? "y"
                    : size.z >= size.x ? "z" : "x";
            }
            entry.min = Math.min(entry.min, bounds.minimum.y, bounds.minimum.z);
        }
    }

    /**
     * Place and merge the dressing. Needs the terrain readback.
     * @param {number} seed
     */
    build(seed = this.course.dressing?.seed ?? 20260805) {
        if (this.built) return;
        this.propRecords.length = 0;
        const templates = this._templates();
        const spans = protectedSpans(this.course.terrain);
        const _n = new Vector3();

        // One accumulator per (family, band). Each becomes one mesh.
        /** @type {Map<string, {pos:number[], nor:number[], uv:number[], idx:number[], colour:Color3}>} */
        const buckets = new Map();

        for (const family of FAMILIES) {
            // Density scales the disc radius, not the counts, so the Poisson
            // structure — and the no-clumping guarantee — survives the biome.
            const scaled = this._density === 1 ? family : {
                ...family,
                radius: family.radius / Math.sqrt(this._density),
            };
            const points = this._poisson(scaled, seed);
            for (const [x, z] of points) {
                if (!this._allowed(x, z, spans)) continue;

                this.terrain.normalAt(x, z, _n);
                const slope = Math.acos(Math.min(1, Math.max(-1, _n.y)));
                if (slope < family.slope[0] || slope > family.slope[1]) continue;

                const next = rng((x * 7349 + z * 911 + seed) | 0);
                if (next() > family.chance) continue;

                const y = this.terrain.heightAt(x, z);
                const band = Math.floor((z - this._zFrom) / BAND);
                const parts = templates[family.id](next, slope);

                // Collision capture — the merge below bakes this prop's
                // transform into anonymous vertices, so its position and
                // approximate proportions are recorded now, while they still
                // exist as numbers. Trees and ice read as capsules, rocks and
                // shrubs as spheres; shrubs are flagged soft because riding
                // through one should cost speed, not stop the rider.
                const meta = parts.meta;
                if (meta) {
                    this.propRecords.push({
                        x, y, z,
                        family: family.id,
                        ry: meta.ry,
                        height: meta.height,
                        radius: meta.radius,
                        soft: family.id === "shrub",
                    });
                }

                for (const part of parts) {
                    const key = family.id + ":" + band + ":" + part.colourKey;
                    let bucket = buckets.get(key);
                    if (!bucket) {
                        bucket = { pos: [], nor: [], uv: [], idx: [], colour: part.colour };
                        buckets.set(key, bucket);
                    }
                    appendTransformed(bucket, part.data, part.matrix, x, y, z);
                    this.propCount++;
                }
            }
        }

        for (const [key, b] of buckets) {
            if (!b.idx.length) continue;
            const mesh = new Mesh("dressing_" + key, this.scene);
            const data = new VertexData();
            data.positions = new Float32Array(b.pos);
            data.normals = new Float32Array(b.nor);
            data.uvs = new Float32Array(b.uv);
            data.indices = new Uint32Array(b.idx);
            data.applyToMesh(mesh, false);
            mesh.parent = this.asset.root;
            // The clipmap already fades the far field into aerial perspective;
            // this is the coarse cull the merge gave up, one band at a time.
            mesh.alwaysSelectAsActiveMesh = false;
            this.asset.adopt(mesh, {
                colour: b.colour,
                roughness: key.startsWith("ice") ? 0.22 : 0.68,
            });
            this.triangles += b.idx.length / 3;
            this.drawCalls++;
        }

        this.asset.available = this.asset.meshes.length > 0;
        this.asset.setActive(false);
        this.built = true;
    }

    async warmUp() {
        if (!this.built) return;
        this.asset.setActive(true);
        await this.asset.warmUp();
        this.asset.setActive(false);
    }

    setActive(on) { this.asset.setActive(on); }
    sync(cameraPos) { if (this.asset.active) this.asset.sync(cameraPos); }
    get beautyMaterials() { return this.asset.beautyMaterials; }
    dispose() { this.asset.dispose(); }

    /** @returns {string|null} null when the position is usable. */
    _allowed(x, z, spans) {
        const ax = Math.abs(x);
        if (ax < this._laneClear) return false;
        if (ax > OUTER) return false;
        // The jump approaches and landings run the full width of the feature,
        // so they are excluded outside the lane too — a rider who lands wide
        // must not land in a rock field.
        for (const s of spans) if (z >= s.from - 8 && z <= s.to + 8) return false;
        for (const p of this.course.terrain.pipes ?? []) {
            if (z >= p.from - 12 && z <= p.to + 12 && ax < 60) return false;
        }
        // A jumping hill's whole footprint, not just the spans above. The
        // protected spans stop at the bottom of the landing; the basin carries
        // on for another hundred and thirty metres of outrun whose walls are
        // where the grandstands stand, and a spruce growing out of row four is
        // not a look any venue has.
        for (const s of this.course.terrain.skiJumps ?? []) {
            if (z >= s.fadeInFrom && z <= s.lipZ + s.hillLen + s.outrunLen
                && ax < s.gateXTo) return false;
        }
        for (const zone of Object.values(this.course.zones)) {
            if (z >= zone.z[0] - this._zoneClear && z <= zone.z[1] + this._zoneClear
                && ax >= Math.abs(zone.x[0]) - this._zoneClear
                && ax <= Math.abs(zone.x[1]) + this._zoneClear) return false;
        }
        // The camp and its approach.
        if (z > this.course.baseCampZ - 40 && ax < 70) return false;
        return true;
    }

    /**
     * Bridson Poisson-disc over the dressed band.
     *
     * The active-list variant rather than dart-throwing: dart-throwing has no
     * termination guarantee at this fill ratio and would either run long or
     * leave holes, and the holes are the thing that reads as a grid failing.
     */
    _poisson(family, seed) {
        const next = rng((seed ^ hash(family.id)) | 0);
        const r = family.radius;
        const cell = r / Math.SQRT2;
        const w = OUTER * 2;
        const h = this._zTo - this._zFrom;
        const cols = Math.ceil(w / cell);
        const rows = Math.ceil(h / cell);
        const grid = new Int32Array(cols * rows).fill(-1);
        const pts = [];
        const active = [];

        const put = (px, pz) => {
            const i = pts.length;
            pts.push([px, pz]);
            active.push(i);
            const cx = Math.floor((px + OUTER) / cell);
            const cz = Math.floor((pz - this._zFrom) / cell);
            grid[cz * cols + cx] = i;
        };
        const free = (px, pz) => {
            if (px < -OUTER || px > OUTER || pz < this._zFrom || pz > this._zTo) return false;
            const cx = Math.floor((px + OUTER) / cell);
            const cz = Math.floor((pz - this._zFrom) / cell);
            for (let j = Math.max(0, cz - 2); j <= Math.min(rows - 1, cz + 2); j++) {
                for (let i = Math.max(0, cx - 2); i <= Math.min(cols - 1, cx + 2); i++) {
                    const k = grid[j * cols + i];
                    if (k < 0) continue;
                    const dx = pts[k][0] - px;
                    const dz = pts[k][1] - pz;
                    if (dx * dx + dz * dz < r * r) return false;
                }
            }
            return true;
        };

        put(next() * w - OUTER, next() * h + this._zFrom);
        let guard = 0;
        while (active.length && guard++ < 400000) {
            const ai = (next() * active.length) | 0;
            const [px, pz] = pts[active[ai]];
            let placed = false;
            for (let k = 0; k < 24; k++) {
                const ang = next() * Math.PI * 2;
                const rad = r * (1 + next());
                const nx = px + Math.cos(ang) * rad;
                const nz = pz + Math.sin(ang) * rad;
                if (!free(nx, nz)) continue;
                put(nx, nz);
                placed = true;
                break;
            }
            if (!placed) active.splice(ai, 1);
        }
        return pts;
    }

    /**
     * One placed fir: a variant, scaled to a height and stood upright.
     *
     * The set is authored Z-up, so the upright is a measured rotation rather
     * than an assumed one — and it is applied here rather than baked into the
     * shipped file so a re-export that changes the convention is one line to
     * absorb instead of a silent forest of fallen trees.
     */
    _fir(next, height, tilt) {
        const parts = this.firs.length
            ? this._authored(this.firs, next, height, tilt)
            : this._coneFallback(next, height, tilt);
        // Collision proportions: the trunk, not the canopy — a rider clips
        // branches all day, it is the trunk that stops them. ~0.28 m radius
        // on a nominal 7 m fir, scaled with the prop's height.
        parts.meta.radius = 0.28 * (height / 7);
        return parts;
    }

    /**
     * One placed copy from an authored pool, scaled to a height and stood up.
     *
     * The upright is a measured rotation rather than an assumed one, applied
     * here rather than baked into the shipped file, so a re-export that changes
     * the convention is one line to absorb instead of a silent field of props
     * lying on their sides.
     */
    _authored(pool, next, height, tilt) {
        const v = pool[(next() * pool.length) | 0];
        const s = height / Math.max(v.height, 1e-3);
        const ry = next() * Math.PI * 2;
        const out = [];
        for (const part of v.parts) {
            let m = Matrix.Scaling(s, s, s);
            if (v.tallAxis === "z") m.multiplyToRef(Matrix.RotationX(-Math.PI / 2), m);
            else if (v.tallAxis === "x") m.multiplyToRef(Matrix.RotationZ(Math.PI / 2), m);
            if (tilt) m.multiplyToRef(Matrix.RotationZ(tilt), m);
            m.multiplyToRef(Matrix.RotationY(ry), m);
            out.push({ colourKey: part.key, colour: part.colour, data: part.data, matrix: m });
        }
        // Collision capture: the composed transform's knobs, carried on the
        // parts array (iteration ignores extra properties). Callers that know
        // their family overwrite `radius`; `height` is exact — the scaling
        // above targets it.
        out.meta = { ry, height, radius: height * 0.5 };
        return out;
    }

    /** What the treeline was before the firs arrived. Kept as the fallback. */
    _coneFallback(next, height, tilt) {
        const w = height * 0.32;
        const ry = next() * Math.PI * 2;
        const M = (sx, sy, sz, oy) => {
            const m = Matrix.Scaling(sx, sy, sz);
            if (tilt) m.multiplyToRef(Matrix.RotationZ(tilt), m);
            m.multiplyToRef(Matrix.RotationY(ry), m);
            m.multiplyToRef(Matrix.Translation(0, oy, 0), m);
            return m;
        };
        const parts = [
            { colourKey: "needle", colour: NEEDLE, data: this._cone,
              matrix: M(w, height * 0.62, w, height * 0.24) },
            { colourKey: "snow", colour: SNOW, data: this._cone,
              matrix: M(w * 0.84, height * 0.5, w * 0.84, height * 0.44) },
        ];
        // Collision capture; radius is overwritten by `_fir`, same as the
        // authored path, so both forests collide identically.
        parts.meta = { ry, height, radius: w };
        return parts;
    }

    /**
     * One VertexData per shape, built once and reused for every copy.
     *
     * Each family returns a list of parts, so a conifer is a trunk and two
     * snow-loaded skirts rather than a single cone — three primitives is the
     * point at which a tree stops reading as a traffic cone.
     */
    _templates() {
        const cone = extract(CreateCylinder("t_cone",
            { diameterTop: 0, diameterBottom: 1, height: 1, tessellation: 7 }, this.scene));
        const box = extract(CreateBox("t_box", { size: 1 }, this.scene));
        const rock = extract(CreatePolyhedron("t_rock", { type: 1, size: 0.5 }, this.scene));
        const shard = extract(CreatePolyhedron("t_shard", { type: 2, size: 0.5 }, this.scene));
        this._cone = cone;

        const M = (sx, sy, sz, ry, ox, oy, oz, tilt = 0) => {
            const m = Matrix.Scaling(sx, sy, sz);
            if (tilt) m.multiplyToRef(Matrix.RotationZ(tilt), m);
            m.multiplyToRef(Matrix.RotationY(ry), m);
            m.multiplyToRef(Matrix.Translation(ox, oy, oz), m);
            return m;
        };

        return {
            // The two tree families are the authored firs. Whichever variant a
            // sample draws comes with its own needles, snow load and trunk
            // already separated by material, so the merge buckets them
            // correctly with no extra bookkeeping.
            conifer: (next) => this._fir(next, 6.0 + next() * 4.2, 0),
            bent: (next, slope) =>
                // Leaned downhill, harder on steeper ground: this is what wind
                // and creep do to anything growing near the treeline.
                this._fir(next, 3.6 + next() * 2.2,
                    0.20 + slope * 0.32 + next() * 0.10),
            shrub: (next) => {
                if (this.shrubs?.length) {
                    return this._authored(this.shrubs, next, 0.9 + next() * 0.8, 0);
                }
                const s = 0.7 + next() * 0.9;
                const ry = next() * Math.PI * 2;
                const parts = [
                    { colourKey: "needle", colour: NEEDLE, data: rock,
                      matrix: M(s * 1.5, s * 0.7, s * 1.5, ry, 0, s * 0.22, 0) },
                    // Mostly buried: a shrub at this altitude is a bump with a
                    // dark edge, not a bush.
                    { colourKey: "snow", colour: SNOW, data: rock,
                      matrix: M(s * 1.7, s * 0.55, s * 1.7, ry, 0, s * 0.1, 0) },
                ];
                // Collision capture, from the widest scale above (s·1.7 on a
                // half-unit polyhedron). Soft-flagged downstream: a shrub
                // slows the rider, never walls them.
                parts.meta = { ry, height: s * 0.8, radius: s * 0.85 };
                return parts;
            },
            rock: (next) => {
                if (this.rocks?.length) {
                    return this._authored(this.rocks, next, 1.6 + next() * 2.4, 0);
                }
                const s = 1.1 + next() * 2.6;
                const ry = next() * Math.PI * 2;
                const parts = [
                    { colourKey: "rock", colour: ROCK, data: rock,
                      matrix: M(s, s * (0.5 + next() * 0.5), s * (0.8 + next() * 0.5),
                                ry, 0, s * 0.22, 0) },
                    { colourKey: "snow", colour: SNOW, data: rock,
                      matrix: M(s * 0.92, s * 0.3, s * 0.92, ry, 0, s * 0.45, 0) },
                ];
                // Collision capture: `s` scales a half-unit polyhedron, so the
                // boulder's footprint is roughly a 0.6·s sphere.
                parts.meta = { ry, height: s, radius: s * 0.6 };
                return parts;
            },
            ice: (next) => {
                const s = 1.3 + next() * 2.2;
                const ry = next() * Math.PI * 2;
                const parts = [
                    { colourKey: "ice", colour: ICE, data: shard,
                      matrix: M(s * 0.6, s * 1.9, s * 0.6, ry, 0, s * 0.7, 0,
                                (next() - 0.5) * 0.4) },
                ];
                // Collision capture: a shard is a near-vertical spike — tall
                // (the y scale of s·1.9 above) and thin (0.6·s on a half-unit
                // polyhedron), which is exactly a capsule.
                parts.meta = { ry, height: s * 1.9, radius: s * 0.3 };
                return parts;
            },
        };
    }
}

// --------------------------------------------------------------------- helpers

function extract(mesh) {
    const data = VertexData.ExtractFromMesh(mesh);
    mesh.dispose();
    return data;
}

function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

const _p = new Vector3();
const _nv = new Vector3();

/** Bake one copy of a template into a bucket, offset to world. */
function appendTransformed(bucket, data, matrix, ox, oy, oz) {
    const base = bucket.pos.length / 3;
    const pos = data.positions;
    const nor = data.normals;
    const uv = data.uvs;
    for (let i = 0; i < pos.length; i += 3) {
        _p.set(pos[i], pos[i + 1], pos[i + 2]);
        Vector3.TransformCoordinatesToRef(_p, matrix, _p);
        bucket.pos.push(_p.x + ox, _p.y + oy, _p.z + oz);
        _nv.set(nor[i], nor[i + 1], nor[i + 2]);
        Vector3.TransformNormalToRef(_nv, matrix, _nv);
        _nv.normalize();
        bucket.nor.push(_nv.x, _nv.y, _nv.z);
    }
    if (uv) for (let i = 0; i < uv.length; i++) bucket.uv.push(uv[i]);
    const idx = data.indices;
    for (let i = 0; i < idx.length; i++) bucket.idx.push(idx[i] + base);
}
