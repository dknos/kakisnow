/**
 * The jump venue — the built things around Big Air Basin's hill.
 *
 * The basin was geometrically finished and photographically empty. A sixty
 * metre hole in a white field with nothing in it has no scale: the first
 * showcase frames of the finished landing hill could have been a two metre
 * bank or a two hundred metre one, and the flight over it read as neither.
 * Everything here exists to answer that — a grandstand is a row of seats a
 * person fits in, and once one is on the slope the slope has a size.
 *
 * ------------------------------------------------------------------ merging
 *
 * The repeated props follow `environment.js` rather than `baseCamp.js`: the
 * geometry is pulled out of the import, baked through its placement transform
 * into shared buffers, and applied to one mesh per family. `rocker.vertex.wgsl`
 * takes its transform as `uniform world` and has no instance attributes, so a
 * hundred separate flags would be a hundred draw calls and a hundred
 * pipelines. The one exception is the judges' tower, which is imported whole
 * and keeps its own textures, because it is the single structure the player
 * comes to rest beside — the same judgement the camp lodge already makes.
 *
 * ------------------------------------------------------------------ scaling
 *
 * Source models arrive at wildly different scales — the tower measured 203 m
 * tall, the floodlight 0.63 m — so nothing here is placed at unit scale.
 * Every placement declares the height in metres it should stand, and the
 * factor is derived from the template's measured bounds. A model re-exported
 * at a different scale therefore still lands the right size.
 *
 * ----------------------------------------------------------------- the crowd
 *
 * Stand rows are not authored at fixed x. They MARCH outward from the flat
 * floor sampling `terrain.heightAt` and drop a bank every few metres of height
 * gained, so the terracing follows whatever the bowl wall actually does. The
 * wall's steepness varies along the hill by construction — it is deepest at
 * the outrun — and rows authored at fixed offsets sat buried at one end of the
 * basin and floating at the other.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/core/Meshes/instancedMesh.js";

import { ShadedAsset } from "../render/shadedAsset.js";

const MODELS = (import.meta.env?.BASE_URL ?? "/") + "assets/models/big-air/";

/**
 * Every merged prop, the height in metres one copy should stand, and its
 * colour.
 *
 * The colour is declared here rather than taken from the source material, and
 * that is deliberate: merging discards textures, and every one of these models
 * carries its colour IN its texture behind a white albedo factor. Read from
 * the material, the whole venue came out white — a row of white benches on
 * white snow under a white sky, which photographed as terrain. These are
 * chosen to read against snow first and to match the source second.
 */
const PROPS = {
    bleacher: { url: MODELS + "venue-bleacher.glb", height: 1.7, colour: new Color3(0.13, 0.14, 0.17) },
    flag: { url: MODELS + "venue-flag.glb", height: 3.2, colour: new Color3(0.66, 0.11, 0.10) },
    windsock: { url: MODELS + "venue-windsock.glb", height: 6.0, colour: new Color3(0.90, 0.38, 0.06) },
    scaffold: { url: MODELS + "venue-scaffold.glb", height: 2.4, colour: new Color3(0.30, 0.32, 0.36) },
    floodlight: { url: MODELS + "venue-floodlight.glb", height: 1.6, colour: new Color3(0.10, 0.10, 0.12) },
    chair: { url: MODELS + "venue-chairlift.glb", height: 3.0, colour: new Color3(0.11, 0.11, 0.13) },
};

const STEEL = new Color3(0.34, 0.36, 0.40);
const CABLE = new Color3(0.12, 0.12, 0.14);
const LANDING_CUE = new Color3(0.92, 0.18, 0.06);

export class JumpVenue {
    constructor({ scene, sky, shadows, depthPass, terrain, course }) {
        this.scene = scene;
        this.terrain = terrain;
        this.course = course;
        this.asset = new ShadedAsset({
            scene, sky, shadows, depthPass, name: "venue",
        });
        /** The one imported-whole structure, textures intact. */
        this.judges = new ShadedAsset({
            scene, sky, shadows, depthPass, name: "venueJudges",
        });
        /** @type {Map<string, {parts: object[], height: number}>} */
        this.templates = new Map();
        this.built = false;
        this.propCount = 0;
        this.drawCalls = 0;
        this.triangles = 0;
        /** Camera-only occluders; venue props remain non-solid to the rider. */
        this.cameraCollisionBuilt = false;
    }

    /** Whether this course has a venue at all. Most do not. */
    get wanted() {
        return Boolean(this.course.venue);
    }

    async load() {
        if (!this.wanted) return false;
        for (const [id, spec] of Object.entries(PROPS)) {
            const t = await this._template(spec.url, spec.colour);
            if (t) this.templates.set(id, t);
        }
        const j = this.course.venue.judges;
        if (j && await this.judges.load(MODELS + "venue-judges.glb")) {
            // Measured, not assumed: this model is 203 m tall as authored.
            // The bounds are read at unit scale and the foot offset is scaled
            // with them, so the tower stands ON the snow rather than in it.
            this.judges.root.scaling.setAll(1);
            this.judges.root.position.setAll(0);
            this.judges.root.computeWorldMatrix(true);
            const b = this.judges.root.getHierarchyBoundingVectors(true);
            const h = Math.max(0.001, b.max.y - b.min.y);
            const s = (j.height ?? 15) / h;
            this.judges.root.scaling.setAll(s);
            this.judges.root.rotation.y = j.ry ?? 0;
            this.judges.root.position.set(
                j.x, this.terrain.heightAt(j.x, j.z) - b.min.y * s, j.z
            );
            this.judgesReport = { rawHeight: h, scale: s };
            this.judges.setActive(false);
        }
        return this.templates.size > 0;
    }

    /** Import one model, take its geometry, and throw the meshes away. */
    async _template(url, fallbackColour) {
        let result;
        try {
            result = await ImportMeshAsync(url, this.scene);
        } catch (error) {
            console.warn("[big-air] venue model unavailable:", url, error);
            return null;
        }
        const parts = [];
        let min = Infinity;
        let max = -Infinity;
        for (const mesh of result.meshes) {
            if (mesh.getTotalVertices() <= 0) continue;
            // Bake the world matrix into the vertices before anything reads
            // either. `ExtractFromMesh` returns LOCAL positions while
            // `boundingBox.minimumWorld` is world — measuring in one space and
            // placing in the other is how the first pass shipped bleachers the
            // size of the grandstand they were meant to fill. It also collapses
            // the glTF loader's `__root__` and any per-mesh offset, so a model
            // that arrives as several parts still assembles.
            mesh.computeWorldMatrix(true);
            const world = mesh.getWorldMatrix();
            const data = VertexData.ExtractFromMesh(mesh);
            data.transform(world);
            // The glTF loader's `__root__` carries the right-to-left-handed
            // flip as a negative z scale, and `VertexData.transform` moves the
            // vertices without reversing the triangles that index them. Left
            // alone, every venue prop is inside-out and vanishes to backface
            // culling.
            if (world.determinant() < 0 && data.indices) {
                for (let i = 0; i < data.indices.length; i += 3) {
                    const t = data.indices[i];
                    data.indices[i] = data.indices[i + 2];
                    data.indices[i + 2] = t;
                }
            }
            // The declared colour, always — see the note on PROPS. Reading the
            // source material gave white benches on white snow whether the
            // colour lived in a texture (dropped by the merge) or in a pale
            // albedo factor, and "sometimes the source wins" is a rule that
            // makes the venue's palette depend on which model was uploaded by
            // whom.
            const colour = fallbackColour;
            for (let i = 1; i < data.positions.length; i += 3) {
                if (data.positions[i] < min) min = data.positions[i];
                if (data.positions[i] > max) max = data.positions[i];
            }
            parts.push({ data, colour, key: mesh.name });
        }
        for (const mesh of result.meshes) mesh.dispose(false, true);
        for (const node of result.transformNodes || []) node.dispose();
        if (!parts.length) return null;
        return { parts, height: Math.max(0.001, max - min), foot: min };
    }

    /**
     * Stand the venue up. Requires the heightfield readback, so it runs from
     * the director's load step alongside the camp.
     */
    build() {
        if (!this.wanted || !this.templates.size) return;
        const v = this.course.venue;
        /** @type {Map<string, object>} merged buckets, keyed family:colour. */
        const buckets = new Map();
        const place = (id, x, z, opts = {}) => {
            const t = this.templates.get(id);
            if (!t) return;
            const s = (opts.height ?? PROPS[id].height) / t.height;
            const m = Matrix.Compose(
                new Vector3(s, s, s),
                Quaternion.RotationYawPitchRoll(opts.ry ?? 0, 0, opts.roll ?? 0),
                Vector3.Zero()
            );
            const y = (opts.y ?? this.terrain.heightAt(x, z)) - t.foot * s;
            for (const part of t.parts) {
                const key = `${id}:${part.key}`;
                let bucket = buckets.get(key);
                if (!bucket) {
                    bucket = { pos: [], nor: [], uv: [], idx: [], colour: part.colour };
                    buckets.set(key, bucket);
                }
                appendTransformed(bucket, part.data, m, x, y, z);
            }
            this.propCount++;
        };

        this._stands(v, place);
        this._flags(v, place);
        this._gantry(v, place);
        for (const w of v.windsocks ?? []) place("windsock", w.x, w.z, { ry: w.ry ?? 0 });
        this._lights(v, place);
        this._lift(v, place);
        this._landingCue(v);

        for (const [key, b] of buckets) {
            if (!b.idx.length) continue;
            const mesh = new Mesh("venue_" + key, this.scene);
            const data = new VertexData();
            data.positions = new Float32Array(b.pos);
            data.normals = new Float32Array(b.nor);
            data.uvs = new Float32Array(b.uv);
            data.indices = new Uint32Array(b.idx);
            data.applyToMesh(mesh, false);
            mesh.parent = this.asset.root;
            mesh.alwaysSelectAsActiveMesh = false;
            this.asset.adopt(mesh, { colour: b.colour, roughness: 0.6, metallic: 0.05 });
            this.triangles += b.idx.length / 3;
            this.drawCalls++;
        }
        this.asset.available = this.asset.meshes.length > 0;
        this.asset.setActive(false);
        this.built = true;
    }

    /**
     * A restrained, world-space read of the authored landing zone. The cue is
     * deliberately inside the ride line and low enough to stay a landing
     * marker rather than a new obstacle: two orange safety poles bracket the
     * measured touchdown and two transverse snow stripes give the eye a
     * readable near/far target while airborne.
     */
    _landingCue(v) {
        const jump = this.course.terrain?.skiJumps?.[0];
        if (!jump || !v) return;
        const z = jump.lipZ + 50;
        const halfWidth = 12;
        const poleHeight = 4.8;
        for (const x of [-halfWidth, halfWidth]) {
            const ground = this.terrain.heightAt(x, z);
            this._post(x, z, ground, poleHeight, 0.16, LANDING_CUE);
            // A short cap makes the marker legible against a white ridge even
            // when the full pole is partly hidden by the landing slope.
            this._post(x, z + 0.2, ground + poleHeight - 0.18, 0.36, 0.24, LANDING_CUE);
        }
        const y = this.terrain.heightAt(0, z) + 0.13;
        for (const offset of [-4, 4]) {
            this._beam(
                -halfWidth, y, z + offset,
                halfWidth, y, z + offset,
                0.22, LANDING_CUE
            );
        }
    }

    /**
     * Add bounded camera occluders for the authored Big Air venue.
     *
     * These records deliberately live in a camera-only CollisionWorld. The
     * crowd, flags and safety infrastructure should frame a jump without
     * turning into surprise gameplay walls. Dimensions follow the same authored
     * placement loops as `build()` and use cheap capsules/boxes instead of
     * imported render triangles.
     *
     * @param {import("./collisionWorld.js").CollisionWorld} world
     */
    buildCameraCollision(world) {
        if (this.cameraCollisionBuilt || !world || !this.wanted) return;
        const v = this.course.venue;
        const g = (x, z) => this.terrain.heightAt(x, z);
        const addPost = (x, z, height, radius, kind) => {
            const ground = g(x, z);
            world.addCapsule({
                ax: x, ay: ground, az: z,
                bx: x, by: ground + height, bz: z,
                r: radius, kind, data: null,
            });
        };
        const addBox = (x, y, z, hx, hy, hz, kind, ry = 0) => world.addBox({
            x, y, z, hx, hy, hz, ry, kind, data: null,
        });

        const gantry = v.gantry;
        if (gantry) {
            const bay = PROPS.scaffold.height;
            for (const side of [-1, 1]) {
                const x = side * gantry.halfWidth;
                const ground = g(x, gantry.z);
                addBox(x, ground + gantry.bays * bay * 0.5, gantry.z,
                    0.8, gantry.bays * bay * 0.5, 0.8, "venue-gantry", Math.PI / 2);
                addPost(x + side * 1.4, gantry.z, gantry.bays * bay, 0.16, "venue-gantry");
            }
            addBox(0, g(0, gantry.z) + gantry.bays * bay + 0.5,
                gantry.z, gantry.halfWidth, 0.2, 0.2, "venue-gantry");
        }

        const judges = v.judges;
        if (judges) {
            const ground = g(judges.x, judges.z);
            addBox(judges.x, ground + (judges.height ?? 16) * 0.5, judges.z,
                7.0, (judges.height ?? 16) * 0.5, 7.0,
                "venue-judges", judges.ry ?? 0);
        }

        const stands = v.stands;
        if (stands) {
            for (let z = stands.zFrom; z <= stands.zTo; z += stands.spacing) {
                for (const side of [-1, 1]) {
                    let x = side * stands.innerX;
                    let last = g(x, z);
                    let placed = 0;
                    while (placed < stands.tiers && Math.abs(x) < stands.outerX) {
                        x += side * 2;
                        const h = g(x, z);
                        if (h - last < stands.rise) continue;
                        addBox(x, h + PROPS.bleacher.height * 0.5, z,
                            2.2, PROPS.bleacher.height * 0.5, 0.7,
                            "venue-stands", side > 0 ? Math.PI / 2 : -Math.PI / 2);
                        last = h;
                        placed++;
                    }
                }
            }
        }

        // The authored flags use a symmetric half-width rather than x fields.
        if (v.flags) {
            for (let z = v.flags.zFrom; z <= v.flags.zTo; z += v.flags.spacing) {
                for (const side of [-1, 1]) {
                    addPost(side * v.flags.halfWidth, z, PROPS.flag.height, 0.12, "venue-flag");
                }
            }
        }
        for (const w of v.windsocks ?? []) {
            addPost(w.x, w.z, PROPS.windsock.height, 0.16, "venue-windsock");
        }
        for (const l of v.lights ?? []) {
            addPost(l.x, l.z, l.height ?? 14, 0.22, "venue-light");
        }

        const lift = v.lift;
        if (lift && lift.pylons > 0) {
            const span = lift.zTo - lift.zFrom;
            for (let i = 0; i <= lift.pylons; i++) {
                const z = lift.zFrom + (span * i) / lift.pylons;
                addPost(lift.x, z, lift.height, 0.30, "venue-lift");
            }
            for (let i = 0; i < lift.chairs; i++) {
                const z = lift.zFrom + span * ((i + 0.5) / lift.chairs);
                const ground = g(lift.x, z);
                world.addSphere({
                    x: lift.x, y: ground + lift.height - 3.4, z,
                    r: 0.8, kind: "venue-chair", data: null,
                });
            }
        }
        this.cameraCollisionBuilt = true;
    }

    /**
     * Terraced banks up both bowl walls, found by walking outward.
     *
     * `rise` is the height gained between banks, not a fixed offset in x, so
     * a shallow wall gets a wide terrace and a steep one gets a stacked
     * grandstand — which is what the basin's own varying depth asks for.
     */
    _stands(v, place) {
        const s = v.stands;
        if (!s) return;
        for (let z = s.zFrom; z <= s.zTo; z += s.spacing) {
            for (const side of [-1, 1]) {
                let x = side * s.innerX;
                let last = this.terrain.heightAt(x, z);
                let placed = 0;
                while (placed < s.tiers && Math.abs(x) < s.outerX) {
                    x += side * 2;
                    const h = this.terrain.heightAt(x, z);
                    if (h - last < s.rise) continue;
                    // Rows run along the course, seats step up the wall, so
                    // the bank faces the landing from whichever side it is on.
                    place("bleacher", x, z, { ry: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
                    last = h;
                    placed++;
                }
            }
        }
    }

    /** Course flags down both edges of the hill and the outrun. */
    _flags(v, place) {
        const f = v.flags;
        if (!f) return;
        for (let z = f.zFrom; z <= f.zTo; z += f.spacing) {
            for (const side of [-1, 1]) {
                const x = side * f.halfWidth;
                place("flag", x, z, { ry: side > 0 ? -1.35 : 1.35 });
            }
        }
    }

    /**
     * The start gantry: two stacks of scaffold bays either side of the top of
     * the in-run, with a beam across. Stacked rather than modelled, because
     * the source is one bay and a bay is what a gantry is made of.
     */
    _gantry(v, place) {
        const g = v.gantry;
        if (!g) return;
        const bay = PROPS.scaffold.height;
        for (const side of [-1, 1]) {
            const x = side * g.halfWidth;
            const ground = this.terrain.heightAt(x, g.z);
            for (let i = 0; i < g.bays; i++) {
                place("scaffold", x, g.z, {
                    y: ground + i * bay, ry: Math.PI / 2,
                });
            }
            // A leg down to the snow on the outboard side, so the stack reads
            // as founded rather than dropped.
            this._post(x + side * 1.4, g.z, ground, g.bays * bay, 0.16, STEEL);
        }
        const ground = this.terrain.heightAt(0, g.z);
        this._beam(
            -g.halfWidth, ground + g.bays * bay + 0.5, g.z,
            g.halfWidth, ground + g.bays * bay + 0.5, g.z, 0.18, STEEL
        );
    }

    /** Floodlight masts: an imported head on a built pole. */
    _lights(v, place) {
        for (const l of v.lights ?? []) {
            const ground = this.terrain.heightAt(l.x, l.z);
            const h = l.height ?? 14;
            this._post(l.x, l.z, ground, h, 0.22, STEEL);
            for (let i = 0; i < 2; i++) {
                place("floodlight", l.x + (i ? 0.9 : -0.9), l.z, {
                    y: ground + h, ry: l.ry ?? Math.PI,
                });
            }
        }
    }

    /**
     * A lift line up the basin's outboard shoulder.
     *
     * On natural ground outside the bowl, running past the hill rather than
     * over it — a cable strung above a landing hill would be a hazard nobody
     * builds. It is scenery, it does not move, and it is here because a
     * chairlift is the fastest way to say "this is a resort, and that drop is
     * as far as it looks".
     */
    _lift(v, place) {
        const l = v.lift;
        if (!l) return;
        const span = l.zTo - l.zFrom;
        const pylonAt = [];
        for (let i = 0; i <= l.pylons; i++) {
            const z = l.zFrom + (span * i) / l.pylons;
            const ground = this.terrain.heightAt(l.x, z);
            this._post(l.x, z, ground, l.height, 0.30, STEEL);
            pylonAt.push({ z, top: ground + l.height });
        }
        for (let i = 1; i < pylonAt.length; i++) {
            const a = pylonAt[i - 1];
            const b = pylonAt[i];
            this._beam(l.x, a.top, a.z, l.x, b.top, b.z, 0.09, CABLE);
        }
        for (let i = 0; i < l.chairs; i++) {
            const t = (i + 0.5) / l.chairs;
            const z = l.zFrom + span * t;
            // Interpolate the cable between the two pylons it hangs from.
            let top = pylonAt[0].top;
            for (let k = 1; k < pylonAt.length; k++) {
                if (z <= pylonAt[k].z) {
                    const a = pylonAt[k - 1];
                    const b = pylonAt[k];
                    const u = (z - a.z) / (b.z - a.z);
                    top = a.top + (b.top - a.top) * u;
                    break;
                }
            }
            place("chair", l.x, z, { y: top - 3.4, ry: Math.PI / 2 });
        }
    }

    // ------------------------------------------------------------- builders

    /** A vertical post standing on the ground. */
    _post(x, z, groundY, height, radius, colour) {
        const mesh = CreateCylinder(
            `venuePost_${x.toFixed(0)}_${z.toFixed(0)}`,
            { height, diameter: radius * 2, tessellation: 8 },
            this.scene
        );
        mesh.parent = this.asset.root;
        mesh.position.set(x, groundY + height * 0.5, z);
        this.asset.adopt(mesh, { colour, roughness: 0.5, metallic: 0.6 });
        this.drawCalls++;
    }

    /** A cylinder from a to b — a beam, or a length of cable. */
    _beam(ax, ay, az, bx, by, bz, radius, colour) {
        const a = new Vector3(ax, ay, az);
        const b = new Vector3(bx, by, bz);
        const d = b.subtract(a);
        const len = d.length();
        if (len < 0.01) return;
        const mesh = CreateCylinder(
            `venueBeam_${az.toFixed(0)}_${bz.toFixed(0)}`,
            { height: len, diameter: radius * 2, tessellation: 6 },
            this.scene
        );
        mesh.parent = this.asset.root;
        mesh.position.copyFrom(a.add(b).scale(0.5));
        // Babylon's cylinder runs along +Y; aim it at b.
        const up = new Vector3(0, 1, 0);
        const dir = d.normalize();
        const axis = Vector3.Cross(up, dir);
        const angle = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(up, dir))));
        if (axis.lengthSquared() > 1e-8) {
            mesh.rotationQuaternion = Quaternion.RotationAxis(axis.normalize(), angle);
        }
        this.asset.adopt(mesh, { colour, roughness: 0.45, metallic: 0.7 });
        this.drawCalls++;
    }

    // ------------------------------------------------------------ lifecycle

    async warmUp() {
        if (!this.built) return;
        for (const a of [this.asset, this.judges]) {
            if (!a.available) continue;
            a.setActive(true);
            await a.warmUp();
            a.setActive(false);
        }
    }

    setActive(on) {
        this.asset.setActive(on && this.built);
        this.judges.setActive(on && this.built);
    }

    sync(cameraPos) {
        if (this.asset.active) this.asset.sync(cameraPos);
        if (this.judges.active) this.judges.sync(cameraPos);
    }

    get beautyMaterials() {
        return [...this.asset.beautyMaterials, ...this.judges.beautyMaterials];
    }

    dispose() {
        this.asset.dispose();
        this.judges.dispose();
    }
}

// --------------------------------------------------------------------- helpers

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
        if (nor) {
            _nv.set(nor[i], nor[i + 1], nor[i + 2]);
            Vector3.TransformNormalToRef(_nv, matrix, _nv);
            _nv.normalize();
            bucket.nor.push(_nv.x, _nv.y, _nv.z);
        } else {
            bucket.nor.push(0, 1, 0);
        }
    }
    if (uv) for (let i = 0; i < uv.length; i++) bucket.uv.push(uv[i]);
    else for (let i = 0; i < pos.length / 3; i++) bucket.uv.push(0, 0);
    const idx = data.indices;
    for (let i = 0; i < idx.length; i++) bucket.idx.push(idx[i] + base);
}
