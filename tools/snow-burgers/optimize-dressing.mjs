/**
 * Decimate the supplied environment assets into dressing-sized derivatives.
 *
 * These arrive as photogrammetry: hundreds of thousands of triangles and
 * 4096-to-8192-square textures, authored to be looked at from a metre away.
 * The dressing reads them at forty metres, scattered, several hundred at a
 * time — so the error bound is loose, the texture budget is small, and what is
 * being preserved is the silhouette rather than the surface.
 *
 *   node tools/snow-burgers/optimize-dressing.mjs
 */
import { loadGltfTransform } from "./gltf-lib.mjs";
import { createRequire } from "node:module";
import path from "node:path";
import { statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SRC = "/home/nemoclaw/kakisnow/art/source-assets/snow-burgers/";
const OUT = "/home/nemoclaw/kakisnow/public/assets/models/snow-burgers/";

/** Triangle target and texture ceiling per asset. Both chosen for 40 m. */
const JOBS = [
    { in: "bush-source.glb", out: "dressing-bush.glb", tris: 4200, tex: 512 },
    { in: "rock-source.glb", out: "dressing-rock.glb", tris: 6000, tex: 512 },
    // The lodge. Read from twenty metres at the end of a run rather than
    // scattered across a mountainside, so it keeps its geometry and most of
    // its texture resolution — it is the one built thing the player stops at.
    { in: "hut-source.glb", out: "camp-hut.glb", tris: 12000, tex: 512 },
    // An authored village, kept as one laid-out group rather than cut into
    // separate cabins: the file already arranges them the way a hamlet sits on
    // a slope, and re-scattering them would throw that away to rebuild it.
    // Untextured, so it costs geometry only.
    { in: "village-source.glb", out: "camp-village.glb", tris: 22000, tex: 512 },
];

const sdk = await loadGltfTransform();
const req = createRequire(path.join(path.dirname(sdk.root), "_r.cjs"));
const draco3d = req("draco3dgltf");
const sharp = req("sharp");
const { MeshoptSimplifier } = await import(pathToFileURL(req.resolve("meshoptimizer")).href);
await MeshoptSimplifier.ready;
const f = sdk.functions;

for (const job of JOBS) {
    const io = new sdk.core.NodeIO().registerExtensions(sdk.extensions.ALL_EXTENSIONS);
    io.registerDependencies({
        "draco3d.decoder": await draco3d.createDecoderModule(),
        "draco3d.encoder": await draco3d.createEncoderModule(),
    });
    const doc = await io.read(SRC + job.in);
    const root = doc.getRoot();
    const scene = root.getDefaultScene() ?? root.listScenes()[0];
    const clear = (n) => { for (const c of [...n.listChildren()]) clear(c); f.clearNodeTransform(n); };
    for (const n of scene.listChildren()) clear(n);

    let before = 0;
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
        before += Math.floor((p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3);
    }
    // A loose error bound on purpose: a tight one stops the simplifier long
    // before the target and ships a 30,000-triangle shrub. The silhouette is
    // what survives at this distance and the surface detail is not.
    await doc.transform(
        f.dedup(), f.weld(),
        f.simplify({ simplifier: MeshoptSimplifier, ratio: job.tris / before, error: 0.06 }),
        f.normals({ overwrite: false }),
        f.textureCompress({
            encoder: sharp, targetFormat: "webp",
            resize: [job.tex, job.tex], resizeFilter: f.TextureResizeFilter.LANCZOS3,
            quality: 84, effort: 100,
        }),
        f.prune({ keepAttributes: false }),
        f.draco({ method: "edgebreaker", quantizePosition: 12, quantizeNormal: 8, quantizeTexcoord: 11 })
    );
    let after = 0;
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
        after += Math.floor((p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3);
    }
    await io.write(OUT + job.out, doc);
    const b = f.getBounds(root.getDefaultScene() ?? root.listScenes()[0]);
    console.log(
        job.out.padEnd(22),
        (statSync(SRC + job.in).size / 1048576).toFixed(1) + "MB ->",
        (statSync(OUT + job.out).size / 1024).toFixed(0) + "kB,",
        before + " -> " + after + " tris,",
        root.listMeshes().length + " meshes,",
        "size " + b.max.map((v, i) => (v - b.min[i]).toFixed(1)).join("x")
    );
}
