"""Author the reproducible RockerKaki armature and runtime GLB.

The Tencent-generated source is a single, highly disconnected surface. Blender
heat weights are unstable on that topology, so the weights below are deliberate
spatial fields with named transition bands. Running this file in Blender 5.1+
rebuilds both the editable .blend and the shipped rigged GLB.
"""

from pathlib import Path
import math

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/models/rockerkaki.glb"
BLEND = ROOT / "art/rockerkaki-rig.blend"
OUTPUT = ROOT / "public/assets/models/rockerkaki-rigged.glb"


def clamp01(value):
    return max(0.0, min(1.0, value))


def smoothstep(edge0, edge1, value):
    t = clamp01((value - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def add_bone(edit_bones, name, head, tail, parent=None):
    bone = edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    bone.roll = 0.0
    bone.parent = parent
    return bone


def normalized(weights):
    # glTF's portable skinning path carries four influences. Keep that contract
    # explicit instead of relying on Blender's exporter to choose/truncate them.
    weights = dict(sorted(
        weights.items(), key=lambda item: item[1], reverse=True
    )[:4])
    total = sum(weights.values())
    if total <= 1e-8:
        return {"pelvis": 1.0}
    return {name: value / total for name, value in weights.items() if value > 1e-5}


def weights_at(co):
    x, y, z = co
    ax = abs(x)

    # Vertical body chain. Broad overlaps prevent seams across the many detached
    # islands and make the huge hair mass follow the neck/head as one silhouette.
    head = smoothstep(0.53, 0.67, y)
    neck = (1.0 - head) * smoothstep(0.46, 0.61, y)
    chest = (1.0 - head) * (1.0 - neck) * smoothstep(0.33, 0.50, y)
    pelvis = 1.0 - smoothstep(0.20, 0.39, y)
    spine = max(0.0, 1.0 - head - neck - chest - pelvis)

    weights = {
        "pelvis": pelvis,
        "spine": spine,
        "chest": chest,
        "neck": neck,
        "head": head,
    }

    # Stub arms occupy the wide middle band. Keep the inner shoulder blended to
    # chest so rotations bend instead of shearing the disconnected surface.
    arm_band = smoothstep(0.17, 0.29, ax)
    arm_height = smoothstep(0.27, 0.38, y) * (1.0 - smoothstep(0.56, 0.65, y))
    arm_depth = 1.0 - smoothstep(0.29, 0.39, abs(z))
    arm = arm_band * arm_height * arm_depth
    if arm > 0:
        name = "arm.L" if x < 0 else "arm.R"
        transfer = min(0.92, arm)
        for body_name in ("spine", "chest", "neck"):
            weights[body_name] *= 1.0 - transfer
        weights[name] = transfer

    # The seated legs/boots are low and lateral. Their upper edge remains partly
    # pelvis-weighted, which makes the jump tuck coherent at the hip.
    leg_side = smoothstep(0.055, 0.17, ax)
    leg_height = 1.0 - smoothstep(0.18, 0.34, y)
    leg_front = smoothstep(-0.34, 0.02, z)
    leg = leg_side * leg_height * (0.65 + 0.35 * leg_front)
    if leg > 0:
        name = "leg.L" if x < 0 else "leg.R"
        transfer = min(0.96, leg)
        weights["pelvis"] *= 1.0 - transfer
        weights["spine"] *= 1.0 - transfer
        weights[name] = transfer

    return normalized(weights)


def main():
    # Rebuilds should be byte-focused release operations, not leave an
    # untracked .blend1 backup beside the committed editable source.
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    mesh = max(
        (obj for obj in bpy.context.scene.objects if obj.type == "MESH"),
        key=lambda obj: len(obj.data.vertices),
    )
    mesh.name = "RockerKaki"
    mesh.data.name = "RockerKakiMesh"

    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    rig = bpy.context.object
    rig.name = "KakiRig"
    rig.data.name = "KakiRig"
    edit = rig.data.edit_bones
    edit.remove(edit[0])

    root = add_bone(edit, "root", (0, 0.015, 0), (0, 0.16, 0))
    pelvis = add_bone(edit, "pelvis", (0, 0.12, 0), (0, 0.31, 0), root)
    spine = add_bone(edit, "spine", (0, 0.27, 0), (0, 0.47, 0), pelvis)
    chest = add_bone(edit, "chest", (0, 0.43, 0), (0, 0.60, 0), spine)
    neck = add_bone(edit, "neck", (0, 0.56, 0), (0, 0.68, 0), chest)
    add_bone(edit, "head", (0, 0.64, 0), (0, 0.88, 0), neck)
    add_bone(edit, "arm.L", (-0.10, 0.49, 0), (-0.34, 0.39, 0.01), chest)
    add_bone(edit, "arm.R", (0.10, 0.49, 0), (0.34, 0.39, 0.01), chest)
    add_bone(edit, "leg.L", (-0.075, 0.25, 0), (-0.19, 0.10, 0.05), pelvis)
    add_bone(edit, "leg.R", (0.075, 0.25, 0), (0.19, 0.10, 0.05), pelvis)
    bpy.ops.object.mode_set(mode="OBJECT")

    for bone in rig.data.bones:
        bone.use_deform = bone.name != "root"
        bone.color.palette = "THEME04" if bone.use_deform else "THEME03"

    group_names = [
        "pelvis", "spine", "chest", "neck", "head",
        "arm.L", "arm.R", "leg.L", "leg.R",
    ]
    groups = {name: mesh.vertex_groups.new(name=name) for name in group_names}
    for vertex in mesh.data.vertices:
        for name, value in weights_at(vertex.co).items():
            groups[name].add([vertex.index], value, "REPLACE")

    modifier = mesh.modifiers.new(name="KakiRig", type="ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = True
    mesh.parent = rig

    # A tiny authored action makes the GLB self-demonstrating in Blender and
    # other glTF viewers. Runtime poses are controller-driven and use these names.
    action = bpy.data.actions.new("RockerBreath")
    rig.animation_data_create()
    rig.animation_data.action = action
    for frame, spine_x, head_z, arm in (
        (1, -0.025, -0.018, 0.015),
        (16, 0.018, 0.022, -0.012),
        (31, -0.025, -0.018, 0.015),
    ):
        for name, rot in (
            ("spine", (spine_x, 0, 0)),
            ("head", (0, 0, head_z)),
            ("arm.L", (0, arm, -arm)),
            ("arm.R", (0, -arm, arm)),
        ):
            pose_bone = rig.pose.bones[name]
            pose_bone.rotation_mode = "XYZ"
            pose_bone.rotation_euler = rot
            pose_bone.keyframe_insert("rotation_euler", frame=frame, group=name)
    action.frame_start = 1
    action.frame_end = 31

    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0, 0, 0)

    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 31
    scene.render.fps = 30

    BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND), compress=True)

    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = rig

    properties = {
        item.identifier
        for item in bpy.ops.export_scene.gltf.get_rna_type().properties
    }
    kwargs = {
        "filepath": str(OUTPUT),
        "export_format": "GLB",
        "use_selection": True,
        "export_skins": True,
        "export_animations": True,
        "export_force_sampling": True,
        "export_apply": False,
        "export_yup": True,
    }
    if "export_def_bones" in properties:
        kwargs["export_def_bones"] = True
    if "export_draco_mesh_compression_enable" in properties:
        kwargs["export_draco_mesh_compression_enable"] = True
        kwargs["export_draco_mesh_compression_level"] = 6
    bpy.ops.export_scene.gltf(**kwargs)

    print(
        "KAKI_RIG",
        {
            "source": str(SOURCE),
            "blend": str(BLEND),
            "output": str(OUTPUT),
            "vertices": len(mesh.data.vertices),
            "bones": [bone.name for bone in rig.data.bones],
            "action": action.name,
        },
    )


if __name__ == "__main__":
    main()
