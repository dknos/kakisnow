/**
 * Surface strips: where the snow stops being snow.
 *
 * A course's `surfaces` list marks rectangles of ice (hardness 1) or packed
 * snow (between). Three consumers, one source:
 *
 *   physics   the director samples `hardnessAt` each frame and the controller
 *             loses edge grip on it — ice is faster because you cannot carve
 *             speed away, which is also why it is harder;
 *   audio     the same sample drives the board bed's hiss;
 *   the eye   this module builds a terrain-conforming glossy sheet per strip,
 *             pale blue and near-mirror rough, so what changes underfoot is
 *             visible three turns before it arrives. The SSR pass the
 *             renderer already runs is what makes it read as ice.
 *
 * The sheets conform by sampling `heightAt` on a grid — they are visuals over
 * the baked terrain, never a second terrain; grounding still comes from the
 * heightfield alone.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";

import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { ShadedAsset } from "../render/shadedAsset.js";

const _n = new Vector3();

const ICE_BLUE = new Color3(0.74, 0.84, 0.92);
/** Metres between conforming samples. */
const GRID = 3;
/** How far the sheet floats above the snow. Above the sastrugi crests (about
 *  8 cm) on purpose: the first lift value sat under them, and every crest
 *  poked through the gloss — a 180 m sheet read as a lake full of islands. */
const LIFT = 0.14;

export class SurfaceStrips {
    constructor({ scene, sky, shadows, depthPass, terrain }) {
        this.scene = scene;
        this.terrain = terrain;
        this.asset = new ShadedAsset({
            scene, sky, shadows, depthPass, name: "surfaces",
        });
        this.asset.available = true;
        /** @type {{zFrom:number,zTo:number,xFrom:number,xTo:number,hardness:number}[]} */
        this.strips = [];
    }

    /** @param {object} course */
    build(course) {
        this.strips = (course.surfaces ?? []).map((s) => ({ ...s }));
        for (const s of this.strips) {
            const w = s.xTo - s.xFrom;
            const d = s.zTo - s.zFrom;
            const cols = Math.max(2, Math.ceil(w / GRID) + 1);
            const rows = Math.max(2, Math.ceil(d / GRID) + 1);
            const pos = [];
            const nor = [];
            const uv = [];
            const idx = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const x = s.xFrom + (c / (cols - 1)) * w;
                    const z = s.zFrom + (r / (rows - 1)) * d;
                    pos.push(x, this.terrain.heightAt(x, z) + LIFT, z);
                    // The ground's own normal, not straight up: a glaze that
                    // shades with the terrain reads as ice ON snow; a flat
                    // mirror normal reads as open water.
                    this.terrain.normalAt(x, z, _n);
                    nor.push(_n.x, _n.y, _n.z);
                    uv.push(c / (cols - 1), r / (rows - 1));
                }
            }
            for (let r = 0; r < rows - 1; r++) {
                for (let c = 0; c < cols - 1; c++) {
                    const a = r * cols + c;
                    idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
                }
            }
            const mesh = new Mesh("surfaceStrip", this.scene);
            const data = new VertexData();
            data.positions = new Float32Array(pos);
            data.normals = new Float32Array(nor);
            data.uvs = new Float32Array(uv);
            data.indices = new Uint32Array(idx);
            data.applyToMesh(mesh, false);
            mesh.parent = this.asset.root;
            this.asset.adopt(mesh, {
                colour: ICE_BLUE,
                roughness: 0.14 + (1 - s.hardness) * 0.3,
            });
        }
        this.asset.setActive(this.strips.length > 0);
    }

    /**
     * How hard the surface is at a point, 0 powder .. 1 blue ice.
     * Rectangle list, first hit wins — courses author them non-overlapping.
     */
    hardnessAt(x, z) {
        for (const s of this.strips) {
            if (z >= s.zFrom && z <= s.zTo && x >= s.xFrom && x <= s.xTo) {
                return s.hardness;
            }
        }
        return 0;
    }

    async warmUp() {
        if (!this.strips.length) return;
        this.asset.setActive(true);
        await this.asset.warmUp();
    }

    sync(cameraPos) {
        if (this.asset.active) this.asset.sync(cameraPos);
    }

    get beautyMaterials() {
        return this.asset.beautyMaterials;
    }
}
