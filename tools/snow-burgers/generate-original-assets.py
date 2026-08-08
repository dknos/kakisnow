"""Build the original Snow-Burgers prop set.

This is an offline, deterministic Blender source for the small set of focal
props that used to arrive as unlicensed binary downloads.  It deliberately
uses only Blender primitives and mesh construction in this file: no source
GLB is imported, no texture is copied, and no external library or service is
required.  The generated GLBs are the runtime derivatives; the supplied GLBs
under art/source-assets remain untouched as historical audit inputs.

Run with:
  /home/nemoclaw/bin/blender --background --factory-startup \
    --python tools/snow-burgers/generate-original-assets.py -- \
    --out /tmp/snow-burgers-originals

The default output is the ignored/candidate-safe
`art/generated-assets/snow-burgers`.  Writing directly into the active runtime
directory is refused unless `--allow-runtime-output` is supplied explicitly.
That guard exists because generation is intentionally reversible: the active
unresolved source GLBs must never be replaced by an accidental background run.

The Blender exporter can emit equivalent triangle and UV ordering with
different byte layouts across fresh processes.  A small post-export
canonicalizer below sorts triangle records and rounds unused UVs, preserving
the geometry while making the candidate GLBs byte-identical across clean runs.
"""

import argparse
import json
import math
import os
import struct
import sys

import bpy
from mathutils import Vector


PALETTE = {
    "bun": (0.68, 0.25, 0.055, 1),
    "bun_hi": (0.94, 0.53, 0.16, 1),
    "patty": (0.20, 0.055, 0.018, 1),
    "cheese": (1.0, 0.56, 0.045, 1),
    "cheese_hi": (1.0, 0.78, 0.10, 1),
    "tomato": (0.82, 0.045, 0.03, 1),
    "tomato_hi": (1.0, 0.20, 0.08, 1),
    "tomato_flesh": (1.0, 0.34, 0.14, 1),
    "calyx": (0.08, 0.34, 0.055, 1),
    "lettuce": (0.19, 0.50, 0.08, 1),
    "lettuce_hi": (0.36, 0.72, 0.12, 1),
    "onion": (0.66, 0.27, 0.58, 1),
    "patty_hi": (0.36, 0.11, 0.035, 1),
    "patty_dark": (0.075, 0.012, 0.004, 1),
    "snow": (0.76, 0.88, 0.96, 1),
    "wood": (0.22, 0.075, 0.028, 1),
    "wood_hi": (0.55, 0.20, 0.045, 1),
    "needle": (0.035, 0.18, 0.13, 1),
    "needle_hi": (0.12, 0.36, 0.21, 1),
    "rock": (0.18, 0.24, 0.29, 1),
    "rock_hi": (0.34, 0.43, 0.48, 1),
    "steel": (0.16, 0.27, 0.32, 1),
    "steel_hi": (0.49, 0.68, 0.72, 1),
    "rocket": (0.90, 0.19, 0.045, 1),
    "rocket_hi": (1.0, 0.56, 0.06, 1),
    "seat": (0.08, 0.12, 0.16, 1),
    "glass": (0.20, 0.58, 0.71, 1),
    "window_warm": (1.0, 0.32, 0.055, 1),
    "flag": (0.89, 0.10, 0.05, 1),
}


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    candidate = os.path.normpath(os.path.join(here, "../../art/generated-assets/snow-burgers"))
    p.add_argument("--out", default=candidate)
    p.add_argument(
        "--allow-runtime-output", action="store_true",
        help="explicitly allow output below public/assets; never needed for candidate generation",
    )
    p.add_argument(
        "--only", default=None,
        help="comma-separated candidate filenames for a targeted revision; default generates all files",
    )
    return p.parse_args(argv)


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)
    # Blender removes zero-user materials above; clear the Python cache too so
    # the next asset never receives a dangling StructRNA reference.
    MATS.clear()


def mat(name, key, roughness=0.78, metallic=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = PALETTE[key]
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = PALETTE[key]
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    return m


MATS = {}


def material(key):
    if key not in MATS:
        MATS[key] = mat("KakiOriginal_" + key, key, 0.86 if key in {"snow", "bun", "patty"} else 0.68, 0.55 if key in {"steel", "steel_hi"} else 0)
    return MATS[key]


def finish(obj, key, name=None, bevel=0.0):
    obj.name = name or obj.name
    obj.data.materials.append(material(key))
    if bevel:
        mod = obj.modifiers.new("soft authored edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    return obj


def box(name, dims, loc, key, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = bpy.context.object
    o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, key, name, bevel)


def cylinder(name, radius, depth, loc, key, vertices=16, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.object, key, name, bevel)


def sphere(name, scale, loc, key, segments=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, key, name)


def cone(name, radius1, radius2, depth, loc, key, vertices=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.object, key, name)


def torus(name, major, minor, loc, key, rot=(0, 0, 0), major_segments=16, minor_segments=6):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=major_segments, minor_segments=minor_segments, location=loc, rotation=rot)
    return finish(bpy.context.object, key, name)


def wavy_disc(name, radius, depth, z, key, lobes=12, samples=32, amplitude=0.12):
    verts = []
    faces = []
    for layer in (-depth * 0.5, depth * 0.5):
        verts.append((0, 0, z + layer))
        for i in range(samples):
            a = i * 2 * math.pi / samples
            r = radius * (1.0 - amplitude + amplitude * math.sin(lobes * a + 0.4))
            verts.append((r * math.cos(a), r * math.sin(a), z + layer))
    bottom = 0
    top = samples + 1
    for i in range(samples):
        j = (i + 1) % samples
        faces.append((bottom, bottom + i + 1, bottom + j + 1))
        faces.append((top, top + j + 1, top + i + 1))
        faces.append((bottom + i + 1, top + i + 1, top + j + 1, bottom + j + 1))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    return finish(o, key)


def polygon_prism(name, points, depth, z, key):
    """A small authored 2.5-D silhouette with deterministic winding."""
    n = len(points)
    verts = [(x, y, z - depth * 0.5) for x, y in points]
    verts += [(x, y, z + depth * 0.5) for x, y in points]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, key)


def folded_sheet(name, points, top_z, bottom_z, key):
    """A thin sheet whose edge heights fold and drape instead of reading flat."""
    n = len(points)
    # The first point in each tuple is x/y; the optional third value is a
    # local top-height offset. Keeping this explicit makes the fold stable and
    # reviewable instead of relying on a physics modifier.
    top = [(x, y, z) for x, y, z in points]
    centre_z = sum(z for _, _, z in top) / n + 0.012
    verts = [(0, 0, centre_z)] + top
    verts += [(x, y, bottom_z) for x, y, _ in points]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((0, i + 1, j + 1))
        faces.append((n + 1 + i, 2 * n + 1 + i, 2 * n + 1 + j, n + 1 + j))
        faces.append((i + 1, n + 1 + i, n + 1 + j, j + 1))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, key)


def star_prism(name, outer_radius, inner_radius, depth, z, key, points=5):
    ring = []
    for i in range(points * 2):
        angle = i * math.pi / points - math.pi * 0.5
        radius = outer_radius if i % 2 == 0 else inner_radius
        ring.append((radius * math.cos(angle), radius * math.sin(angle)))
    return polygon_prism(name, ring, depth, z, key)


def merge_asset_meshes(name):
    """Bake a focal camp asset to one mesh with deduplicated material slots."""
    meshes = sorted((o for o in bpy.context.scene.objects if o.type == "MESH"), key=lambda o: o.name)
    for obj in meshes:
        # Hut roots carry scale/rotation. Bake those transforms before joining
        # so the grouped village remains spatially coherent.
        obj.data.transform(obj.matrix_world)
        obj.matrix_world.identity()
        obj.parent = None
    for obj in list(bpy.context.scene.objects):
        if obj.type == "EMPTY":
            bpy.data.objects.remove(obj, do_unlink=True)
    if not meshes:
        return
    # Blender's object.join keeps only the active object's material slot in
    # some factory-startup versions when the source slots share datablocks.
    # Assemble the mesh explicitly so warm windows, red signage, snow, and
    # wood survive the draw-call reduction.
    verts = []
    faces = []
    face_materials = []
    unique = []
    slot_map = {}
    for obj in meshes:
        offset = len(verts)
        verts.extend(tuple(vertex.co) for vertex in obj.data.vertices)
        for poly in obj.data.polygons:
            faces.append(tuple(offset + index for index in poly.vertices))
            material_block = obj.data.materials[poly.material_index] if obj.data.materials else material("wood")
            key = material_block.name
            if key not in slot_map:
                slot_map[key] = len(unique)
                unique.append(material_block)
            face_materials.append(slot_map[key])
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    joined = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(joined)
    for material_block in unique:
        mesh.materials.append(material_block)
    for polygon, material_index in zip(mesh.polygons, face_materials):
        polygon.material_index = material_index
    for obj in meshes:
        bpy.data.objects.remove(obj, do_unlink=True)


def wavy_frustum(name, radius1, radius2, depth, z, key, lobes=10, samples=28, loc=(0, 0)):
    """Layered branch/foliage tier; avoids a single cone placeholder."""
    verts = []
    for layer, radius in ((-depth * 0.5, radius1), (depth * 0.5, radius2)):
        for i in range(samples):
            a = i * 2 * math.pi / samples
            r = radius * (0.90 + 0.10 * math.sin(lobes * a + 0.25))
            verts.append((loc[0] + r * math.cos(a), loc[1] + r * math.sin(a), z + layer))
    faces = [tuple(range(samples - 1, -1, -1)), tuple(range(samples, 2 * samples))]
    faces += [(i, (i + 1) % samples, samples + (i + 1) % samples, samples + i) for i in range(samples)]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, key)


def sesame(x, y, z, rot):
    o = sphere("BunSeed", (0.035, 0.07, 0.018), (x, y, z), "bun_hi", segments=8, rings=4)
    o.rotation_euler[2] = rot
    return o


def ingredient_cheese():
    # A warm square slice with three independently lowered corners. The folded
    # edge and bright flap are silhouette cues for cheese, not decorative bars
    # that make it read as a tile.
    points = [(-0.64, -0.48, 0.038), (-0.42, -0.63, 0.020), (0.04, -0.67, 0.028),
              (0.49, -0.55, 0.055), (0.65, -0.20, 0.115), (0.57, 0.37, 0.190),
              (0.20, 0.64, 0.222), (-0.30, 0.60, 0.208), (-0.61, 0.34, 0.148),
              (-0.69, -0.06, 0.074)]
    folded_sheet("IngredientCheese", points, 0.222, 0.008, "cheese")
    # A broad folded front flap makes the slice visibly drape over a burger
    # edge; it is a single sheet, not a set of decorative bars.
    folded_sheet("CheeseFold", [(-0.64, -0.48, 0.038), (-0.42, -0.63, 0.020),
                                (0.04, -0.67, 0.028), (0.27, -0.43, 0.115),
                                (-0.20, -0.34, 0.150)],
                 0.150, 0.006, "cheese_hi")


def ingredient_patty():
    # A solid, gently irregular patty. The former top torus made the pickup
    # read as a donut; three dark, flush grooves now supply the grill cue.
    wavy_disc("IngredientPatty", 0.62, 0.20, 0.10, "patty", lobes=9, samples=48, amplitude=0.055)
    for i, rot in enumerate((-0.48, 0.0, 0.48)):
        # The groove is inlaid into the patty's top surface: its dark face is
        # flush at z=0.200, rather than a raised rod sitting above the meat.
        box("PattyGrillGroove" + str(i), (0.58, 0.020, 0.008), (0, 0, 0.196), "patty_dark", bevel=0.002, rot=(0, 0, rot))


def ingredient_tomato():
    cylinder("IngredientTomato", 0.53, 0.14, (0, 0, 0.07), "tomato", 20, bevel=0.035)
    cylinder("TomatoFlesh", 0.18, 0.012, (0, 0, 0.146), "tomato_flesh", 12)
    star_prism("TomatoCalyx", 0.21, 0.055, 0.028, 0.168, "calyx", points=5)
    for i, (x, y) in enumerate(((-0.26, 0.13), (0.22, 0.17), (-0.12, -0.22), (0.27, -0.18))):
        # Keep the four seeds subtly distinct in topology. Blender otherwise
        # opportunistically shares one identical index accessor in some clean
        # exports and not others, which is visually harmless but breaks the
        # byte-identical candidate contract. The one-segment difference is
        # below runtime pixel scale and makes the export graph deterministic.
        sphere("TomatoSeed" + str(i), (0.035, 0.020, 0.008), (x, y, 0.164), "tomato_hi", segments=8 + i, rings=4)


def ingredient_lettuce():
    wavy_disc("IngredientLettuce", 0.69, 0.085, 0.065, "lettuce", lobes=8, samples=48, amplitude=0.20)
    wavy_disc("LettuceMiddle", 0.61, 0.075, 0.120, "lettuce_hi", lobes=11, samples=44, amplitude=0.17)
    wavy_disc("LettuceRuffle", 0.51, 0.065, 0.172, "lettuce", lobes=13, samples=40, amplitude=0.20)


def ingredient_onion():
    # Three separated purple rings read as onion at speed and remain visible
    # against the snow without depending on a texture map.
    for i, (x, y, z, r) in enumerate(((-0.27, 0.04, 0.15, 0.24), (0.22, 0.12, 0.20, 0.21), (0.02, -0.22, 0.14, 0.26))):
        torus("IngredientOnion%02d" % i, r, 0.055, (x, y, z), "onion", rot=(0.15 * i, 0.28 * i, 0.25 * i), major_segments=14, minor_segments=6)


def burger_complete():
    # From the snow up: bottom bun, crisp cheese, patty, tomato, lettuce,
    # onion and a tall cap.  All pieces are authored together so the reward
    # has a deliberate silhouette when it grows in at Burger Base Camp.
    sphere("BurgerBottomBun", (0.73, 0.73, 0.22), (0, 0, 0.22), "bun", segments=20, rings=10)
    cylinder("BurgerPatty", 0.64, 0.19, (0, 0, 0.48), "patty", 20, bevel=0.04)
    wavy_disc("BurgerCheese", 0.73, 0.07, 0.60, "cheese", lobes=8, samples=40)
    wavy_disc("BurgerLettuce", 0.70, 0.10, 0.72, "lettuce", lobes=11, samples=40)
    cylinder("BurgerTomato", 0.57, 0.13, (0, 0, 0.83), "tomato", 20, bevel=0.03)
    for i, (x, y, z, r) in enumerate(((-0.28, 0.05, 0.92, 0.21), (0.20, 0.13, 0.96, 0.19), (0.0, -0.22, 0.90, 0.23))):
        torus("BurgerOnion%02d" % i, r, 0.045, (x, y, z), "onion", rot=(0.1 * i, 0.2 * i, 0.3 * i), major_segments=14, minor_segments=5)
    sphere("BurgerTopBun", (0.76, 0.76, 0.31), (0, 0, 1.13), "bun_hi", segments=24, rings=12)
    for i in range(11):
        a = i * 2 * math.pi / 11.0
        sesame(0.47 * math.cos(a), 0.47 * math.sin(a), 1.36 + 0.018 * math.sin(a * 2), a + 0.25)
    # Bake the authored reward into one mesh with stable material slots. This
    # avoids Blender's cross-export primitive cache reordering the repeated
    # sesame spheres while preserving the same visible stack and materials.
    merge_asset_meshes("BurgerCompleteMerged")


def rocket_chair():
    # Blender's +Y exports to glTF -Z.  The nose is at Blender -Y and lands at
    # the vehicle profile's +Z forward end.  Seat/back positions intentionally
    # mirror the runtime ROCKET_CHAIR anchors: seatAnchor z=+0.180, while the
    # backrest crest sits behind it at z=-0.100 in glTF space.
    box("RocketDeck", (0.56, 2.524, 0.09), (0, 0, 0.07), "rocket", bevel=0.07)
    box("RocketDeckStripe", (0.17, 2.36, 0.018), (0, 0, 0.125), "rocket_hi", bevel=0.02)
    # Seat pan: Blender y=-0.19 -> glTF z=+0.19, matching seatAnchor.
    box("RocketSeatPan", (0.48, 0.68, 0.18), (0, -0.19, 0.40), "seat", bevel=0.10)
    # Backrest centre Blender y=+0.10 -> glTF z=-0.10. Its top is exactly
    # glTF y=0.725, matching `backrestTop` rather than overshooting the rider.
    box("RocketBack", (0.50, 0.16, 0.48), (0, 0.10, 0.485), "seat", bevel=0.075)
    # Tail booster and side fins.
    cylinder("RocketBooster", 0.29, 0.70, (0, 0.85, 0.24), "steel", 20, bevel=0.045, rot=(math.pi / 2, 0, 0))
    for x in (-0.27, 0.27):
        box("RocketFin" + ("L" if x < 0 else "R"), (0.06, 0.55, 0.32), (x, 0.89, 0.17), "rocket_hi", bevel=0.025, rot=(0, 0, math.radians(8 if x < 0 else -8)))
    # Nose cone / two small side vents provide a readable rocket silhouette.
    cone("RocketNose", 0.27, 0.03, 0.42, (0, -1.03, 0.11), "rocket_hi", 16, rot=(math.pi / 2, 0, 0))
    for x in (-0.105, 0.105):
        cylinder("RocketVent" + str(x), 0.07, 0.16, (x, 1.010, 0.223), "steel_hi", 12, rot=(math.pi / 2, 0, 0))
    # Cargo tray sits behind the rider; it is intentionally shallow.
    # Blender (x, y, z) -> glTF/runtime (x, z, -y), so this is exactly
    # ROCKET_CHAIR.anchors.cargoTrayAnchor = [0, 0.420, -0.320].
    box("RocketCargoTray", (0.40, 0.35, 0.08), (0, 0.320, 0.420), "steel_hi", bevel=0.035)


def tree(name, height, width, key="needle", snow=True, loc=(0, 0, 0)):
    x, y, z = loc
    trunk = cylinder(name + "_Trunk", width * 0.10, height * 0.20, (x, y, z + height * 0.10), "wood", 8, bevel=0.01)
    # Four separated, irregular foliage tiers give the silhouette branch
    # rhythm and a readable hero profile without the old single-cone look.
    tier_key = "needle_hi" if key == "needle" else key
    for i, (fraction, r1, r2, depth) in enumerate(((0.28, 0.56, 0.22, 0.30),
                                                     (0.43, 0.49, 0.18, 0.34),
                                                     (0.58, 0.40, 0.13, 0.34),
                                                     (0.73, 0.29, 0.05, 0.28))):
        wavy_frustum(name + "_Branch" + str(i), width * r1, width * r2,
                     height * depth, z + height * fraction, tier_key,
                     lobes=9 + i, samples=18, loc=(x, y))
    if snow:
        wavy_frustum(name + "_SnowCap", width * 0.18, width * 0.02,
                     height * 0.17, z + height * 0.87, "snow", lobes=7, samples=14, loc=(x, y))


def dressing_firs():
    tree("FirTreeSnowA", 8.0, 3.0, "needle", True, (0, 0, 0))
    tree("FirTreeSnowB", 6.3, 2.3, "needle_hi", True, (8, 0, 0))
    tree("FirTreeSnowC", 10.2, 3.7, "needle", False, (16, 0, 0))


def dressing_pine():
    tree("PineHero", 13.0, 4.6, "needle", True, (0, 0, 0))


def dressing_bush():
    for i, (x, y, z, s) in enumerate(((-0.8, 0, 0, 1.0), (0.0, 0.15, 0.1, 1.25), (0.8, -0.05, 0, 0.9))):
        sphere("BushCluster%02d" % i, (0.8 * s, 0.6 * s, 0.55 * s), (x, y, z + 0.42 * s), "needle_hi", segments=10, rings=6)
        sphere("BushSnow%02d" % i, (0.55 * s, 0.4 * s, 0.18 * s), (x - 0.05, y, z + 0.86 * s), "snow", segments=10, rings=5)


def dressing_rock():
    for i, (x, y, z, s) in enumerate(((-0.75, 0.1, 0, 1.0), (0.35, 0, 0.05, 1.25), (1.0, 0.16, 0, 0.75))):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=(x, y, z + 0.48 * s))
        o = bpy.context.object
        o.scale = (0.7 * s, 0.58 * s, 0.48 * s)
        o.rotation_euler = (0.17 * i, 0.25 * i, 0.4 * i)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        finish(o, "rock_hi" if i == 1 else "rock", "RockCluster%02d" % i)


def hut(name, x, y, z, scale=1.0, rot=0.0):
    # The camp is a compact Burger Base Camp service hut.  The imported lodge
    # sits off the piste, so +X is the player-facing side in the primary
    # placement.  Put the service hatch, counter, grill and order board on that
    # face rather than making the rider read a blank log wall.  Everything is
    # still local primitive geometry and is merged by the caller.
    root = bpy.data.objects.new(name + "Root", None)
    bpy.context.collection.objects.link(root)
    roof_angle = math.atan2(2.0, 3.8)
    parts = [
        # A deeper log body and an oversized, snow-heavy gable make the hut
        # survive the finish approach and the distant village read.
        box(name + "_Logs", (7.2, 5.35, 3.75), (x, y, z + 1.88), "wood_hi", bevel=0.12),
        box(name + "_RoofL", (4.5, 5.8, 0.36), (x - 1.92, y, z + 5.40), "wood", bevel=0.06, rot=(0, -roof_angle, 0)),
        box(name + "_RoofR", (4.5, 5.8, 0.36), (x + 1.92, y, z + 5.40), "wood", bevel=0.06, rot=(0, roof_angle, 0)),
        box(name + "_SnowRoofL", (4.62, 5.88, 0.18), (x - 1.92, y, z + 5.60), "snow", bevel=0.04, rot=(0, -roof_angle, 0)),
        box(name + "_SnowRoofR", (4.62, 5.88, 0.18), (x + 1.92, y, z + 5.60), "snow", bevel=0.04, rot=(0, roof_angle, 0)),
        box(name + "_Ridge", (0.34, 5.95, 0.34), (x, y, z + 6.78), "wood_hi", bevel=0.05),
        box(name + "_SnowRidge", (0.42, 6.0, 0.16), (x, y, z + 6.98), "snow", bevel=0.04),
        cylinder(name + "_Chimney", 0.30, 2.35, (x - 1.35, y, z + 6.05), "rock", 8),
        # A low snow plinth and front snow bank keep the structure seated on
        # the terrain instead of reading as a floating export.
        box(name + "_SnowPlinth", (7.65, 5.75, 0.22), (x, y, z + 0.11), "snow", bevel=0.10),
        box(name + "_SnowBank", (0.58, 3.45, 0.34), (x + 3.82, y, z + 0.18), "snow", bevel=0.12),
        # Player-facing service façade (+X): dark hatch, warm interior, deep
        # counter shelf and a broad striped awning.
        box(name + "_ServiceOpening", (0.10, 2.75, 1.40), (x + 3.66, y - 0.25, z + 2.22), "seat", bevel=0.04),
        box(name + "_ServiceGlow", (0.055, 2.35, 0.82), (x + 3.73, y - 0.25, z + 2.20), "window_warm", bevel=0.03),
        box(name + "_ServiceCounter", (0.56, 3.15, 0.26), (x + 3.98, y - 0.25, z + 1.45), "wood_hi", bevel=0.05),
        box(name + "_ServiceCounterTop", (0.72, 3.35, 0.16), (x + 4.13, y - 0.25, z + 1.62), "cheese_hi", bevel=0.04),
        box(name + "_ServiceFrameL", (0.24, 0.18, 1.62), (x + 3.84, y - 1.73, z + 2.20), "wood_hi", bevel=0.03),
        box(name + "_ServiceFrameR", (0.24, 0.18, 1.62), (x + 3.84, y + 1.23, z + 2.20), "wood_hi", bevel=0.03),
        box(name + "_ServiceFrameTop", (0.24, 3.10, 0.18), (x + 3.84, y - 0.25, z + 3.03), "wood_hi", bevel=0.03),
        box(name + "_ServiceAwning", (0.68, 3.75, 0.18), (x + 4.10, y - 0.25, z + 3.38), "flag", bevel=0.04, rot=(0, math.radians(-10), 0)),
        box(name + "_ServiceAwningSnow", (0.74, 3.82, 0.12), (x + 4.18, y - 0.25, z + 3.55), "snow", bevel=0.03, rot=(0, math.radians(-10), 0)),
        # Three small colour chips are a wordless order-board cue, not text or
        # a brand mark. They remain legible at the same scale as the hatch.
        box(name + "_OrderBoardFrame", (0.18, 2.75, 0.85), (x + 3.85, y - 0.25, z + 4.12), "wood", bevel=0.05),
        box(name + "_OrderBoardFace", (0.08, 2.38, 0.58), (x + 3.96, y - 0.25, z + 4.12), "window_warm", bevel=0.03),
        box(name + "_OrderChipA", (0.08, 0.28, 0.18), (x + 4.03, y - 0.92, z + 4.12), "cheese_hi", bevel=0.02),
        box(name + "_OrderChipB", (0.08, 0.28, 0.18), (x + 4.03, y - 0.25, z + 4.12), "flag", bevel=0.02),
        box(name + "_OrderChipC", (0.08, 0.28, 0.18), (x + 4.03, y + 0.42, z + 4.12), "cheese_hi", bevel=0.02),
        # Warm door and window give the façade a human scale. The grill sits
        # below the window as a distinct dark service appliance.
        box(name + "_Door", (0.13, 1.02, 2.45), (x + 3.73, y + 2.18, z + 1.40), "rocket_hi", bevel=0.04),
        box(name + "_DoorFrameL", (0.20, 0.13, 2.72), (x + 3.86, y + 1.58, z + 1.48), "wood", bevel=0.04),
        box(name + "_DoorFrameR", (0.20, 0.13, 2.72), (x + 3.86, y + 2.78, z + 1.48), "wood", bevel=0.04),
        box(name + "_DoorFrameTop", (0.20, 1.32, 0.16), (x + 3.86, y + 2.18, z + 2.78), "wood", bevel=0.04),
        box(name + "_Window", (0.10, 1.02, 0.92), (x + 3.74, y - 2.12, z + 2.18), "window_warm", bevel=0.04),
        box(name + "_WindowBarV", (0.13, 0.08, 1.02), (x + 3.84, y - 2.12, z + 2.18), "wood_hi", bevel=0.02),
        box(name + "_WindowBarH", (0.13, 1.10, 0.08), (x + 3.84, y - 2.12, z + 2.18), "wood_hi", bevel=0.02),
        box(name + "_GrillBody", (0.86, 1.18, 0.78), (x + 4.02, y - 2.05, z + 0.74), "steel", bevel=0.08),
        box(name + "_GrillPlate", (0.24, 1.38, 0.12), (x + 4.48, y - 2.05, z + 1.22), "steel_hi", bevel=0.03),
        box(name + "_GrillHood", (0.50, 1.42, 0.78), (x + 4.02, y - 2.05, z + 1.70), "wood", bevel=0.08),
        cylinder(name + "_GrillFlue", 0.18, 1.65, (x + 4.05, y - 2.05, z + 2.85), "steel", 10, bevel=0.03),
    ]
    for p in parts:
        p.parent = root
    # Visible log courses, corner posts, service beams and a small back-side
    # window keep the lodge authored from every turntable angle. The service
    # façade is intentionally split only by its fixtures; no text is needed.
    detail = []
    for i in range(8):
        detail.append(box(name + "_BackLog" + str(i), (0.16, 5.02, 0.16),
                          (x - 3.68, y, z + 0.40 + i * 0.43), "wood_hi", bevel=0.025))
    for side in (-1, 1):
        for i in range(5):
            detail.append(box(name + "_SideLog" + str(side) + str(i), (6.7, 0.14, 0.16),
                              (x, y + side * 2.48, z + 0.42 + i * 0.52), "wood_hi", bevel=0.02))
        detail.append(box(name + "_CornerPost" + str(side), (0.25, 0.25, 3.65),
                          (x - 3.70, y + side * 2.34, z + 1.82), "wood", bevel=0.03))
    # Timber braces frame the +X service face and give the side-on approach a
    # clear rhythm even when the counter is partly occluded by terrain fog.
    for i, yy in enumerate((-2.92, 1.72)):
        detail.append(box(name + "_ServiceBeam" + str(i), (0.20, 0.18, 3.55),
                          (x + 3.70, y + yy, z + 1.82), "wood", bevel=0.03))
    detail.append(box(name + "_ServiceSill", (0.22, 5.10, 0.18),
                      (x + 3.70, y, z + 0.42), "wood", bevel=0.03))
    detail.append(box(name + "_BackWindow", (0.055, 1.10, 0.72),
                      (x - 3.78, y, z + 2.04), "window_warm", bevel=0.025))
    for p in detail:
        p.parent = root
    root.scale = (scale, scale, scale)
    root.rotation_euler[2] = rot


def camp_hut():
    hut("CampHut", 0, 0, 0)
    merge_asset_meshes("CampHutMerged")


def camp_village():
    hut("VillageLodgeA", 0, 0, 0, 1.0, 0.1)
    hut("VillageLodgeB", 8.5, -1.0, 0.0, 0.62, -0.4)
    hut("VillageLodgeC", -8.0, 2.0, 0.0, 0.52, 0.45)
    for i, x in enumerate((-12.0, 12.0)):
        tree("VillageFir%d" % i, 7.0 + i, 2.6, "needle", True, (x, 3.2, 0))
    merge_asset_meshes("CampVillageMerged")


BUILDERS = {
    "ingredient-cheese.glb": ingredient_cheese,
    "ingredient-patty.glb": ingredient_patty,
    "ingredient-tomato.glb": ingredient_tomato,
    "ingredient-lettuce.glb": ingredient_lettuce,
    "ingredient-onion.glb": ingredient_onion,
    "burger-complete.glb": burger_complete,
    "rocket-chair-snowboard.glb": rocket_chair,
    "dressing-firs.glb": dressing_firs,
    "dressing-pine.glb": dressing_pine,
    "dressing-bush.glb": dressing_bush,
    "dressing-rock.glb": dressing_rock,
    "camp-hut.glb": camp_hut,
    "camp-village.glb": camp_village,
}


def _canonicalize_glb(path):
    """Make Blender's equivalent-but-reordered GLB output byte-stable.

    Blender's mesh exporter may traverse coplanar triangles in a different
    order between fresh processes.  The triangle set and all vertex attributes
    are unchanged, but that otherwise changes the binary hash.  Candidate
    models have no textures, so TEXCOORD_0 is not sampled at runtime; rounding
    its last unstable float bits is safe and removes the remaining exporter
    noise.  JSON is also emitted with sorted keys and fixed padding.
    """
    data = bytearray(open(path, "rb").read())
    if data[:4] != b"glTF":
        raise RuntimeError("not a GLB: " + path)
    json_len = struct.unpack_from("<I", data, 12)[0]
    json_start = 20
    document = json.loads(bytes(data[json_start:json_start + json_len]).rstrip(b" "))
    bin_header = json_start + json_len
    bin_len = struct.unpack_from("<I", data, bin_header)[0]
    bin_start = bin_header + 8
    binary = bytearray(data[bin_start:bin_start + bin_len])

    component_format = {5121: "B", 5123: "H", 5125: "I"}
    component_size = {5121: 1, 5123: 2, 5125: 4, 5126: 4}

    def accessor_slice(accessor):
        view = document["bufferViews"][accessor["bufferView"]]
        start = view.get("byteOffset", 0)
        stride = view.get("byteStride", 0)
        if stride:
            raise RuntimeError("unexpected interleaved accessor in candidate output")
        size = component_size[accessor["componentType"]]
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
        return start, size * width

    # Stable triangle order.  Winding is retained; only whole triangles are
    # sorted, so normals and back-face behavior do not change.
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            if primitive.get("mode", 4) != 4 or "indices" not in primitive:
                continue
            accessor = document["accessors"][primitive["indices"]]
            fmt = component_format.get(accessor["componentType"])
            if not fmt or accessor["count"] % 3:
                continue
            start, width = accessor_slice(accessor)
            count = accessor["count"]
            values = list(struct.unpack_from("<" + fmt * count, binary, start))
            triangles = [tuple(values[i:i + 3]) for i in range(0, count, 3)]
            triangles.sort()
            struct.pack_into("<" + fmt * count, binary, start, *(v for tri in triangles for v in tri))

    # There are deliberately no textures in these candidates. Blender's
    # bevel UV calculation can differ by a final float bit in a few runs;
    # make those unused coordinates canonical without touching positions or
    # normals. The rocket chair needs five decimal places because its two
    # clean exports straddle the sixth-decimal boundary; this is still far
    # below a visible texel at the texture-free prop scale.
    uv_precision = 5 if os.path.basename(path) == "rocket-chair-snowboard.glb" else 6
    for accessor in document.get("accessors", []):
        if accessor.get("type") != "VEC2" or accessor.get("componentType") != 5126:
            continue
        start, width = accessor_slice(accessor)
        for i in range(accessor["count"]):
            off = start + i * width
            u, v = struct.unpack_from("<2f", binary, off)
            struct.pack_into("<2f", binary, off, round(u, uv_precision), round(v, uv_precision))

    json_bytes = json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * (-len(json_bytes) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    out = bytearray(struct.pack("<4sII", b"glTF", 2, total))
    out += struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    out += struct.pack("<II", len(binary), 0x004E4942) + binary
    with open(path, "wb") as f:
        f.write(out)


def export(path, build):
    clear()
    build()
    bpy.context.scene["kakisnow_asset_origin"] = "local Blender procedural geometry from tools/snow-burgers/generate-original-assets.py"
    bpy.context.scene["kakisnow_provenance"] = "owner-directed AI-assisted Codex session; no imported model, texture, or network input"
    bpy.context.scene["kakisnow_generated_date"] = "2026-08-07"
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.context.scene.objects:
        if o.type == "MESH" or o.type == "EMPTY":
            o.select_set(True)
    if bpy.context.scene.objects:
        bpy.context.view_layer.objects.active = next((o for o in bpy.context.scene.objects if o.type == "MESH"), None)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
        # Blender's shared-accessor cache is useful for the two repeated/
        # bevel-heavy focal models once their meshes are baked. Keep the
        # accepted dressing/camp export layout unchanged where possible.
        export_shared_accessors=os.path.basename(path) in {
            "burger-complete.glb", "rocket-chair-snowboard.glb",
        },
    )
    _canonicalize_glb(path)
    print("ORIGINAL-ASSET", os.path.basename(path), os.path.getsize(path))


def main():
    a = args()
    out = os.path.abspath(a.out)
    runtime_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../public/assets"))
    if os.path.commonpath([out, runtime_root]) == runtime_root and not a.allow_runtime_output:
        raise SystemExit(
            "Refusing runtime asset output without --allow-runtime-output: " + out
        )
    os.makedirs(out, exist_ok=True)
    selected = list(BUILDERS)
    if a.only:
        selected = [name.strip() for name in a.only.split(",") if name.strip()]
        unknown = sorted(set(selected) - set(BUILDERS))
        if unknown:
            raise SystemExit("Unknown --only asset(s): " + ", ".join(unknown))
    for filename in selected:
        build = BUILDERS[filename]
        export(os.path.join(out, filename), build)


if __name__ == "__main__":
    main()
