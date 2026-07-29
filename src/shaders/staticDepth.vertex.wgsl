// Generic shadow vertex path for imported static meshes.
//
// The terrain and procedural figure each need their own displacement/skinning
// pass. RockerKaki is ordinary authored geometry, so its complete shadow path
// is simply the mesh world matrix followed by the fitted cascade matrix.

attribute position: vec3f;

uniform world: mat4x4f;
uniform lightViewProjection: mat4x4f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    let world = uniforms.world * vec4f(vertexInputs.position, 1.0);
    vertexOutputs.position = uniforms.lightViewProjection * world;
}
