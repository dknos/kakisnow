/**
 * Playable RockerKaki visual adapter — the rider and the board she sits on.
 *
 * The Blender-authored asset has a compact seated-character armature. This
 * adapter keeps it deliberately separate from the procedural Figure. Only the
 * selected hero advances or uploads uniforms. RockerKaki receives controller
 * motion, silhouette-safe whole-character poses, its own broad snow contact,
 * and the same custom sun/shadow/atmosphere pipeline as every native surface.
 *
 * The board is loaded and shaded here rather than in a module of its own
 * because it is not a separate object in any sense that matters: it shares the
 * hero's materials, cascades, prepass registration, warm-up and lifetime, and
 * every one of those would have to be duplicated to move it. What it does *not*
 * share is its transform, and that is the whole point of the chain below.
 *
 * The transform chain, outermost first:
 *
 *   motionRoot   world position and heading, straight off the controller.
 *   boardRoot    the board's own attitude: pitch fitted to the slope under its
 *                length, roll from the ground normal plus the carve's edge
 *                angle, and the sink into the trench it is cutting.
 *   visualRoot   the rider's body motion *relative to the board* — she is a
 *                passenger, so what she inherits is the board's attitude and
 *                what she adds is only her own lean and bob.
 *   assetRoot    the authored model's normalisation.
 *
 * The ordering is the substance of it. Putting the rider under the board is
 * what makes her tip with the edge instead of hovering level above a board
 * that tips underneath her.
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
import { expDamp } from "../core/camera.js";
import { CASCADE_COUNT } from "../render/shadows.js";
import { SPELL_LIGHT_UNIFORMS } from "../spells/spellLights.js";
import { BOARD, BOARD_BASE_LENGTH, setBoardScale } from "./boardSpec.js";

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

// --------------------------------------------------------------- board tuning
//
// How far the base rides below the undisturbed surface, as a fraction of the
// deck height, before `S.deformDepth` scales it.
//
// Expressed against the deck rather than in metres, because what the eye
// actually judges is how much board is left above the snow — and that is the
// deck minus the sink. A fixed 4.5 cm idle sink swallowed three quarters of a
// 6 cm deck and left the board looking half-buried whenever the player slowed
// down; worse, it did not track `S.boardScale`, so a bigger board would have
// been buried by exactly as much.
//
// Idle is small because a stationary board barely settles: it is wide, light,
// and cuts nothing. Ride is much larger, and still far under the terrain
// buffer's 0.55 m depression clamp — the board has to sit *in* the trench it
// writes, not at the bottom of it. The deformation pass keeps digging for as
// long as the brush is over a texel, so matching the floor would bury the board
// the moment the player held a line. Riding high in its own groove with the
// berms standing either side is what reads as displaced snow.
const BOARD_SINK_IDLE = 0.20;
const BOARD_SINK_RIDE = 1.75;

/**
 * How much of the sink the nose is lifted back out of, 0..1.
 *
 * Sinking the whole board would drive the nose into undisturbed snow — the
 * one part of the base that is always over ground nothing has cut yet. A real
 * board answers that with a planing angle, and the angle that puts the nose
 * exactly back at the surface is `asin(sink / halfEdge)`. Taking a fraction of
 * it leaves the nose slightly engaged, which is what actually cuts.
 */
const BOARD_PLANE_FRACTION = 0.62;

/** Radians of edge angle at a fully committed carve. */
const BOARD_EDGE_ANGLE = 0.52;

/** Nose-up attitude held in the air, radians. */
const BOARD_AIR_PITCH = 0.09;

/**
 * Metres the base rides above the CPU height mirror, at `sastrugiStrength` 1.
 *
 * This is not a fudge, it is a layer of terrain the mirror does not contain.
 * `heightAt` reconstructs the baked *macro* heightfield, but `snow.vertex.wgsl`
 * then displaces every vertex again by `terrainFine` — sastrugi at roughly a
 * 2.3 m wavelength, whose crests stand about 8 cm proud of the macro surface
 * and whose troughs fall about 5 cm below it. That layer is evaluated per
 * vertex on the GPU and never read back, so nothing on the CPU can see it.
 *
 * A 2.58 m character never showed the gap. A 7.6 cm board is thinner than the
 * relief it sits in, so it was being swallowed whole by ridges the grounding
 * code did not know were there.
 *
 * Lifting by the crest height rather than splitting the difference is the
 * physical answer, not a compromise: the effective edge is 2.4 m and the
 * sastrugi wavelength is 2.3 m, so the board spans a full ridge period and
 * rests on the high points, bridging the troughs exactly as a stiff plank does.
 * It scales with `S.sastrugiStrength` because that is the amplitude it is
 * clearing; turn the sastrugi off and the board settles back onto the macro
 * surface where it belongs.
 */
const BOARD_SASTRUGI_LIFT = 0.060;

/** Rate the board's attitude eases at, and the rate contact blends at. */
const BOARD_ATTITUDE_RATE = 11;
const BOARD_CONTACT_RATE = 8;

/**
 * How much of the board's attitude the rider takes back toward vertical.
 *
 * She is a passenger, not a hood ornament. The demo opens on a 43-degree face,
 * and a rider held rigidly perpendicular to a board on that face is reclining
 * into the hill with her weight behind the tail — which is both wrong and
 * exactly what it looks like. A real rider stands nearer vertical than the
 * slope and only commits to the board's plane through a turn.
 *
 * Roll recovers less than pitch on purpose: leaning into a carve is something
 * riders actually do, so most of the edge angle should reach her.
 */
const RIDER_UPRIGHT_PITCH = 0.55;
const RIDER_UPRIGHT_ROLL = 0.30;

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
        /**
         * Trick attitude lives on its own node between motion and board.
         *
         * The chain the tools and the terrain fit know — snowboardRoot's euler
         * pitch/roll, visualRoot's pose — is untouched: a spin or a flip is a
         * rotation of the whole rider-and-board assembly, exactly what a new
         * parent expresses and exactly what writing into `_solveBoard`'s eased
         * terms could not do without corrupting the ground fit on landing.
         * Euler on purpose; a quaternion here would poison nothing, but the
         * chain stays one convention throughout.
         */
        this.trickRoot = new TransformNode("trickRoot", scene);
        this.boardRoot = new TransformNode("snowboardRoot", scene);
        this.boardAsset = new TransformNode("snowboardAsset", scene);
        this.visualRoot = new TransformNode("rockerkakiVisual", scene);
        this.assetRoot = new TransformNode("rockerkakiAsset", scene);
        this.trickRoot.parent = this.motionRoot;
        this.boardRoot.parent = this.trickRoot;
        this.boardAsset.parent = this.boardRoot;
        // The rider is a passenger on the board, not a sibling of it.
        this.visualRoot.parent = this.boardRoot;
        this.assetRoot.parent = this.visualRoot;
        /** Eased tweak lean, from the held grab. */
        this._grabLean = 0;

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

        // ------------------------------------------------------------- board
        /** True once the board mesh imported and normalised. */
        this.boardAvailable = false;
        /** Whether she is riding it. Driven by `S.showBoard`. */
        this.boardVisible = true;
        /**
         * Where a mounted vehicle wants the rider's feet, overriding the deck.
         *
         * Null means there is no vehicle and the two answers already here
         * apply: on the deck when the board is visible, on the snow when it is
         * not. A second vehicle needs a third answer, because hiding the board
         * to make room for it would otherwise drop the rider to snow level and
         * leave her sitting through the chair she is supposed to be in.
         *
         * It is a number rather than a reference to the vehicle deliberately —
         * this class does not need to know what it is carrying, only how high
         * to sit her.
         */
        this.vehicleDeckHeight = null;
        /** The asset's own bounds at unit scale, measured once at import. */
        this._boardRawLength = 0;
        this._boardRawMin = new Vector3();
        this._boardRawMax = new Vector3();
        /** Metres the base currently rides below the undisturbed surface. */
        this.boardSink = 0;
        /** Eased attitude, radians. Positive pitch is nose-down, as Babylon's. */
        this._boardPitch = 0;
        this._boardRoll = 0;
        /** 0 in the air, 1 on the snow. Eased, so takeoff is not a snap. */
        this._contact = 1;
        /** Height of the deck above the contact plane, metres. */
        this._deckHeight = BOARD.deck;
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

        // Then centre her horizontally by mass rather than by extent.
        //
        // A bounding box is set by whatever reaches furthest, and what reaches
        // furthest here is the guitar held out to her left. Centring the box
        // therefore centres the guitar and pushes the *body* the other way —
        // measured at 19 cm right and 8 cm forward of where it should sit. That
        // was invisible while she was sitting on open snow, and is not once she
        // is sitting on something with a centreline to be off.
        //
        // The vertex centroid is the body, because the body is where the
        // geometry is, and it still accounts for the guitar's own mass rather
        // than pretending the guitar is not there.
        //
        // Y is deliberately left on the bounding box: she has to stand on her
        // lowest point, not on her average one.
        this.assetRoot.computeWorldMatrix(true);
        const mass = this._lateralCentroid(result.meshes);
        this.assetRoot.position.x -= mass.x;
        this.assetRoot.position.z -= mass.z;

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
            this._registerMesh(mesh, beauty);
        }

        await this._loadBoard();

        this.available = this.meshes.length > 0;
        this.setActive(false);
        return this.available;
    }

    /**
     * Import the board and ground it on its own contact points.
     *
     * The asset is authored at real-world scale and arrives long-axis-along-Z,
     * which is already the heading `motionRoot` yaws to — so the normalisation
     * here is a re-measure and a re-centre rather than a correction. The one
     * thing it does insist on is that the *base* lands at local y = 0: the
     * board is cambered, so its lowest points are the two contact patches out
     * near the feet, and those are what the snow is under. Grounding the waist
     * instead would bury the whole effective edge by the camber height.
     *
     * A failed import is not fatal. RockerKaki has ridden without a board for
     * the whole life of this project and can keep doing so.
     */
    async _loadBoard() {
        let result;
        try {
            result = await ImportMeshAsync(
                PUBLIC_BASE + "assets/models/snowboard.glb", this.scene
            );
        } catch (error) {
            console.warn("[kakisnow] snowboard unavailable:", error);
            return false;
        }

        for (let i = 0; i < result.meshes.length; i++) {
            const mesh = result.meshes[i];
            if (!mesh.parent) mesh.parent = this.boardAsset;
        }
        const nodes = result.transformNodes || [];
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!node.parent) node.parent = this.boardAsset;
        }
        for (let i = 0; i < result.animationGroups.length; i++) {
            result.animationGroups[i].stop();
        }

        // Measure detached, at identity.
        //
        // `getHierarchyBoundingVectors` reports *world* space. Once the board is
        // hanging off a moving rider on a pitched slope, a world-space centre is
        // no use for setting a local offset — the two are in different frames,
        // and subtracting one from the other throws the board off its rider.
        // Unhooking the parent for the measurement is what makes the numbers
        // below mean what they say, and it is why they are taken once and kept
        // rather than re-measured on every resize.
        const parent = this.boardAsset.parent;
        this.boardAsset.parent = null;
        this.boardAsset.position.setAll(0);
        this.boardAsset.scaling.setAll(1);
        this.boardAsset.computeWorldMatrix(true);
        let bounds = this.boardAsset.getHierarchyBoundingVectors(true);
        // Which way the board is lying is measured, not assumed. A re-export
        // that lands it across the heading would otherwise put a 2.5 m board
        // sideways under the rider and cut the trench across her path.
        if (bounds.max.x - bounds.min.x > bounds.max.z - bounds.min.z) {
            this.boardAsset.rotation.y = Math.PI * 0.5;
            this.boardAsset.computeWorldMatrix(true);
            bounds = this.boardAsset.getHierarchyBoundingVectors(true);
        }
        this._boardRawMin.copyFrom(bounds.min);
        this._boardRawMax.copyFrom(bounds.max);
        this.boardAsset.parent = parent;

        this._boardRawLength = Math.max(bounds.max.z - bounds.min.z, 0.001);

        // Verify the asset against the proportions the trench is cut from. Two
        // measurements, because width alone cannot catch a re-export that
        // changed the camber or the rocker, and drift here is silent until
        // somebody looks closely at a carve.
        const unit = BOARD_BASE_LENGTH / this._boardRawLength;
        const width = (bounds.max.x - bounds.min.x) * unit;
        const envelope = (bounds.max.y - bounds.min.y) * unit;
        if (Math.abs(width - BOARD.width / BOARD.scale) > 0.04 ||
            Math.abs(envelope - BOARD.envelope / BOARD.scale) > 0.02) {
            console.warn(
                "[kakisnow] board measures " + width.toFixed(3) + " x " +
                envelope.toFixed(3) + " m at unit scale against boardSpec's " +
                (BOARD.width / BOARD.scale).toFixed(3) + " x " +
                (BOARD.envelope / BOARD.scale).toFixed(3) +
                " m; the trench will not match the board"
            );
        }

        this.applyBoardScale();

        for (let i = 0; i < result.meshes.length; i++) {
            const mesh = result.meshes[i];
            if (mesh.getTotalVertices() <= 0) continue;
            const source = mesh.material;
            const beauty = this._makeBeautyMaterial(
                "snowboardBeauty" + i,
                source,
                source && source.albedoColor ? source.albedoColor : _white,
                // The asset carries a specular/glossiness workflow, which
                // Babylon converts without ever populating metallic-roughness.
                // A waxed base and a printed topsheet are both far glossier
                // than the 0.58 the character path falls back to.
                0.34,
                0,
                mesh
            );
            mesh.material = beauty;
            mesh.renderingGroupId = 1;
            mesh.isPickable = false;
            this._registerMesh(mesh, beauty);
        }

        this.boardAvailable = true;
        return true;
    }

    /**
     * Resize the board and re-ground it, from `S.boardScale`.
     *
     * Uniform scaling, because the sidecut, camber and printed graphic are all
     * proportions of each other and squashing one axis to hit a target width
     * would show in every one of them.
     *
     * The re-centring has to run again after every resize, and the `-min.y` in
     * particular: the board is cambered, so its lowest points are the two
     * contact patches out near the feet, and those are what the snow is under.
     * Grounding the waist instead buries the whole effective edge by the camber
     * height, and the camber grows with the board.
     */
    applyBoardScale() {
        if (!this._boardRawLength) return;
        setBoardScale(S.boardScale);

        // Arithmetic on the bounds measured at import, not a fresh measurement.
        // The mesh is only ever uniformly scaled, so its local extents scale
        // with it exactly — and re-measuring here would read world space, which
        // is the wrong frame the moment the rider is anywhere but the origin.
        const k = BOARD.length / this._boardRawLength;
        const lo = this._boardRawMin;
        const hi = this._boardRawMax;
        this.boardAsset.scaling.setAll(k);
        this.boardAsset.position.set(
            -(lo.x + hi.x) * 0.5 * k,
            -lo.y * k,
            -(lo.z + hi.z) * 0.5 * k
        );
        this.boardAsset.computeWorldMatrix(true);

        // The deck at the waist — not the mesh's total vertical extent, which is
        // the tips' topsheet and stands higher. Seating her on that would float
        // her that far above the board she is sitting on.
        this._deckHeight = BOARD.deck;
    }

    /**
     * Show or hide the board.
     *
     * Hiding it is not just a visibility flag: with no board there is no deck to
     * sit on and no base to sink, so she goes back to sitting on the snow
     * itself. Terrain conformance stays either way — that part is not the
     * board's doing, and she was sitting flat on 43-degree faces before it
     * existed.
     */
    setBoardVisible(visible) {
        this.boardVisible = !!visible && this.boardAvailable;
        const meshes = this.boardAsset.getChildMeshes(false);
        for (let i = 0; i < meshes.length; i++) {
            meshes[i].setEnabled(this.active && this.boardVisible);
        }
    }

    /**
     * Centroid of the drawn vertices on the horizontal plane, in world space.
     *
     * One pass over the imported positions, at load. The mesh is skinned, but
     * its bones are held in the authored pose for the reasons in `update`, so
     * the bind-pose vertices this reads are the vertices that get drawn.
     *
     * @param {import("@babylonjs/core/Meshes/mesh").Mesh[]} meshes
     */
    _lateralCentroid(meshes) {
        let sx = 0;
        let sz = 0;
        let n = 0;
        for (let i = 0; i < meshes.length; i++) {
            const mesh = meshes[i];
            if (mesh.getTotalVertices() <= 0) continue;
            const pos = mesh.getVerticesData("position");
            if (!pos) continue;
            mesh.computeWorldMatrix(true);
            const m = mesh.getWorldMatrix().m;
            for (let v = 0; v < pos.length; v += 3) {
                const x = pos[v];
                const y = pos[v + 1];
                const z = pos[v + 2];
                sx += m[0] * x + m[4] * y + m[8] * z + m[12];
                sz += m[2] * x + m[6] * y + m[10] * z + m[14];
                n++;
            }
        }
        return n > 0 ? { x: sx / n, z: sz / n } : { x: 0, z: 0 };
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

    /**
     * Index is taken from the registry rather than passed in: the rider and the
     * board are imported from two files with their own mesh numbering, and
     * naming two materials the same makes a duplicate hard to see in a capture.
     */
    _registerMesh(mesh, beauty) {
        const index = this.meshes.length;
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
        // Last, and unconditionally: the loop above has just enabled the board
        // along with everything else, and the board answers to its own setting.
        this.setBoardVisible(this.boardVisible);
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
        this.motionRoot.rotation.y = ch.facing;

        // The trick attitude, straight off the controller. Spin about the
        // rider's up, flip about her side axis — Babylon's YXZ euler order
        // applies yaw first, so the flip axis turns with the spin, which is
        // how a body actually rotates. The tweak tips board and rider
        // together: a grab IS the board pulled over, not a lean on top of it.
        const grabWant = ch.grabDir === "left" ? -0.30
            : ch.grabDir === "right" ? 0.30 : 0;
        this._grabLean = expDamp(this._grabLean, grabWant, 9, dt);
        this.trickRoot.rotation.y = ch.trickSpin;
        this.trickRoot.rotation.x = ch.trickFlip;
        this.trickRoot.rotation.z = this._grabLean;
        // Rotate about the rider's middle, not her feet: a flip pivots the
        // pair around their shared centre of mass, a metre or so up.
        this.trickRoot.position.y = 0;
        if (ch.trickFlip !== 0 || ch.trickSpin !== 0 || this._grabLean !== 0) {
            const pivot = 1.05;
            this.trickRoot.position.y =
                pivot - pivot * Math.cos(ch.trickFlip);
            this.trickRoot.position.z = pivot * Math.sin(ch.trickFlip);
        } else {
            this.trickRoot.position.z = 0;
        }

        // Before the rider: she rides whatever attitude this leaves the board
        // in, and solving her first would pose her against last frame's board.
        this._solveBoard(dt);

        const air = ch.grounded ? 0 : 1;
        const crash = ch.crashed ? 1 : 0;
        const rideCycle = Math.sin(
            this._animTime * (2.8 + Math.min(ch.speed, 18) * 0.16)
        );
        const rideMotion = ch.grounded ? ch.surf : 0;
        // Everything below is the rider *relative to the deck*. The board's own
        // pitch, roll and sink are already in the parent, so these are only the
        // things her body does that the board does not.
        // On the deck when there is one, on the snow when there is not.
        this.visualRoot.position.y = this.vehicleDeckHeight !== null
            ? this.vehicleDeckHeight
            : this.boardVisible
                ? this._deckHeight - 0.012
                : 0;
        this.visualRoot.rotation.x =
            -this._boardPitch * RIDER_UPRIGHT_PITCH
            + ch.surf * 0.13 + ch.speed * 0.003 - air * 0.18
            + landing * 0.11
            // The tumble slump: folded forward, low. The rotation itself is
            // the trick node's; this is only what her body does inside it.
            + crash * 0.52;
        this.visualRoot.rotation.y =
            0.13 + air * Math.sin(ch.airTime * 2.2) * 0.055;
        // Halved against the standing version of this line: the edge angle now
        // lives on the board, and a rider who repeats it on top of it is
        // leaning twice as far into every turn as she is actually turning.
        this.visualRoot.rotation.z =
            -this._boardRoll * RIDER_UPRIGHT_ROLL
            - ch.lean * (0.05 + ch.surf * 0.08)
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
            - landing * 0.09
            - crash * 0.14;

        this.rigPose = crash > 0
            ? "crash"
            : air > 0
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

    /**
     * Fit the board to the snow under it.
     *
     * Three questions, answered from three different sources on purpose:
     *
     *   pitch  from the terrain sampled at the nose and at the tail. A board is
     *          stiff. It spans the ground between its contact points rather
     *          than following every ripple under its middle, and the only way
     *          to get that is to ask the terrain about both ends.
     *   roll   from the ground normal, plus the carve's edge angle. Not from
     *          edge samples: the CPU height mirror is on a 1 m grid and the
     *          edges sit 19 cm off centre, so a cross-slope differenced across
     *          the waist would be B-spline reconstruction noise wearing a
     *          terrain costume.
     *   sink   from how hard the board is working, scaled by the same
     *          `S.deformDepth` the terrain displaces by — so moving that slider
     *          moves the board with the snow instead of leaving it hanging
     *          above a trench that got deeper without it.
     *
     * @param {number} dt seconds
     */
    _solveBoard(dt) {
        const ch = this.controller;
        const terrain = this.terrain;

        // In the air the snow has no opinion. On the ground it has all of them.
        this._contact = expDamp(
            this._contact, ch.grounded ? 1 : 0, BOARD_CONTACT_RATE, dt
        );
        const contact = this._contact;

        const half = BOARD.halfEdge;
        const fx = Math.sin(ch.facing);
        const fz = Math.cos(ch.facing);
        const hNose = terrain.heightAt(
            ch.position.x + fx * half, ch.position.z + fz * half
        );
        const hTail = terrain.heightAt(
            ch.position.x - fx * half, ch.position.z - fz * half
        );

        // How hard the base is working. Speed alone is not it: a board pushed
        // sideways at a standstill still displaces snow, and one coasting flat
        // barely marks it.
        //
        // Measured in deck heights, so a bigger board sinks proportionally
        // rather than disappearing into a hole sized for a smaller one.
        const work = ch.surf * Math.min(1, ch.speed / 7);
        const sinkWant = contact * S.deformDepth * this._deckHeight *
            (this.boardVisible ? 1 : 0) *
            (BOARD_SINK_IDLE + (BOARD_SINK_RIDE - BOARD_SINK_IDLE) * work);
        this.boardSink = expDamp(
            this.boardSink, sinkWant, BOARD_ATTITUDE_RATE, dt
        );

        // Pitch. Babylon rotates left-handed about X, so a positive angle drops
        // the nose — ground rising ahead has to raise it, hence the negation.
        const slope = (hNose - hTail) / (half * 2);
        const plane = Math.asin(Math.min(0.9, this.boardSink / half))
                    * BOARD_PLANE_FRACTION;
        const pitchWant =
            (-Math.atan(slope) - plane) * contact
            - BOARD_AIR_PITCH * (1 - contact);
        this._boardPitch = expDamp(
            this._boardPitch, pitchWant, BOARD_ATTITUDE_RATE, dt
        );

        // Roll. The rise per metre travelled along the board's right is the
        // ground normal's horizontal part projected onto that right.
        const n = ch.groundNormal;
        const rx = Math.cos(ch.facing);
        const rz = -Math.sin(ch.facing);
        const riseRight = -(n.x * rx + n.z * rz) / Math.max(n.y, 0.2);
        // The edge angle runs *against* the carve. `carve` is positive turning
        // right, a right turn is ridden on the right edge, and a positive
        // rotation about +z in this frame lifts the right side — so it
        // subtracts. It is the same sign the wake and the berms resolve from.
        const rollWant =
            Math.atan(riseRight) * contact
            - ch.carve * BOARD_EDGE_ANGLE;
        this._boardRoll = expDamp(
            this._boardRoll, rollWant, BOARD_ATTITUDE_RATE, dt
        );

        // Span, then sink. On a crest the mean of the two ends sits below the
        // ground under the middle, and a board that took the mean would drive
        // its belly through the snow; taking the higher of the two is what
        // makes it pivot over the crest the way a rigid plank does.
        const span = Math.max((hNose + hTail) * 0.5 - ch.groundY, 0);
        this.boardRoot.position.y =
            (span + BOARD_SASTRUGI_LIFT * S.sastrugiStrength) * contact
            - this.boardSink;
        this.boardRoot.rotation.x = this._boardPitch;
        this.boardRoot.rotation.z = this._boardRoll;
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
        this.boardAsset.dispose();
        this.boardRoot.dispose();
        this.motionRoot.dispose();
    }
}
