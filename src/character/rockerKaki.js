/**
 * Playable RockerKaki visual adapter.
 *
 * The Blender-authored asset has a compact seated-character armature. This
 * adapter keeps it deliberately separate from the procedural Figure. Only the
 * selected hero advances or uploads uniforms. RockerKaki receives controller
 * motion, silhouette-safe whole-character poses, its own broad snow contact,
 * and the same custom sun/shadow/atmosphere pipeline as every native surface.
 *
 * Allocation per frame: none.
 */

import "@babylonjs/loaders/glTF";

import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { DracoDecoder } from "@babylonjs/core/Meshes/Compression/dracoDecoder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Constants } from "@babylonjs/core/Engines/constants.js";
import {
    Color3, Matrix, Quaternion, Vector3, Vector4,
} from "@babylonjs/core/Maths/math.js";

import { S } from "../core/settings.js";
import { whenReady, bindMatrixArray } from "../core/gpuUtil.js";
import { CASCADE_COUNT } from "../render/shadows.js";
import { SPELL_LIGHT_UNIFORMS } from "../spells/spellLights.js";

const PUBLIC_BASE = import.meta.env.BASE_URL;

DracoDecoder.DefaultConfiguration = {
    wasmUrl: PUBLIC_BASE + "assets/decoders/draco_wasm_wrapper_gltf.js",
    wasmBinaryUrl: PUBLIC_BASE + "assets/decoders/draco_decoder_gltf.wasm",
    fallbackUrl: PUBLIC_BASE + "assets/decoders/draco_decoder_gltf.js",
};

const TARGET_WIDTH = 1.82;
const TARGET_HEIGHT = 2.58;
const MODEL_CLEARANCE = 0.008;
const ROCKER_CASCADES = 2;

const _white = new Color3(1, 1, 1);

export class RockerKaki {
    /**
     * @param {{
     *   scene: import("@babylonjs/core/scene").Scene,
     *   terrain: import("../terrain/terrain.js").Terrain,
     *   sky: import("../render/sky.js").Sky,
     *   shadows: import("../render/shadows.js").ShadowSystem,
     *   depthPass: import("../render/depthPass.js").DepthPass,
     *   controller: import("./controller.js").CharacterController,
     * }} options
     */
    constructor({ scene, terrain, sky, shadows, depthPass, controller }) {
        this.scene = scene;
        this.terrain = terrain;
        this.sky = sky;
        this.shadows = shadows;
        this.depthPass = depthPass;
        this.controller = controller;

        this.motionRoot = new TransformNode("rockerkakiMotion", scene);
        this.visualRoot = new TransformNode("rockerkakiVisual", scene);
        this.assetRoot = new TransformNode("rockerkakiAsset", scene);
        this.visualRoot.parent = this.motionRoot;
        this.assetRoot.parent = this.visualRoot;

        /** @type {import("@babylonjs/core/Meshes/mesh").Mesh[]} */
        this.meshes = [];
        /** @type {ShaderMaterial[]} */
        this.beautyMaterials = [];
        /** @type {ShaderMaterial[]} */
        this._shadowMaterials = [];
        /** @type {ShaderMaterial[]} */
        this._prepassMaterials = [];
        /** @type {Matrix[]} inverse-transpose world matrices, one per mesh */
        this._normalMatrices = [];
        /** @type {(import("@babylonjs/core/Bones/skeleton").Skeleton|null)[]} */
        this._meshSkeletons = [];
        this._rigJoints = new Map();
        this._poseDelta = new Quaternion();
        this.rigged = false;
        this.rigBoneCount = 0;
        this.rigBoneNames = [];
        this.rigPose = "rest";
        this._animTime = 0;
        this._landingPose = 0;

        this._fallbackTexture = RawTexture.CreateRGBATexture(
            new Uint8Array([255, 255, 255, 255]),
            1, 1, scene, false, false,
            Constants.TEXTURE_NEAREST_SAMPLINGMODE
        );
        this._fallbackTexture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
        this._fallbackTexture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;

        this.available = false;
        this.active = false;
        this.triangles = 0;
        this._splits = new Vector4(0, 0, 0, 0);
        this._cameraPos = new Vector3();
        this._modelBaseY = 0;
    }

    /** Load, normalise, register, and leave visibility to the hero selector. */
    async load() {
        let result;
        try {
            result = await ImportMeshAsync(
                PUBLIC_BASE + "assets/models/rockerkaki-rigged.glb", this.scene
            );
        } catch (error) {
            console.warn("[kakisnow] RockerKaki unavailable:", error);
            return false;
        }

        // Parent every imported top-level node without assuming which one is
        // Babylon's synthetic import root. Authored rotations remain untouched.
        for (let i = 0; i < result.meshes.length; i++) {
            const mesh = result.meshes[i];
            if (!mesh.parent) mesh.parent = this.assetRoot;
        }
        const nodes = result.transformNodes || [];
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!node.parent) node.parent = this.assetRoot;
        }
        for (let i = 0; i < result.animationGroups.length; i++) {
            result.animationGroups[i].stop();
        }
        this._captureRig(result.skeletons);

        this.assetRoot.computeWorldMatrix(true);
        let bounds = this.assetRoot.getHierarchyBoundingVectors(true);
        const width = Math.max(bounds.max.x - bounds.min.x, 0.001);
        const height = Math.max(bounds.max.y - bounds.min.y, 0.001);
        this.assetRoot.scaling.set(
            TARGET_WIDTH / width,
            TARGET_HEIGHT / height,
            TARGET_WIDTH / width
        );
        this.assetRoot.computeWorldMatrix(true);

        bounds = this.assetRoot.getHierarchyBoundingVectors(true);
        this.assetRoot.position.set(
            -(bounds.min.x + bounds.max.x) * 0.5,
            MODEL_CLEARANCE - bounds.min.y,
            -(bounds.min.z + bounds.max.z) * 0.5 - 0.02
        );
        this._modelBaseY = this.assetRoot.position.y;

        for (let i = 0; i < result.meshes.length; i++) {
            const mesh = result.meshes[i];
            if (mesh.getTotalVertices() <= 0) continue;
            const source = mesh.material;
            const beauty = this._makeBeautyMaterial(
                "rockerkakiBeauty" + i,
                source,
                source && source.albedoColor ? source.albedoColor : _white,
                source && typeof source.roughness === "number" ? source.roughness : 0.58,
                source && typeof source.metallic === "number" ? source.metallic : 0,
                mesh
            );
            mesh.material = beauty;
            mesh.renderingGroupId = 1;
            mesh.isPickable = false;
            this._registerMesh(mesh, beauty, i);
        }

        this.available = this.meshes.length > 0;
        this.setActive(false);
        return this.available;
    }

    _captureRig(skeletons) {
        const skeleton = skeletons && skeletons[0];
        if (!skeleton) return;
        // These custom WGSL passes intentionally use the compact uniform palette
        // path. Babylon otherwise prefers a bone texture on WebGPU, leaving the
        // declared mBones array unbound and collapsing every vertex to the root.
        skeleton.useTextureToStoreBoneMatrices = false;
        this.rigged = true;
        this.rigBoneCount = skeleton.bones.length;
        this.rigBoneNames = skeleton.bones.map((bone) => bone.name);
        const poseNames = [
            "pelvis", "spine", "chest", "head",
            "arm.L", "arm.R", "leg.L", "leg.R",
        ];
        for (let i = 0; i < poseNames.length; i++) {
            const bone = skeleton.bones.find((candidate) =>
                candidate.name === poseNames[i]
            );
            if (!bone) continue;
            const node = bone.getTransformNode();
            if (!node) continue;
            if (!node.rotationQuaternion) {
                node.rotationQuaternion = Quaternion.FromEulerAngles(
                    node.rotation.x, node.rotation.y, node.rotation.z
                );
                node.rotation.setAll(0);
            }
            this._rigJoints.set(poseNames[i], {
                node,
                base: node.rotationQuaternion.clone(),
                posed: node.rotationQuaternion.clone(),
            });
        }
    }

    _registerMesh(mesh, beauty, index) {
        this.meshes.push(mesh);
        this.beautyMaterials.push(beauty);
        this._normalMatrices.push(new Matrix());
        this._meshSkeletons.push(mesh.skeleton || null);
        this.triangles += (mesh.getTotalIndices() / 3) | 0;

        this.shadows.registerCaster(
            mesh,
            (cascade) => this._makeDepthMaterial(
                "rockerkakiDepth" + index + "_" + cascade, cascade, mesh
            ),
            ROCKER_CASCADES
        );

        const skinned = !!mesh.skeleton;
        const prepass = new ShaderMaterial(
            "rockerkakiPrepass" + index,
            this.scene,
            { vertex: "staticPrepass", fragment: "prepass" },
            {
                attributes: skinned
                    ? ["position"]
                    : ["position"],
                uniforms: ["world", "viewProjection"],
                shaderLanguage: ShaderLanguage.WGSL,
                defines: skinned
                    ? ["ROCKER_SKINNED"]
                    : [],
            }
        );
        prepass.backFaceCulling = false;
        this._prepassMaterials.push(prepass);
        this.depthPass.registerCaster(mesh, prepass);
    }

    _makeDepthMaterial(name, cascade, mesh) {
        const skinned = !!mesh.skeleton;
        const material = new ShaderMaterial(
            name,
            this.scene,
            { vertex: "staticDepth", fragment: "terrainDepth" },
            {
                attributes: skinned
                    ? ["position"]
                    : ["position"],
                uniforms: ["world", "lightViewProjection"],
                shaderLanguage: ShaderLanguage.WGSL,
                defines: [
                    "ROCKER_CASCADE " + cascade,
                    ...(skinned ? ["ROCKER_SKINNED"] : []),
                ],
            }
        );
        material.backFaceCulling = false;
        this._shadowMaterials.push(material);
        return material;
    }

    _makeBeautyMaterial(name, source, color, roughness, metallic, mesh = null) {
        const skinned = !!(mesh && mesh.skeleton);
        const material = new ShaderMaterial(
            name,
            this.scene,
            { vertex: "rocker", fragment: "rocker" },
            {
                attributes: skinned
                    ? ["position", "normal", "uv"]
                    : ["position", "normal", "uv"],
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
                defines: skinned
                    ? ["ROCKER_SKINNED"]
                    : [],
            }
        );
        material.backFaceCulling = false;

        const base = source && source.albedoTexture
            ? source.albedoTexture : this._fallbackTexture;
        const normal = source && source.bumpTexture
            ? source.bumpTexture : this._fallbackTexture;
        const orm = source && source.metallicTexture
            ? source.metallicTexture : this._fallbackTexture;

        material.setTexture("baseTex", base);
        material.setTexture("normalTex", normal);
        material.setTexture("ormTex", orm);
        material.setTexture("skyLUT", this.sky.lut);
        for (let i = 0; i < CASCADE_COUNT; i++) {
            material.setTexture("cascade" + i, this.shadows.maps[i]);
        }
        material.setColor3("baseColor", color);
        material.setFloat("baseTextureStrength", base === this._fallbackTexture ? 0 : 1);
        material.setFloat("normalTextureStrength", normal === this._fallbackTexture ? 0 : 1);
        material.setFloat("ormTextureStrength", orm === this._fallbackTexture ? 0 : 1);
        material.setFloat("roughness", roughness);
        material.setFloat("metallic", metallic);
        return material;
    }

    setActive(active) {
        this.active = !!active && this.available;
        for (let i = 0; i < this.meshes.length; i++) {
            this.meshes[i].setEnabled(this.active);
        }
    }

    /** Copy controller motion without allocating. */
    update(dt = 0) {
        if (!this.active) return;
        const ch = this.controller;
        this._animTime += dt;
        if (ch.landed) {
            this._landingPose = Math.max(
                this._landingPose, Math.min(1, ch.landingImpact)
            );
        } else {
            this._landingPose *= Math.exp(-dt * 7.5);
        }
        const landing = this._landingPose;

        this.motionRoot.position.copyFrom(ch.position);
        this.motionRoot.position.y += 0.012 + ch.surf * 0.04;
        this.motionRoot.rotation.y = ch.facing;

        const air = ch.grounded ? 0 : 1;
        const rideCycle = Math.sin(
            this._animTime * (2.8 + Math.min(ch.speed, 18) * 0.16)
        );
        const rideMotion = ch.grounded ? ch.surf : 0;
        this.visualRoot.rotation.x =
            ch.surf * 0.13 + ch.speed * 0.003 - air * 0.18
            + landing * 0.11;
        this.visualRoot.rotation.y =
            0.13 + air * Math.sin(ch.airTime * 2.2) * 0.055;
        this.visualRoot.rotation.z =
            -ch.lean * (0.10 + ch.surf * 0.16)
            + rideCycle * rideMotion * 0.065
            + air * Math.sin(ch.airTime * 4.2) * 0.060;

        const stride = Math.abs(Math.sin(ch.gaitPhase * Math.PI * 2))
                     * Math.min(1, ch.speed / 5.4);
        this.assetRoot.position.y =
            this._modelBaseY
            + stride * 0.006
            + ch.surf * 0.045
            + rideCycle * rideMotion * 0.018
            + air * 0.045
            - landing * 0.09;

        this.rigPose = air > 0
            ? "air"
            : landing > 0
                ? "land"
                : Math.abs(ch.lean) > 0.16
                    ? "carve"
                    : "ride";
        // RockerKaki's face, hair, guitar and body are many disconnected
        // surfaces whose automatic-looking blended weights stretch visibly.
        // Preserve every authored island exactly. The skeleton remains embedded
        // and validated, while safe runtime animation lives on visualRoot.
        this._poseJoint("pelvis", 0, 0, 0);
        this._poseJoint("spine", 0, 0, 0);
        this._poseJoint("chest", 0, 0, 0);
        this._poseJoint("head", 0, 0, 0);
        this._poseJoint("arm.L", 0, 0, 0);
        this._poseJoint("arm.R", 0, 0, 0);
        this._poseJoint("leg.L", 0, 0, 0);
        this._poseJoint("leg.R", 0, 0, 0);
    }

    _poseJoint(name, x, y, z) {
        const joint = this._rigJoints.get(name);
        if (!joint) return;
        Quaternion.FromEulerAnglesToRef(x, y, z, this._poseDelta);
        joint.base.multiplyToRef(this._poseDelta, joint.posed);
        joint.node.rotationQuaternion.copyFrom(joint.posed);
    }

    /** Publish current custom-lighting uniforms after camera and cascades move. */
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

    async warmUp() {
        for (let i = 0; i < this.beautyMaterials.length; i++) {
            await whenReady(
                this.beautyMaterials[i],
                "rockerkaki beauty " + i,
                [this.meshes[i], false]
            );
        }
        for (let i = 0; i < this._shadowMaterials.length; i++) {
            const mesh = this.meshes[(i / ROCKER_CASCADES) | 0];
            await whenReady(
                this._shadowMaterials[i],
                "rockerkaki shadow " + i,
                [mesh, false]
            );
        }
        for (let i = 0; i < this._prepassMaterials.length; i++) {
            await whenReady(
                this._prepassMaterials[i],
                "rockerkaki prepass " + i,
                [this.meshes[i], false]
            );
        }
    }

    dispose() {
        for (let i = 0; i < this.meshes.length; i++) this.meshes[i].dispose();
        for (let i = 0; i < this.beautyMaterials.length; i++) {
            this.beautyMaterials[i].dispose();
        }
        for (let i = 0; i < this._shadowMaterials.length; i++) {
            this._shadowMaterials[i].dispose();
        }
        for (let i = 0; i < this._prepassMaterials.length; i++) {
            this._prepassMaterials[i].dispose();
        }
        this._fallbackTexture.dispose();
        this.assetRoot.dispose();
        this.visualRoot.dispose();
        this.motionRoot.dispose();
    }
}
