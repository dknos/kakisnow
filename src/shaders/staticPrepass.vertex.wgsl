// Camera-space depth prepass for imported static meshes.

attribute position: vec3f;

uniform world: mat4x4f;
uniform viewProjection: mat4x4f;

varying vViewZ: f32;
varying vMask: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    let world = uniforms.world * vec4f(vertexInputs.position, 1.0);
    let clip = uniforms.viewProjection * world;
    vertexOutputs.vViewZ = clip.w;
    vertexOutputs.vMask = 0.0;
    vertexOutputs.position = clip;
}
