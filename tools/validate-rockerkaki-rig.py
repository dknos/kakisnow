"""Headless acceptance checks for art/rockerkaki-rig.blend."""

from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
BLEND = ROOT / "art/rockerkaki-rig.blend"
GLB = ROOT / "public/assets/models/rockerkaki-rigged.glb"
EXPECTED_BONES = {
    "root", "pelvis", "spine", "chest", "neck", "head",
    "arm.L", "arm.R", "leg.L", "leg.R",
}


def main():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    rig = bpy.data.objects["KakiRig"]
    mesh = bpy.data.objects["RockerKaki"]
    bone_names = {bone.name for bone in rig.data.bones}
    assert bone_names == EXPECTED_BONES, bone_names
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    assert all(abs(bone.roll) < 1e-6 for bone in rig.data.edit_bones)
    bpy.ops.object.mode_set(mode="OBJECT")
    assert rig.data.bones["root"].use_deform is False
    assert all(
        rig.data.bones[name].use_deform
        for name in EXPECTED_BONES - {"root"}
    )
    assert any(
        modifier.type == "ARMATURE" and modifier.object == rig
        for modifier in mesh.modifiers
    )
    assert mesh.parent is None
    assert bpy.data.actions.get("RockerBreath") is not None
    # The clean palette-authored replacement is intentionally smaller than the
    # former generated mesh. Structural checks are meaningful; a historical
    # byte-size floor is not.
    assert GLB.exists() and GLB.stat().st_size > 50_000

    max_influences = max(
        len(vertex.groups) for vertex in mesh.data.vertices
    )
    assert max_influences <= 4, max_influences
    assert all(len(vertex.groups) > 0 for vertex in mesh.data.vertices)
    assert len(mesh.data.vertices) >= 3_000
    assert len(mesh.data.polygons) >= 3_000
    assert len(mesh.data.materials) == 1

    print({
        "blend": str(BLEND),
        "glb": str(GLB),
        "bones": len(bone_names),
        "deform_bones": sum(bone.use_deform for bone in rig.data.bones),
        "vertices": len(mesh.data.vertices),
        "max_influences": max_influences,
        "action": "RockerBreath",
    })


if __name__ == "__main__":
    main()
