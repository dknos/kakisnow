/**
 * Sketchfab fetcher for the Big Air Basin venue kit.
 *
 * Three subcommands, all of them writing files rather than piping remote bytes
 * anywhere near a shell:
 *
 *   node tools/big-air/sketchfab.mjs thumbs <uid...>
 *       Model metadata (name, author, licence, triangles) into
 *       `art/source-assets/big-air/meta/<uid>.json`, and the largest preview
 *       image beside it, so a candidate can be looked at before it is pulled.
 *
 *   node tools/big-air/sketchfab.mjs get <uid> <slug>
 *       Downloads the GLB archive to `art/source-assets/big-air/<slug>.glb`
 *       (or `.zip` when Sketchfab only offers the source archive) and records
 *       bytes plus SHA-256 in the meta file. Provenance is written at download
 *       time, which is the only time it is reliably known.
 *
 *   node tools/big-air/sketchfab.mjs ledger
 *       Prints the ASSETS.md rows for everything pulled so far.
 *
 * The token comes from SKETCHFAB_API_TOKEN, read out of ~/.nemoclaw_env if the
 * environment does not already carry it. It is never written into the repo.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEST = path.join(ROOT, "art/source-assets/big-air");
const META = path.join(DEST, "meta");

function token() {
    if (process.env.SKETCHFAB_API_TOKEN) return process.env.SKETCHFAB_API_TOKEN.trim();
    const envFile = path.join(os.homedir(), ".nemoclaw_env");
    const line = fs.readFileSync(envFile, "utf8")
        .split("\n").find(l => l.startsWith("SKETCHFAB_API_TOKEN="));
    if (!line) throw new Error("no SKETCHFAB_API_TOKEN in env or ~/.nemoclaw_env");
    return line.slice("SKETCHFAB_API_TOKEN=".length).trim();
}

/** curl to a file. Nothing remote is ever piped into an interpreter. */
function fetchTo(url, out, auth) {
    const args = ["-sS", "-L", "-o", out, "--fail"];
    if (auth) args.push("-H", `Authorization: Token ${auth}`);
    args.push(url);
    execFileSync("curl", args, { stdio: ["ignore", "inherit", "inherit"] });
}

function readJSON(p) {
    return JSON.parse(fs.readFileSync(p, "utf8"));
}

function metaPath(uid) {
    return path.join(META, `${uid}.json`);
}

async function thumbs(uids) {
    fs.mkdirSync(META, { recursive: true });
    for (const uid of uids) {
        const raw = path.join(META, `${uid}.raw.json`);
        fetchTo(`https://api.sketchfab.com/v3/models/${uid}`, raw);
        const d = readJSON(raw);
        const images = (d.thumbnails?.images ?? []).slice().sort((a, b) => b.width - a.width);
        const record = {
            uid,
            name: d.name,
            author: d.user?.displayName,
            authorUrl: d.user?.profileUrl,
            viewerUrl: d.viewerUrl,
            license: d.license?.label,
            licenseUrl: d.license?.url,
            requiresAttribution: d.license?.requirements,
            faceCount: d.faceCount,
            vertexCount: d.vertexCount,
            textureCount: d.textureCount,
            isDownloadable: d.isDownloadable,
        };
        fs.writeFileSync(metaPath(uid), JSON.stringify(record, null, 2) + "\n");
        fs.rmSync(raw);
        if (images[0]) {
            fetchTo(images[0].url, path.join(META, `${uid}.jpg`));
        }
        console.log(
            `${uid}  ${record.name}  [${record.license}]  ` +
            `tri=${record.faceCount}  tex=${record.textureCount}  by ${record.author}`
        );
    }
}

async function get(uid, slug) {
    fs.mkdirSync(DEST, { recursive: true });
    if (!fs.existsSync(metaPath(uid))) await thumbs([uid]);
    const t = token();
    const linkFile = path.join(META, `${uid}.links.json`);
    fetchTo(`https://api.sketchfab.com/v3/models/${uid}/download`, linkFile, t);
    const links = readJSON(linkFile);
    fs.rmSync(linkFile);

    const kind = links.glb ? "glb" : links.gltf ? "gltf" : "source";
    const ext = kind === "glb" ? "glb" : "zip";
    const out = path.join(DEST, `${slug}.${ext}`);
    fetchTo(links[kind].url, out);

    const bytes = fs.statSync(out).size;
    const sha = createHash("sha256").update(fs.readFileSync(out)).digest("hex");
    const record = readJSON(metaPath(uid));
    record.slug = slug;
    record.downloadKind = kind;
    record.file = path.relative(ROOT, out);
    record.bytes = bytes;
    record.sha256 = sha;
    fs.writeFileSync(metaPath(uid), JSON.stringify(record, null, 2) + "\n");
    console.log(`${slug}: ${kind} ${bytes} bytes  sha256=${sha.slice(0, 16)}…`);
}

function ledger() {
    const rows = fs.readdirSync(META).filter(f => f.endsWith(".json"))
        .map(f => readJSON(path.join(META, f)))
        .filter(r => r.bytes)
        .sort((a, b) => a.slug.localeCompare(b.slug));
    console.log("| Source file | Model | Author | Licence | Bytes | SHA-256 |");
    console.log("| --- | --- | --- | --- | ---: | --- |");
    for (const r of rows) {
        console.log(
            `| \`${path.basename(r.file)}\` | [${r.name}](${r.viewerUrl}) | ` +
            `[${r.author}](${r.authorUrl}) | ${r.license} | ${r.bytes} | \`${r.sha256}\` |`
        );
    }
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "thumbs") await thumbs(rest);
else if (cmd === "get") await get(rest[0], rest[1]);
else if (cmd === "ledger") ledger();
else {
    console.error("usage: sketchfab.mjs thumbs <uid...> | get <uid> <slug> | ledger");
    process.exit(2);
}
