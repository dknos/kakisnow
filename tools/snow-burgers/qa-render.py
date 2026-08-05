"""
Blender QA turntable for the Snow-Burgers assets.

Renders each GLB from four angles under a fixed neutral setup so a source and
its optimised derivative can be compared frame for frame. This is the evidence
behind every "no visible quality loss" claim in the optimisation report; it is
not a beauty render and is deliberately not the game's lighting.

Run through the repo's Blender wrapper:

    ~/bin/blender --background --factory-startup \
        --python tools/snow-burgers/qa-render.py -- \
        --input  art/source-assets/snow-burgers/cheese-source.glb \
        --outdir screenshots/snow-burgers/asset-qa/source \
        --name cheese

`~/bin/blender` is the Windows blender.exe reached through WSL interop. POSIX
paths resolve correctly for file I/O because the process cwd is the WSL UNC
share, but /mnt/c paths do not, and the render target must be a real Windows
path — so `--outdir` is staged into the Windows temp directory and copied back
by the calling script rather than written directly.
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--outdir", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--res", type=int, default=900)
    p.add_argument("--views", type=int, default=4)
    return p.parse_args(argv)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def imported_bounds():
    """World-space bounds over every imported mesh."""
    lo = Vector((1e18, 1e18, 1e18))
    hi = Vector((-1e18, -1e18, -1e18))
    found = False
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        found = True
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], world[i])
                hi[i] = max(hi[i], world[i])
    if not found:
        return None, None
    return lo, hi


def build_lighting():
    """
    Three-point neutral setup.

    Fixed in world space rather than parented to the camera, so a rotation of
    the subject changes the shading the way it would on a real turntable — which
    is what makes a lost normal map or a collapsed silhouette visible between
    two renders instead of hidden by identical flat light.
    """
    specs = [
        ("key", (4.0, -5.0, 6.0), 6.0),
        ("fill", (-6.0, -3.0, 2.0), 2.0),
        ("rim", (0.0, 6.0, 4.0), 3.5),
    ]
    for name, loc, energy in specs:
        light_data = bpy.data.lights.new(name, type="AREA")
        light_data.energy = energy * 40
        light_data.size = 6.0
        light = bpy.data.objects.new(name, light_data)
        light.location = loc
        bpy.context.scene.collection.objects.link(light)
        direction = -Vector(loc)
        light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    world = bpy.data.worlds.new("qa")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.06, 0.08, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    bpy.context.scene.world = world


def main():
    args = parse_args()
    clear_scene()

    bpy.ops.import_scene.gltf(filepath=args.input)

    lo, hi = imported_bounds()
    if lo is None:
        print("QA-RENDER-ERROR no mesh imported from " + args.input)
        sys.exit(2)

    size = hi - lo
    centre = (hi + lo) * 0.5
    radius = max(size.length * 0.5, 1e-4)
    print("QA-BOUNDS %s min=%s max=%s size=%s" % (args.name, tuple(lo), tuple(hi), tuple(size)))

    build_lighting()

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    # Show the actual base-colour texture. Without this a lost or mis-sized
    # texture renders identically to a present one, which would make the
    # before/after comparison worthless for exactly the failure it exists to
    # catch.
    scene.display.shading.color_type = "TEXTURE"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = args.res
    scene.render.resolution_y = args.res
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"

    cam_data = bpy.data.cameras.new("qa_cam")
    cam_data.lens = 60
    cam = bpy.data.objects.new("qa_cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    # Far enough that the whole bounding sphere fits with margin at 60 mm, and
    # identical for both renders because it is derived from the *source* size
    # passed in by the caller when comparing — see optimise-assets.mjs.
    dist = radius * 3.1
    os.makedirs(args.outdir, exist_ok=True)

    for i in range(args.views):
        angle = (math.pi * 2.0 * i) / args.views + math.radians(35)
        elev = math.radians(22)
        cam.location = (
            centre.x + math.cos(angle) * dist * math.cos(elev),
            centre.y + math.sin(angle) * dist * math.cos(elev),
            centre.z + dist * math.sin(elev),
        )
        direction = centre - Vector(cam.location)
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(args.outdir, "%s-%02d.png" % (args.name, i))
        bpy.ops.render.render(write_still=True)
        print("QA-RENDER-WROTE " + scene.render.filepath)

    print("QA-RENDER-OK " + args.name)


main()
