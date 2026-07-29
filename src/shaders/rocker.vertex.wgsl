// Authored static-mesh vertex path for RockerKaki.

attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;

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
    let world = uniforms.world * vec4f(vertexInputs.position, 1.0);
    let normal = normalize(
        (uniforms.normalMatrix * vec4f(vertexInputs.normal, 0.0)).xyz
    );

    vertexOutputs.vWorld = world.xyz;
    vertexOutputs.vNormal = normal;
    vertexOutputs.vUV = vertexInputs.uv;
    vertexOutputs.vViewDist = distance(world.xyz, uniforms.cameraPos);
    vertexOutputs.position = uniforms.viewProjection * world;
}
