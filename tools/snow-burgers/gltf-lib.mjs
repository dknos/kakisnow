/**
 * Locate the glTF-Transform SDK without adding it to the runtime dependency set.
 *
 * The asset pipeline is an offline, developer-machine concern; the shipped
 * bundle must not grow a dependency on it. It is therefore resolved at call
 * time from whichever of these exists, in order:
 *
 *   1. `GLTF_TRANSFORM_ROOT`, a directory containing `core/`, `extensions/`
 *      and `functions/`. Set this to pin an exact copy.
 *   2. The project's own `node_modules`, if someone has installed it there.
 *   3. The copy vendored inside the globally installed `@gltf-transform/cli`,
 *      which is where `npm i -g @gltf-transform/cli` actually puts the SDK.
 *
 * All three are the same published package; only the location differs. The
 * resolved root and version are reported into every generated document so a
 * report can be traced back to the exact tool that produced it.
 */

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");

const CANDIDATE_ROOTS = [
    process.env.GLTF_TRANSFORM_ROOT,
    path.join(REPO_ROOT, "node_modules", "@gltf-transform"),
    path.join(
        process.env.HOME ?? "",
        ".npm-global/lib/node_modules/@gltf-transform/cli/node_modules/@gltf-transform"
    ),
    "/usr/lib/node_modules/@gltf-transform/cli/node_modules/@gltf-transform",
    "/usr/local/lib/node_modules/@gltf-transform/cli/node_modules/@gltf-transform",
].filter(Boolean);

/** The three SDK packages this pipeline uses. */
const PACKAGES = ["core", "extensions", "functions"];

function resolveRoot() {
    for (const root of CANDIDATE_ROOTS) {
        if (PACKAGES.every((p) => existsSync(path.join(root, p, "package.json")))) {
            return root;
        }
    }
    throw new Error(
        "glTF-Transform SDK not found. Install it with " +
            "`npm i -g @gltf-transform/cli`, or set GLTF_TRANSFORM_ROOT to a " +
            "directory containing core/, extensions/ and functions/.\n" +
            "Searched:\n  " + CANDIDATE_ROOTS.join("\n  ")
    );
}

/**
 * Import the SDK.
 *
 * Returns the three module namespaces plus the provenance of the copy used.
 * The subpath is spelled out rather than left to package `exports`, because
 * Node will not resolve a bare directory import for an ESM package that lives
 * outside any `node_modules` on the importer's resolution path.
 */
export async function loadGltfTransform() {
    const root = resolveRoot();
    const require = createRequire(import.meta.url);
    const versions = {};
    const mods = {};

    for (const pkg of PACKAGES) {
        const dir = path.join(root, pkg);
        const meta = require(path.join(dir, "package.json"));
        versions[`@gltf-transform/${pkg}`] = meta.version;
        // `exports.default` is the ESM build; fall back to the conventional
        // filename for older layouts.
        const entry = typeof meta.exports === "object" && meta.exports?.default
            ? meta.exports.default
            : "./dist/index.modern.js";
        mods[pkg] = await import(pathToFileURL(path.join(dir, entry)).href);
    }

    return { root, versions, ...mods };
}

/** SHA-256 of a file, lowercase hex. */
export async function sha256(file) {
    const { createHash } = await import("node:crypto");
    const buf = await readFile(file);
    return createHash("sha256").update(buf).digest("hex");
}

/** Bytes, formatted the way the reports quote them. */
export function mb(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

/**
 * The seven supplied assets, keyed by the runtime name they end up with.
 *
 * `source` is the filename under `art/source-assets/snow-burgers/`; the
 * original Downloads path is recorded for provenance only and is never read by
 * anything that ships. `budget` is the runtime byte ceiling from the brief.
 */
export const ASSETS = [
    {
        key: "cheese",
        role: "ingredient",
        source: "cheese-source.glb",
        runtime: "ingredient-cheese.glb",
        origin: "C:\\Users\\rneeb\\Downloads\\cheese.glb",
        budget: 1.25 * 1024 * 1024,
    },
    {
        key: "patty",
        role: "ingredient",
        source: "patty-source.glb",
        runtime: "ingredient-patty.glb",
        origin: "C:\\Users\\rneeb\\Downloads\\raw_burger_meatball_-_patty.glb",
        budget: 1.25 * 1024 * 1024,
    },
    {
        key: "tomato",
        role: "ingredient",
        source: "tomato-source.glb",
        runtime: "ingredient-tomato.glb",
        origin: "C:\\Users\\rneeb\\Downloads\\tomato.glb",
        budget: 1.25 * 1024 * 1024,
    },
    {
        key: "lettuce",
        role: "ingredient",
        source: "lettuce-source.glb",
        runtime: "ingredient-lettuce.glb",
        origin: "C:\\Users\\rneeb\\Downloads\\lettuce.glb",
        budget: 1.25 * 1024 * 1024,
    },
    {
        key: "onion",
        role: "ingredient",
        source: "onion-source.glb",
        runtime: "ingredient-onion.glb",
        origin: "C:\\Users\\rneeb\\Downloads\\onion.glb",
        budget: 1.25 * 1024 * 1024,
    },
    {
        key: "burger",
        role: "reward",
        source: "burger-complete-source.glb",
        runtime: "burger-complete.glb",
        origin: "C:\\Users\\rneeb\\Downloads\\burger.glb",
        budget: 2.5 * 1024 * 1024,
    },
    {
        key: "rocket",
        role: "vehicle",
        source: "rocket-chair-snowboard-source.glb",
        runtime: "rocket-chair-snowboard.glb",
        origin: "C:\\Users\\rneeb\\Downloads\\rocket snowboard.glb",
        budget: 4 * 1024 * 1024,
    },
];

export const SOURCE_DIR = path.join(REPO_ROOT, "art", "source-assets", "snow-burgers");
export const RUNTIME_DIR = path.join(
    REPO_ROOT, "public", "assets", "models", "snow-burgers"
);
