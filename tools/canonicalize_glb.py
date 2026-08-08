"""Byte-canonicalize equivalent Blender GLB output."""

from __future__ import annotations

import json
from pathlib import Path
import struct


def canonicalize_glb(path, *, uv_precision=6):
    """Sort triangle records, round UV noise, and stabilize GLB JSON order."""
    path = Path(path)
    data = bytearray(path.read_bytes())
    if data[:4] != b"glTF":
        raise RuntimeError(f"not a GLB: {path}")

    json_length = struct.unpack_from("<I", data, 12)[0]
    json_start = 20
    document = json.loads(bytes(data[json_start:json_start + json_length]).rstrip(b" \0"))
    bin_header = json_start + json_length
    bin_length = struct.unpack_from("<I", data, bin_header)[0]
    bin_start = bin_header + 8
    binary = bytearray(data[bin_start:bin_start + bin_length])

    component_format = {5121: "B", 5123: "H", 5125: "I"}
    component_size = {5121: 1, 5123: 2, 5125: 4, 5126: 4}

    def accessor_slice(accessor):
        view = document["bufferViews"][accessor["bufferView"]]
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        stride = view.get("byteStride", 0)
        if stride:
            raise RuntimeError(f"unexpected interleaved accessor in {path}")
        size = component_size[accessor["componentType"]]
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
        return start, size * width

    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            if primitive.get("mode", 4) != 4 or "indices" not in primitive:
                continue
            accessor = document["accessors"][primitive["indices"]]
            fmt = component_format.get(accessor["componentType"])
            if not fmt or accessor["count"] % 3:
                continue
            start, _ = accessor_slice(accessor)
            count = accessor["count"]
            values = list(struct.unpack_from("<" + fmt * count, binary, start))
            triangles = [tuple(values[i:i + 3]) for i in range(0, count, 3)]
            triangles.sort()
            struct.pack_into(
                "<" + fmt * count,
                binary,
                start,
                *(value for triangle in triangles for value in triangle),
            )

    for accessor in document.get("accessors", []):
        if accessor.get("type") != "VEC2" or accessor.get("componentType") != 5126:
            continue
        start, width = accessor_slice(accessor)
        for index in range(accessor["count"]):
            offset = start + index * width
            u, v = struct.unpack_from("<2f", binary, offset)
            struct.pack_into(
                "<2f", binary, offset, round(u, uv_precision), round(v, uv_precision)
            )

    json_bytes = json.dumps(
        document, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    json_bytes += b" " * (-len(json_bytes) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    output = bytearray(struct.pack("<4sII", b"glTF", 2, total))
    output += struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    output += struct.pack("<II", len(binary), 0x004E4942) + binary
    path.write_bytes(output)
