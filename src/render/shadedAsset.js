/**
 * An imported static GLB, shaded by this project's own pipeline.
 *
 * Everything the game layer places in the world — the five ingredients, the
 * completed burger, the base camp — arrives as a glTF with a stock PBR material
 * attached, and a stock PBR material is exactly wrong here. Nothing else in
 * this scene uses one: the terrain, the wake, the spray, the spells and both
 * heroes all compute their own lighting from the same sun, the same three
 * cascades, the same sky SH and the same aerial-perspective fog. A pickup lit
 * by Babylon's default path is lit by a different sun than the snow it is
 * standing on, and reads as a prop dropped into a photograph.
 *
 * So this replaces the imported material with the `rocker` WGSL material, and
 * registers each mesh with the cascade maps and the camera-space depth prepass
 * the same way `RockerKaki` does for the hero.
 *
 * ------------------------------------------------------------------- and not
 *
 * This is deliberately not a refactor of `RockerKaki`. That class is skinned,
 * owns the board's attitude solve, its grounding against the sastrugi crest
 * height, and the rider-as-passenger transform chain — and the committed smoke
 * tools assert on the specific nodes in it. What the two share is sixty lines
 * of material construction and a per-frame uniform upload; what they do not
 * share is everything that makes either of them worth having. Merging them
 * would produce one class with two disjoint halves and put the playable hero at
 * risk to save a shader material factory.
 *
 * Allocation per frame: none.
 */

import "@babylonjs/loaders/glTF";

import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { Color3, Matrix, Vector3, Vector4 } from "@babylonjs/core/Maths/math.js";

import { S } from "../core/settings.js";
import { whenReady, bindMatrixArray } from "../core/gpuUtil.js";
import { CASCADE_COUNT } from "./shadows.js";
import { SPELL_LIGHT_UNIFORMS } from "../spells/spellLights.js";

const _white = new Color3(1, 1, 1);

/**
 * Two cascades rather than three, matching the hero.
 *
 * The third cascade covers the far field, where a 1 m pickup is a few pixels
 * across and its shadow is smaller than a shadow-map texel. Registering it
 * there costs a full extra draw of the mesh into a 2 k map every frame and
 * changes nothing on screen.
 */
const ASSET_CASCADES = 2;

export class ShadedAsset {
    /**
     * @param {object} deps
     * @param {import("@babylonjs/core/scene").Scene} deps.scene
     * @param {import("./sky.js").Sky} deps.sky
     * @param {import("./shadows.js").ShadowSystem} deps.shadows
     * @param {import("./depthPass.js").DepthPass} deps.depthPass
     * @param {string} deps.name
     */
    constructor({ scene, sky, shadows, depthPass, name }) {
        this.scene = scene;
        this.sky = sky;
        this.shadows = shadows;
        this.depthPass = depthPass;
        this.name = name;

        /** Parent for everything imported. Move this, and the asset moves. */
        this.root = new TransformNode(name + "Root", scene);
        this.root.rotationQuaternion = null;

        /** @type {import("@babylonjs/core/Meshes/mesh").Mesh[]} */
        this.meshes = [];
        /** @type {ShaderMaterial[]} */
        this.beautyMaterials = [];
        /** @type {ShaderMaterial[]} */
        this._shadowMaterials = [];
        /** @type {ShaderMaterial[]} */
        this._prepassMaterials = [];
        /** @type {Matrix[]} */
        this._normalMatrices = [];

        this.available = false;
        this.active = false;
        this.triangles = 0;

        this._cameraPos = new Vector3();
        this._splits = new Vector4();

        // One white texel, standing in for every map the asset does not carry.
        // The shader multiplies by a per-slot strength which is set to zero in
        // that case, so this is never actually sampled for colour — it exists
        // because a WebGPU bind group needs a texture bound to every declared
        // binding whether or not the branch that reads it is taken.
        this._fallbackTexture = new RawTexture(
            new Uint8Array([255, 255, 255, 255]),
            1, 1,
            Constants.TEXTUREFORMAT_RGBA,
            scene,
            false,
            false,
            Constants.TEXTURE_NEAREST_SAMPLINGMODE
        );
    }

    /**
     * Import the GLB and take over its shading.
     *
     * A failed import is reported and survivable rather than fatal. A missing
     * pickup should cost the player that ingredient, not the whole session —
     * the same judgement `RockerKaki._loadBoard` already makes about the board.
     *
     * @param {string} url
     * @returns {Promise<boolean>}
     */
    async load(url) {
        let result;
        try {
            result = await ImportMeshAsync(url, this.scene);
        } catch (error) {
            console.warn(`[snow-burgers] ${this.name} unavailable:`, error);
            return false;
        }

        for (let i = 0; i < result.meshes.length; i++) {
            const mesh = result.meshes[i];
            if (!mesh.parent) mesh.parent = this.root;
        }
        const nodes = result.transformNodes || [];
        for (let i = 0; i < nodes.length; i++) {
            if (!nodes[i].parent) nodes[i].parent = this.root;
        }
        // Nothing here is animated by its own clips; the game drives every
        // transform. Anything left running would fight it.
        for (let i = 0; i < result.animationGroups.length; i++) {
            result.animationGroups[i].stop();
        }

        for (let i = 0; i < result.meshes.length; i++) {
            const mesh = result.meshes[i];
            if (mesh.getTotalVertices() <= 0) continue;
            const source = mesh.material;
            const beauty = this._makeBeautyMaterial(i, source);
            mesh.material = beauty;
            mesh.renderingGroupId = 1;
            mesh.isPickable = false;
            this._register(mesh, beauty, i);
        }

        this.available = this.meshes.length > 0;
        this.setActive(false);
        return this.available;
    }

    /**
     * Measure the imported hierarchy at identity, in its own frame.
     *
     * `getHierarchyBoundingVectors` reports world space, so the measurement is
     * only meaningful while the root is unparented and untransformed — the same
     * trap `RockerKaki._loadBoard` documents. The optimisation pipeline already
     * normalised every one of these assets to a known size with its pivot at
     * the footprint centre, so this exists to verify that rather than to
     * correct it: a re-export that changed the scale should be visible here
     * instead of showing up as a pickup the size of a house.
     *
     * @returns {{min: Vector3, max: Vector3, size: Vector3}}
     */
    measure() {
        const parent = this.root.parent;
        const pos = this.root.position.clone();
        const scale = this.root.scaling.clone();
        this.root.parent = null;
        this.root.position.setAll(0);
        this.root.scaling.setAll(1);
        this.root.computeWorldMatrix(true);
        const b = this.root.getHierarchyBoundingVectors(true);
        const out = {
            min: b.min.clone(),
            max: b.max.clone(),
            size: b.max.subtract(b.min),
        };
        this.root.parent = parent;
        this.root.position.copyFrom(pos);
        this.root.scaling.copyFrom(scale);
        this.root.computeWorldMatrix(true);
        return out;
    }

    /**
     * Take over a mesh this class did not import.
     *
     * The pickup pedestals and route markers are built procedurally rather than
     * imported, but they still have to belong to the scene the way an imported
     * mesh does — same sun, same cascades, same prepass, same fog. Without this
     * they would need a material of their own, and a second material means a
     * second answer to what the light is doing.
     *
     * @param {import("@babylonjs/core/Meshes/mesh").Mesh} mesh parented already
     * @param {{colour?: Color3, roughness?: number, metallic?: number}} [opts]
     */
    adopt(mesh, opts = {}) {
        const index = this.meshes.length;
        const beauty = this._makeBeautyMaterial(index, null);
        beauty.setColor3("baseColor", opts.colour ?? _white);
        beauty.setFloat("roughness", opts.roughness ?? 0.62);
        beauty.setFloat("metallic", opts.metallic ?? 0);
        mesh.material = beauty;
        mesh.renderingGroupId = 1;
        mesh.isPickable = false;
        this._register(mesh, beauty, index);
        return beauty;
    }

    setActive(active) {
        this.active = !!active && this.available;
        for (let i = 0; i < this.meshes.length; i++) {
            this.meshes[i].setEnabled(this.active);
        }
    }

    /**
     * Upload this frame's sun, cascades and fog.
     *
     * Must run after `shadows.update`, or the asset carries last frame's
     * cascade matrices and its shadow swims a frame behind the terrain's.
     *
     * @param {Vector3} cameraPos
     */
    sync(cameraPos) {
        if (!this.active) return;
        this._cameraPos.copyFrom(cameraPos);
        const sky = this.sky;
        const sh = this.shadows;
        this._splits.set(sh.splits[0], sh.splits[1], sh.splits[2], sh.splits[3]);

        for (let i = 0; i < this.beautyMaterials.length; i++) {
            const material = this.beautyMaterials[i];
            const mesh = this.meshes[i];
            mesh.computeWorldMatrix(true).toNormalMatrix(this._normalMatrices[i]);
            material.setMatrix("normalMatrix", this._normalMatrices[i]);
            material.setVector3("cameraPos", this._cameraPos);
            material.setVector3("sunDir", sky.sunDir);
            material.setColor3("sunRadiance", sky.sunRadiance);
            material.setArray4("shR", sky.sh);
            bindMatrixArray(material, "cascadeMatrices", sh.matrixData);
            material.setVector4("cascadeSplits", this._splits);
            material.setArray4("cascadeParams", sh.paramData);
            material.setFloat("shadowTexel", sh.texelSize);
            material.setFloat("shadowSoftness", 1.4);
            material.setFloat("shadowBias", 0.012);
            material.setFloat("fogDensity", S.fogDensity);
            material.setFloat("fogHeightFalloff", S.fogHeightFalloff);
            material.setFloat("fogStart", S.fogStart);
            material.setFloat("aerialStrength", S.aerialStrength);
            material.setFloat("ambientIntensity", S.ambientIntensity);
        }
    }

    /**
     * Compile every pipeline this asset owns, behind the loading screen.
     *
     * The brief's requirement that no pickup causes a first-use hitch is
     * satisfied here and nowhere else: a WebGPU render pipeline is created the
     * first time a material is actually bound with a mesh, and the first time
     * that would otherwise happen is the first frame a pickup is visible, at
     * speed, on a mountain.
     */
    async warmUp() {
        for (let i = 0; i < this.beautyMaterials.length; i++) {
            await whenReady(
                this.beautyMaterials[i],
                `${this.name} beauty ${i}`,
                [this.meshes[i], false]
            );
        }
        for (let i = 0; i < this._shadowMaterials.length; i++) {
            const mesh = this.meshes[(i / ASSET_CASCADES) | 0];
            await whenReady(
                this._shadowMaterials[i], `${this.name} shadow ${i}`, [mesh, false]
            );
        }
        for (let i = 0; i < this._prepassMaterials.length; i++) {
            await whenReady(
                this._prepassMaterials[i],
                `${this.name} prepass ${i}`,
                [this.meshes[i], false]
            );
        }
    }

    dispose() {
        for (const m of this.meshes) m.dispose(false, false);
        for (const m of this.beautyMaterials) m.dispose();
        for (const m of this._shadowMaterials) m.dispose();
        for (const m of this._prepassMaterials) m.dispose();
        this._fallbackTexture.dispose();
        this.root.dispose();
        this.meshes.length = 0;
        this.beautyMaterials.length = 0;
        this.available = false;
    }

    // ------------------------------------------------------------- internals

    _makeBeautyMaterial(index, source) {
        const material = new ShaderMaterial(
            `${this.name}Beauty${index}`,
            this.scene,
            { vertex: "rocker", fragment: "rocker" },
            {
                attributes: ["position", "normal", "uv"],
                uniforms: [
                    "world", "normalMatrix", "viewProjection", "cameraPos",
                    "sunDir", "sunRadiance", "shR",
                    "cascadeMatrices", "cascadeSplits", "cascadeParams",
                    "shadowTexel", "shadowSoftness", "shadowBias",
                    "baseColor", "baseTextureStrength",
                    "normalTextureStrength", "ormTextureStrength",
                    "roughness", "metallic",
                    "fogDensity", "fogHeightFalloff", "fogStart",
                    "aerialStrength", "ambientIntensity",
                    ...SPELL_LIGHT_UNIFORMS,
                ],
                samplers: [
                    "baseTex", "normalTex", "ormTex", "skyLUT",
                    "cascade0", "cascade1", "cascade2",
                ],
                shaderLanguage: ShaderLanguage.WGSL,
                defines: [],
            }
        );
        // The ingredients are single-sided food shells whose interiors are
        // visible through a bitten edge or a lettuce leaf; the same choice the
        // hero path makes, for the same reason.
        material.backFaceCulling = false;

        const base = source?.albedoTexture ?? this._fallbackTexture;
        const normal = source?.bumpTexture ?? this._fallbackTexture;
        const orm = source?.metallicTexture ?? this._fallbackTexture;

        material.setTexture("baseTex", base);
        material.setTexture("normalTex", normal);
        material.setTexture("ormTex", orm);
        material.setTexture("skyLUT", this.sky.lut);
        for (let i = 0; i < CASCADE_COUNT; i++) {
            material.setTexture("cascade" + i, this.shadows.maps[i]);
        }
        material.setColor3("baseColor", source?.albedoColor ?? _white);
        material.setFloat("baseTextureStrength", base === this._fallbackTexture ? 0 : 1);
        material.setFloat("normalTextureStrength", normal === this._fallbackTexture ? 0 : 1);
        material.setFloat("ormTextureStrength", orm === this._fallbackTexture ? 0 : 1);
        // Read off the converted material rather than guessed. The offline
        // pipeline converts specular-glossiness to metallic-roughness precisely
        // so these two numbers mean something by the time they get here — left
        // as spec-gloss, Babylon populates neither and every ingredient lights
        // as raw metal.
        material.setFloat(
            "roughness",
            typeof source?.roughness === "number" ? source.roughness : 0.55
        );
        material.setFloat(
            "metallic",
            typeof source?.metallic === "number" ? source.metallic : 0
        );
        return material;
    }

    _register(mesh, beauty, index) {
        this.meshes.push(mesh);
        this.beautyMaterials.push(beauty);
        this._normalMatrices.push(new Matrix());
        this.triangles += (mesh.getTotalIndices() / 3) | 0;

        this.shadows.registerCaster(
            mesh,
            (cascade) => this._makeDepthMaterial(index, cascade),
            ASSET_CASCADES
        );

        const prepass = new ShaderMaterial(
            `${this.name}Prepass${index}`,
            this.scene,
            { vertex: "staticPrepass", fragment: "prepass" },
            {
                attributes: ["position"],
                uniforms: ["world", "viewProjection"],
                shaderLanguage: ShaderLanguage.WGSL,
                defines: [],
            }
        );
        prepass.backFaceCulling = false;
        this._prepassMaterials.push(prepass);
        this.depthPass.registerCaster(mesh, prepass);
    }

    _makeDepthMaterial(index, cascade) {
        const material = new ShaderMaterial(
            `${this.name}Depth${index}_${cascade}`,
            this.scene,
            { vertex: "staticDepth", fragment: "terrainDepth" },
            {
                attributes: ["position"],
                uniforms: ["world", "lightViewProjection"],
                shaderLanguage: ShaderLanguage.WGSL,
                defines: ["ROCKER_CASCADE " + cascade],
            }
        );
        material.backFaceCulling = false;
        this._shadowMaterials.push(material);
        return material;
    }
}
