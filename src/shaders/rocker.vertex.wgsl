// Imported RockerKaki vertex path. The Blender-authored character uses the
// skinned branch; the procedural saucer and copper rim share the static branch.

attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;

#ifdef ROCKER_SKINNED
attribute matricesIndices: vec4f;
attribute matricesWeights: vec4f;
uniform mBones: array<mat4x4f, BonesPerMesh>;
#endif

uniform world: mat4x4f;
uniform normalMatrix: mat4x4f;
uniform viewProjection: mat4x4f;
uniform cameraPos: vec3f;

varying vWorld: vec3f;
varying vNormal: vec3f;
varying vUV: vec2f;
varying vViewDist: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    var localPosition = vec4f(vertexInputs.position, 1.0);
    var localNormal = vec4f(vertexInputs.normal, 0.0);
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
    localNormal = influence * localNormal;
#endif
    let world = uniforms.world * localPosition;
    let normal = normalize(
        (uniforms.normalMatrix * localNormal).xyz
    );

    vertexOutputs.vWorld = world.xyz;
    vertexOutputs.vNormal = normal;
    vertexOutputs.vUV = vertexInputs.uv;
    vertexOutputs.vViewDist = distance(world.xyz, uniforms.cameraPos);
    vertexOutputs.position = uniforms.viewProjection * world;
}
