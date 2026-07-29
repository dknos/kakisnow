// RockerKaki beauty material.
//
// The model keeps its authored colour, normal and metallic/roughness maps, but
// lives in the same sun, PCSS cascades, sky SH, spell lights and aerial
// perspective as the procedural snow hero. That common lighting is what stops
// an imported character from reading like a sticker laid over the snow.

#include<snowNoise>
#include<snowShading>
#include<snowSpellLights>
#include<snowAtmosphere>

varying vWorld: vec3f;
varying vNormal: vec3f;
varying vUV: vec2f;
varying vViewDist: f32;

var baseTex: texture_2d<f32>;
var baseTexSampler: sampler;
var normalTex: texture_2d<f32>;
var normalTexSampler: sampler;
var ormTex: texture_2d<f32>;
var ormTexSampler: sampler;
var skyLUT: texture_2d<f32>;
var skyLUTSampler: sampler;
var cascade0: texture_2d<f32>;
var cascade0Sampler: sampler;
var cascade1: texture_2d<f32>;
var cascade1Sampler: sampler;
var cascade2: texture_2d<f32>;
var cascade2Sampler: sampler;

uniform cameraPos: vec3f;
uniform sunDir: vec3f;
uniform sunRadiance: vec3f;
uniform shR: array<vec4f, 9>;

uniform cascadeMatrices: array<mat4x4f, 3>;
uniform cascadeSplits: vec4f;
uniform cascadeParams: array<vec4f, 3>;
uniform shadowTexel: f32;
uniform shadowSoftness: f32;
uniform shadowBias: f32;

uniform baseColor: vec3f;
uniform baseTextureStrength: f32;
uniform normalTextureStrength: f32;
uniform ormTextureStrength: f32;
uniform roughness: f32;
uniform metallic: f32;

uniform fogDensity: f32;
uniform fogHeightFalloff: f32;
uniform fogStart: f32;
uniform aerialStrength: f32;
uniform ambientIntensity: f32;

uniform spellLightPos: array<vec4f, 4>;
uniform spellLightCol: array<vec4f, 4>;
uniform spellLightCount: f32;

#include<snowShadowLookup>

fn cotangentFrame(N: vec3f, dp1: vec3f, dp2: vec3f, duv1: vec2f, duv2: vec2f) -> mat3x3f {
    let dp2perp = cross(dp2, N);
    let dp1perp = cross(N, dp1);
    let T = dp2perp * duv1.x + dp1perp * duv2.x;
    let B = dp2perp * duv1.y + dp1perp * duv2.y;
    let invmax = inverseSqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
    return mat3x3f(T * invmax, B * invmax, N);
}

fn envBRDFApprox(f0: vec3f, rough: f32, NdotV: f32) -> vec3f {
    let c0 = vec4f(-1.0, -0.0275, -0.572, 0.022);
    let c1 = vec4f(1.0, 0.0425, 1.04, -0.04);
    let r = vec4f(rough) * c0 + c1;
    let a004 = min(r.x * r.x, exp2(-9.28 * NdotV)) * r.x + r.y;
    return f0 * (-1.04 * a004 + r.z) + (1.04 * a004 + r.w);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    let world = input.vWorld;
    let V = normalize(uniforms.cameraPos - world);
    let L = uniforms.sunDir;

    let baseSample = textureSample(baseTex, baseTexSampler, input.vUV);
    if (baseSample.a < 0.08) { discard; }
    var albedo = uniforms.baseColor
               * mix(vec3f(1.0), baseSample.rgb, uniforms.baseTextureStrength);

    let orm = textureSample(ormTex, ormTexSampler, input.vUV).rgb;
    let ao = mix(1.0, orm.r, uniforms.ormTextureStrength);
    let rough = clamp(
        mix(uniforms.roughness, orm.g, uniforms.ormTextureStrength), 0.06, 1.0
    );
    let metal = clamp(
        mix(uniforms.metallic, orm.b, uniforms.ormTextureStrength), 0.0, 1.0
    );

    var N = normalize(input.vNormal);
    if (dot(N, V) < 0.0) { N = -N; }
    let geoN = N;

    if (uniforms.normalTextureStrength > 0.001) {
        let dp1 = dpdx(world);
        let dp2 = dpdy(world);
        let duv1 = dpdx(input.vUV);
        let duv2 = dpdy(input.vUV);
        let TBN = cotangentFrame(N, dp1, dp2, duv1, duv2);
        var mapN = textureSample(normalTex, normalTexSampler, input.vUV).xyz * 2.0 - 1.0;
        mapN = vec3f(
            mapN.xy * uniforms.normalTextureStrength,
            mapN.z
        );
        N = normalize(TBN * normalize(mapN));
    }

    let NdotL = dot(N, L);
    let NdotV = clamp(dot(N, V), 1e-4, 1.0);
    let noiseRot = ign(input.position.xy) * 6.28318530718;
    var shadow = 1.0;
    if (NdotL > -0.4) {
        shadow = sunShadow(world, geoN, input.vViewDist, noiseRot);
    }

    const INV_PI: f32 = 0.31830988618;
    let f0 = mix(vec3f(0.035), albedo, metal);
    var color = albedo * (1.0 - metal) * INV_PI
              * uniforms.sunRadiance * wrapDiffuse(NdotL, 0.08) * shadow;

    if (NdotL > 0.0) {
        let H = normalize(V + L);
        let NdotH = clamp(dot(N, H), 0.0, 1.0);
        let VdotH = clamp(dot(V, H), 0.0, 1.0);
        let D = distributionGGX(NdotH, rough);
        let Vis = visSmithGGXCorrelated(NdotV, NdotL, rough);
        let F = fresnelSchlick(VdotH, f0);
        color += uniforms.sunRadiance * D * Vis * F * NdotL * shadow;
    }

    var irradiance = shIrradiance(N, uniforms.shR) * uniforms.ambientIntensity;
    let under = clamp(-N.y * 0.5 + 0.5, 0.0, 1.0);
    irradiance += shIrradiance(vec3f(0.0, 1.0, 0.0), uniforms.shR)
                * uniforms.ambientIntensity * 0.36 * under;
    color += albedo * (1.0 - metal) * INV_PI * irradiance * ao;

    let R = reflect(-V, N);
    let skyRefl = textureSampleLevel(
        skyLUT, skyLUTSampler, dirToLatLong(R), sqrt(rough) * 6.0
    ).rgb;
    color += skyRefl * envBRDFApprox(f0, rough, NdotV)
           * uniforms.ambientIntensity * ao;

    if (uniforms.spellLightCount > 0.5) {
        color += spellLightingSurface(
            world, N, V, albedo, f0, rough, 0.15,
            uniforms.spellLightPos, uniforms.spellLightCol, uniforms.spellLightCount
        ) * ao;
    }

    color = applyAerial(
        color, uniforms.cameraPos, world, -V, L,
        skyLUT, skyLUTSampler, uniforms.sunRadiance,
        uniforms.fogDensity, uniforms.fogHeightFalloff, uniforms.fogStart,
        uniforms.aerialStrength
    );

    fragmentOutputs.color = vec4f(color, 1.0);
}
