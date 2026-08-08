"""Generate the clean, owner-controlled RockerKaki source asset.

The first RockerKaki mesh was generated downstream of a background-removal
step whose account tier could not be recovered.  Re-exporting or retexturing
that mesh would preserve the same release-rights ambiguity, so this file builds
the character again from Blender primitives and a tiny locally-authored colour
palette.  It imports no geometry, image, texture, or network input.

The design intentionally preserves the established player-facing identity:
large chibi head, violet and white hair, small horns, dark alpine outfit,
seated boots, and an electric guitar across the chest.  The separate rig script
continues to own the runtime armature and RockerBreath action.

Run with:

  blender --background --factory-startup --python tools/generate-rockerkaki.py
  blender --background --factory-startup --python tools/rig-rockerkaki.py
  blender --background --factory-startup --python tools/validate-rockerkaki-rig.py
"""

from __future__ import annotations

from hashlib import sha256
import json
import math
from pathlib import Path
import struct
import sys
import zlib

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from canonicalize_glb import canonicalize_glb


ROOT = Path(__file__).resolve().parents[1]
SOURCE_BLEND = ROOT / "art" / "rockerkaki-source.blend"
SOURCE_GLB = ROOT / "public" / "assets" / "models" / "rockerkaki.glb"
GENERATED_DIR = ROOT / "art" / "generated-assets" / "rockerkaki"
PALETTE_PATH = GENERATED_DIR / "rockerkaki-palette.png"
RECORD_PATH = GENERATED_DIR / "GENERATION_RECORD.json"

PALETTE = {
    "skin": (0.82, 0.70, 0.66, 1.0),
    "skin_light": (0.96, 0.88, 0.82, 1.0),
    "hair": (0.22, 0.055, 0.43, 1.0),
    "hair_light": (0.77, 0.67, 0.95, 1.0),
    "horn": (0.075, 0.018, 0.13, 1.0),
    "charcoal": (0.025, 0.028, 0.045, 1.0),
    "violet": (0.35, 0.10, 0.58, 1.0),
    "violet_light": (0.64, 0.38, 0.88, 1.0),
    "eye": (0.012, 0.010, 0.024, 1.0),
    "iris": (0.38, 0.29, 0.78, 1.0),
    "white": (0.98, 0.98, 1.0, 1.0),
    "blush": (0.72, 0.19, 0.34, 1.0),
    "metal": (0.45, 0.50, 0.60, 1.0),
    "guitar": (0.045, 0.025, 0.070, 1.0),
    "guitar_edge": (0.46, 0.12, 0.67, 1.0),
    "amber": (1.0, 0.44, 0.07, 1.0),
}
PALETTE_KEYS = tuple(PALETTE)
ATLAS_GRID = 4
ATLAS_SIZE = 64


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def reset_scene() -> None:
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for blocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)


def make_palette():
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    pixels = bytearray(ATLAS_SIZE * ATLAS_SIZE * 4)
    cell = ATLAS_SIZE // ATLAS_GRID
    for index, key in enumerate(PALETTE_KEYS):
        col = index % ATLAS_GRID
        row = index // ATLAS_GRID
        colour = tuple(round(channel * 255) for channel in PALETTE[key])
        for y in range(row * cell, (row + 1) * cell):
            for x in range(col * cell, (col + 1) * cell):
                offset = (y * ATLAS_SIZE + x) * 4
                pixels[offset:offset + 4] = colour

    def chunk(kind, payload):
        return (
            struct.pack(">I", len(payload)) + kind + payload +
            struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    rows = []
    stride = ATLAS_SIZE * 4
    # PNG rows are top-down while the atlas coordinates below are bottom-up.
    for y in range(ATLAS_SIZE - 1, -1, -1):
        rows.append(b"\x00" + bytes(pixels[y * stride:(y + 1) * stride]))
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", ATLAS_SIZE, ATLAS_SIZE, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
    png += chunk(b"IEND", b"")
    PALETTE_PATH.write_bytes(png)

    image = bpy.data.images.load(str(PALETTE_PATH), check_existing=False)
    image.name = "RockerKakiPalette"
    image.colorspace_settings.name = "sRGB"
    image.pack()

    material = bpy.data.materials.new("RockerKakiPaletteMaterial")
    material.use_nodes = True
    material.diffuse_color = PALETTE["skin"]
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Closest"
    bsdf.inputs["Roughness"].default_value = 0.62
    bsdf.inputs["Metallic"].default_value = 0.0
    material.node_tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return material


def palette_uv(key: str) -> tuple[float, float]:
    index = PALETTE_KEYS.index(key)
    col = index % ATLAS_GRID
    row = index // ATLAS_GRID
    return ((col + 0.5) / ATLAS_GRID, (row + 0.5) / ATLAS_GRID)


PARTS = []
MATERIAL = None


def finish(obj, key: str, *, name: str, smooth: bool = True, bevel: float = 0.0):
    obj.name = name
    if bevel:
        modifier = obj.modifiers.new("authored soft edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    obj.data.materials.append(MATERIAL)
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
    centre = palette_uv(key)
    for loop in uv.data:
        loop.uv = centre
    PARTS.append(obj)
    return obj


def sphere(name, scale, location, key, *, segments=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, location=location
    )
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, key, name=name)


def box(name, dimensions, location, key, *, rotation=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, key, name=name, smooth=False, bevel=bevel)


def cone(name, radius1, radius2, depth, location, key, *, rotation=(0, 0, 0), vertices=16):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, key, name=name)


def cylinder_between(name, start, end, radius, key, *, vertices=12):
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    midpoint = (a + b) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=direction.length,
        location=midpoint,
    )
    obj = bpy.context.object
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, key, name=name)


def box_between(name, start, end, thickness, depth, key, *, bevel=0.0):
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    midpoint = (a + b) * 0.5
    bpy.ops.mesh.primitive_cube_add(location=midpoint)
    obj = bpy.context.object
    obj.dimensions = (direction.length, depth, thickness)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("X", "Y")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, key, name=name, smooth=False, bevel=bevel)


def flat_prism(name, points, centre_y, depth, key):
    """Create a front-facing authored silhouette in the X/Z plane."""
    count = len(points)
    y0 = centre_y - depth * 0.5
    y1 = centre_y + depth * 0.5
    vertices = [(x, y0, z) for x, z in points]
    vertices += [(x, y1, z) for x, z in points]
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, key, name=name, smooth=False, bevel=0.006)


def build_character():
    # Seated lower silhouette: wide boots make the character readable at speed.
    sphere("Boot.L", (0.145, 0.145, 0.105), (-0.15, -0.005, 0.115), "charcoal")
    sphere("Boot.R", (0.145, 0.145, 0.105), (0.15, -0.005, 0.115), "charcoal")
    sphere("BootStripe.L", (0.105, 0.148, 0.027), (-0.15, -0.015, 0.105), "violet")
    sphere("BootStripe.R", (0.105, 0.148, 0.027), (0.15, -0.015, 0.105), "violet")
    sphere("Hips", (0.225, 0.155, 0.145), (0, 0.018, 0.245), "charcoal")
    sphere("Jacket", (0.205, 0.145, 0.205), (0, 0.018, 0.385), "violet")
    sphere("JacketPanel", (0.132, 0.151, 0.145), (0, -0.018, 0.385), "charcoal")
    sphere("BurgerPatch", (0.045, 0.012, 0.045), (0, -0.166, 0.405), "amber", segments=16, rings=8)
    cylinder_between("Collar", (-0.085, -0.13, 0.515), (0.085, -0.13, 0.515), 0.022, "metal")

    # Arms are posed around the guitar rather than hanging at the sides.
    cylinder_between("Arm.L", (-0.17, -0.015, 0.455), (-0.07, -0.265, 0.345), 0.057, "skin")
    cylinder_between("Arm.R", (0.17, -0.015, 0.455), (0.205, -0.275, 0.475), 0.057, "skin")
    sphere("Hand.L", (0.060, 0.045, 0.055), (-0.065, -0.292, 0.342), "skin_light", segments=16, rings=8)
    sphere("Hand.R", (0.052, 0.044, 0.052), (0.205, -0.296, 0.478), "skin_light", segments=16, rings=8)

    # Large hair mass behind a slightly forward face preserves the old chibi
    # silhouette without copying any mesh or texture from the uncertain model.
    sphere("HairBack", (0.325, 0.252, 0.325), (0, 0.025, 0.705), "hair")
    sphere("Face", (0.255, 0.220, 0.245), (0, -0.050, 0.675), "skin_light")
    sphere("Ear.L", (0.050, 0.030, 0.068), (-0.258, -0.075, 0.665), "skin")
    sphere("Ear.R", (0.050, 0.030, 0.068), (0.258, -0.075, 0.665), "skin")

    # Layered bangs and side locks are separate low-poly forms but share one
    # atlas material after joining, so the runtime still submits one hero mesh.
    sphere("Bang.L", (0.112, 0.035, 0.205), (-0.105, -0.255, 0.785), "hair")
    sphere("Bang.C", (0.092, 0.034, 0.180), (0.005, -0.266, 0.792), "hair")
    sphere("Bang.R", (0.092, 0.034, 0.165), (0.115, -0.250, 0.790), "hair")
    sphere("HairHighlight", (0.036, 0.038, 0.185), (-0.168, -0.265, 0.805), "hair_light", segments=16, rings=8)
    # The chase camera sees the back of the head most often. A narrow pale
    # streak keeps the established two-tone hair identity readable there too,
    # instead of reducing RockerKaki to a featureless violet sphere.
    sphere("HairRearHighlight", (0.038, 0.030, 0.175), (-0.145, 0.266, 0.785), "hair_light", segments=16, rings=8)
    sphere("SideLock.L", (0.070, 0.060, 0.175), (-0.245, -0.055, 0.635), "hair")
    sphere("SideLock.R", (0.070, 0.060, 0.175), (0.245, -0.055, 0.635), "hair")
    cone("HairTip.L", 0.072, 0.005, 0.175, (-0.275, 0.005, 0.545), "hair", rotation=(0, 0.20, -0.28))
    cone("HairTip.R", 0.072, 0.005, 0.175, (0.275, 0.005, 0.545), "hair", rotation=(0, -0.20, 0.28))

    # Small swept horns: dark enough to read against both white snow and hair.
    cone("Horn.L", 0.052, 0.007, 0.205, (-0.155, 0.015, 0.955), "horn", rotation=(0, -0.42, -0.10))
    cone("Horn.R", 0.052, 0.007, 0.205, (0.155, 0.015, 0.955), "horn", rotation=(0, 0.42, 0.10))

    # Eyes use nested shallow ellipsoids, giving the custom WGSL material one
    # opaque, artifact-free surface at each depth instead of transparent cards.
    for side in (-1, 1):
        sx = side * 0.090
        label = "L" if side < 0 else "R"
        sphere(f"Eye.{label}", (0.061, 0.015, 0.077), (sx, -0.270, 0.682), "eye", segments=20, rings=10)
        sphere(f"Iris.{label}", (0.038, 0.012, 0.052), (sx, -0.285, 0.679), "iris", segments=16, rings=8)
        sphere(f"EyeShine.{label}", (0.013, 0.009, 0.018), (sx - 0.012, -0.296, 0.705), "white", segments=12, rings=6)
        sphere(f"Blush.{label}", (0.035, 0.009, 0.017), (side * 0.166, -0.273, 0.604), "blush", segments=12, rings=6)
    sphere("Mouth", (0.018, 0.010, 0.026), (0, -0.279, 0.590), "blush", segments=12, rings=6)

    # Authored electric-guitar silhouette.  Its asymmetric body and long neck
    # remain the character's strongest recognition cue from the chase camera.
    body = [
        (-0.255, 0.245), (-0.155, 0.250), (-0.105, 0.205),
        (-0.035, 0.255), (0.035, 0.235), (0.010, 0.325),
        (0.045, 0.385), (-0.060, 0.380), (-0.125, 0.430),
        (-0.175, 0.370), (-0.275, 0.365), (-0.230, 0.305),
    ]
    flat_prism("GuitarBodyEdge", [(x * 1.05, z * 1.04) for x, z in body], -0.318, 0.047, "guitar_edge")
    flat_prism("GuitarBody", body, -0.344, 0.042, "guitar")
    neck_start = (-0.045, -0.342, 0.365)
    neck_end = (0.355, -0.342, 0.545)
    box_between("GuitarNeck", neck_start, neck_end, 0.047, 0.035, "guitar", bevel=0.007)
    box_between("GuitarFretboard", (-0.030, -0.363, 0.372), (0.355, -0.363, 0.545), 0.025, 0.012, "metal")
    for offset in (-0.009, 0.009):
        cylinder_between(
            "GuitarString",
            (-0.035 + offset, -0.373, 0.372),
            (0.360 + offset, -0.373, 0.548),
            0.0032,
            "white",
            vertices=8,
        )
    flat_prism(
        "GuitarHead",
        [(0.330, 0.525), (0.420, 0.515), (0.452, 0.552), (0.420, 0.595), (0.340, 0.570)],
        -0.344,
        0.048,
        "guitar",
    )
    box("Pickup.Top", (0.030, 0.018, 0.090), (-0.055, -0.370, 0.322), "metal", rotation=(0, 0.55, 0), bevel=0.005)
    box("Pickup.Bottom", (0.030, 0.018, 0.078), (-0.145, -0.370, 0.302), "metal", rotation=(0, 0.55, 0), bevel=0.005)
    cylinder_between("GuitarStrap", (-0.145, -0.180, 0.300), (0.120, -0.180, 0.510), 0.014, "violet_light", vertices=8)


def join_and_export():
    bpy.ops.object.select_all(action="DESELECT")
    for obj in PARTS:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0]
    bpy.ops.object.join()
    hero = bpy.context.object
    hero.name = "RockerKaki"
    hero.data.name = "RockerKakiMesh"
    # Joining objects that share a material can still retain duplicate slots in
    # some Blender versions.  One material and one primitive are runtime goals.
    for polygon in hero.data.polygons:
        polygon.material_index = 0
    hero.data.materials.clear()
    hero.data.materials.append(MATERIAL)
    hero["kakisnowSource"] = "local-procedural-blender"
    hero["sourceScript"] = "tools/generate-rockerkaki.py"
    hero["externalGeometryInputs"] = 0
    hero["externalTextureInputs"] = 0
    hero["characterIdentity"] = "RockerKaki"

    # Ensure every n-gon from the guitar silhouette leaves the exporter as
    # portable triangles and every part has stable object-space transforms.
    triangulate = hero.modifiers.new("release triangulation", "TRIANGULATE")
    bpy.context.view_layer.objects.active = hero
    bpy.ops.object.modifier_apply(modifier=triangulate.name)

    SOURCE_BLEND.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_BLEND), compress=True)

    bpy.ops.object.select_all(action="DESELECT")
    hero.select_set(True)
    bpy.context.view_layer.objects.active = hero
    kwargs = {
        "filepath": str(SOURCE_GLB),
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": False,
        "export_yup": True,
        "export_extras": True,
        "export_materials": "EXPORT",
    }
    # Keep this small hero uncompressed. Blender's Draco encoder is visually
    # stable but does not preserve byte ordering across clean processes, which
    # would make the source hash irreproducible. The palette mesh is already
    # smaller than the former imported asset without compression.
    bpy.ops.export_scene.gltf(**kwargs)
    canonicalize_glb(SOURCE_GLB)
    return hero


def write_record(hero) -> None:
    record = {
        "schemaVersion": 1,
        "asset": "RockerKaki",
        "status": "clean-local-procedural-source",
        "generatedDate": "2026-08-08",
        "generator": "Blender primitives and repository Python source",
        "blenderVersion": bpy.app.version_string,
        "command": "blender --background --factory-startup --python tools/generate-rockerkaki.py",
        "sourceScript": "tools/generate-rockerkaki.py",
        "externalGeometryInputs": [],
        "externalTextureInputs": [],
        "networkInputs": [],
        "identityNotes": [
            "large chibi head",
            "violet and white hair",
            "small horns",
            "dark violet alpine outfit",
            "seated boots",
            "electric guitar",
        ],
        "outputs": {
            "sourceBlend": {
                "path": "art/rockerkaki-source.blend",
                "bytes": SOURCE_BLEND.stat().st_size,
                "sha256": digest(SOURCE_BLEND),
            },
            "sourceGlb": {
                "path": "public/assets/models/rockerkaki.glb",
                "bytes": SOURCE_GLB.stat().st_size,
                "sha256": digest(SOURCE_GLB),
            },
            "palette": {
                "path": "art/generated-assets/rockerkaki/rockerkaki-palette.png",
                "bytes": PALETTE_PATH.stat().st_size,
                "sha256": digest(PALETTE_PATH),
            },
        },
        "geometry": {
            "meshObjects": 1,
            "vertices": len(hero.data.vertices),
            "triangles": len(hero.data.polygons),
            "materials": len(hero.data.materials),
            "paletteColours": len(PALETTE),
        },
        "rigCommand": "blender --background --factory-startup --python tools/rig-rockerkaki.py",
        "validationCommand": "blender --background --factory-startup --python tools/validate-rockerkaki-rig.py",
    }
    RECORD_PATH.write_bytes(
        (json.dumps(record, indent=2, sort_keys=True) + "\n").encode("utf-8")
    )


def main():
    global MATERIAL
    reset_scene()
    MATERIAL = make_palette()
    build_character()
    hero = join_and_export()
    write_record(hero)
    print(
        "ROCKERKAKI_SOURCE",
        {
            "source": str(SOURCE_GLB),
            "blend": str(SOURCE_BLEND),
            "record": str(RECORD_PATH),
            "vertices": len(hero.data.vertices),
            "triangles": len(hero.data.polygons),
            "sourceSha256": digest(SOURCE_GLB),
        },
    )


if __name__ == "__main__":
    main()
