"""
Find the rocket chair's parts, because the file does not name them.

`rocket-chair-snowboard.glb` arrives as a single unnamed mesh with a single
material — one `node_0` holding 160,000 triangles of board, seat, booster and
fins welded into one shell. There is nothing in it to attach an exhaust to, sit
a rider on, or ground against the snow, and no amount of reading the glTF will
produce one.

So the anchors are measured rather than read. Two passes:

  1. Split by loose parts. If the modeller left the booster as a separate
     island this finds it immediately and everything below is easier.
  2. Failing that, slice the mesh along its length and profile each slice —
     the board is wide and flat, the seat is tall and narrow above the deck,
     the booster is a cylinder of roughly constant radius behind the seat. Those
     three signatures are separable from a histogram even when the geometry is
     one continuous surface.

Output is a JSON block on stdout between markers, which
`author-rocket-anchors.mjs` reads. Nothing is written to the GLB here: this
tool measures, and the numbers land in the vehicle profile where a human can
read them, rather than in a mesh where they cannot.

    ~/bin/blender --background --factory-startup \
        --python tools/snow-burgers/measure-rocket-chair.py -- \
        --input public/assets/models/snow-burgers/rocket-chair-snowboard.glb
"""

import argparse
import json
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--slices", type=int, default=64)
    return p.parse_args(argv)


def world_verts(obj):
    m = obj.matrix_world
    return [m @ v.co for v in obj.data.vertices]


def bounds(points):
    lo = Vector((1e18, 1e18, 1e18))
    hi = Vector((-1e18, -1e18, -1e18))
    for p in points:
        for i in range(3):
            lo[i] = min(lo[i], p[i])
            hi[i] = max(hi[i], p[i])
    return lo, hi


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.input)

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        print("MEASURE-ERROR no mesh")
        sys.exit(2)

    # Everything is measured in glTF axes, not Blender's. The importer rotates
    # Y-up into Z-up, and every consumer of these numbers — the vehicle profile,
    # the exhaust attachment, the seat transform — works in the engine's frame.
    # Converting here rather than at each call site is what stops one of them
    # being converted twice.
    def to_gltf(v):
        return (v.x, v.z, -v.y)

    all_pts = []
    for obj in meshes:
        all_pts.extend(world_verts(obj))
    lo, hi = bounds(all_pts)

    # ------------------------------------------------------------ loose parts
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active

    bpy.ops.object.select_all(action="DESELECT")
    joined.select_set(True)
    bpy.context.view_layer.objects.active = joined
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    parts = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    part_records = []
    for o in parts:
        pts = world_verts(o)
        if not pts:
            continue
        plo, phi = bounds(pts)
        part_records.append({
            "name": o.name,
            "vertices": len(pts),
            "triangles": len(o.data.polygons),
            "min": to_gltf(plo),
            "max": to_gltf(phi),
            "size": (phi.x - plo.x, phi.z - plo.z, phi.y - plo.y),
        })
    part_records.sort(key=lambda r: -r["vertices"])

    # ------------------------------------------------------------- the slices
    #
    # Along the board's length (glTF +Z, Blender +Y). Each slice records how
    # wide the geometry is, how tall it stands, and how much of it sits above
    # deck height — which is what separates a seat from a booster from a plain
    # stretch of board.
    length_lo = lo.y
    length_hi = hi.y
    span = max(length_hi - length_lo, 1e-6)
    n = args.slices
    slices = [{"count": 0, "minX": 1e18, "maxX": -1e18,
               "minZ": 1e18, "maxZ": -1e18} for _ in range(n)]
    for p in all_pts:
        i = min(n - 1, int((p.y - length_lo) / span * n))
        s = slices[i]
        s["count"] += 1
        s["minX"] = min(s["minX"], p.x)
        s["maxX"] = max(s["maxX"], p.x)
        s["minZ"] = min(s["minZ"], p.z)
        s["maxZ"] = max(s["maxZ"], p.z)

    profile = []
    for i, s in enumerate(slices):
        if s["count"] == 0:
            profile.append(None)
            continue
        # glTF z along the length, measured from the tail.
        z_gltf = -( (length_lo + (i + 0.5) / n * span) )
        profile.append({
            "i": i,
            "zGltf": round(z_gltf, 4),
            "count": s["count"],
            "width": round(s["maxX"] - s["minX"], 4),
            "height": round(s["maxZ"] - s["minZ"], 4),
            "top": round(s["maxZ"], 4),
            "bottom": round(s["minZ"], 4),
        })

    out = {
        "input": args.input,
        "axes": "glTF (x right, y up, z along the board; +z is one end, sign resolved by the caller)",
        "bboxMin": to_gltf(lo),
        "bboxMax": to_gltf(hi),
        "size": (hi.x - lo.x, hi.z - lo.z, hi.y - lo.y),
        "looseParts": len(part_records),
        "parts": part_records[:24],
        "lengthProfile": profile,
    }
    print("MEASURE-JSON-BEGIN")
    print(json.dumps(out))
    print("MEASURE-JSON-END")


main()
