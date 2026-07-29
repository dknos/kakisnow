// Generic shadow vertex path for imported meshes.
//
// The terrain and procedural figure each need their own displacement/skinning
// pass. RockerKaki can opt into this file's compact four-weight skinning branch.

attribute position: vec3f;

#ifdef ROCKER_SKINNED
attribute matricesIndices: vec4f;
attribute matricesWeights: vec4f;
uniform mBones: array<mat4x4f, BonesPerMesh>;
#endif

uniform world: mat4x4f;
uniform lightViewProjection: mat4x4f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    var localPosition = vec4f(vertexInputs.position, 1.0);
#ifdef ROCKER_SKINNED
    let influence =
          uniforms.mBones[i32(vertexInputs.matricesIndices.x)]
              * vertexInputs.matricesWeights.x
        + uniforms.mBones[i32(vertexInputs.matricesIndices.y)]
              * vertexInputs.matricesWeights.y
        + uniforms.mBones[i32(vertexInputs.matricesIndices.z)]
              * vertexInputs.matricesWeights.z
        + uniforms.mBones[i32(vertexInputs.matricesIndices.w)]
              * vertexInputs.matricesWeights.w;
    localPosition = influence * localPosition;
#endif
    let world = uniforms.world * localPosition;
    vertexOutputs.position = uniforms.lightViewProjection * world;
}
