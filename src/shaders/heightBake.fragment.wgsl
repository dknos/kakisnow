// Bakes the macro landform (broad dunes + medium drifts + rock outcrops) into a
// single-channel float texture covering the whole playable field.
//
// Baked rather than evaluated live for one reason: the CPU needs the same
// heights for character grounding, footfall placement and spell hit points, and
// reading back a GPU bake is the only way to guarantee the two never disagree.
// Re-implementing the noise in JS would drift the moment f32 and f64 rounding
// diverged, and the character would float or sink by centimetres.

#include<snowNoise>
#include<snowTerrain>

varying vUV: vec2f;

uniform worldOrigin: vec2f;
uniform worldSize: f32;
uniform windAngle: f32;
uniform heightAmp: f32;

// ------------------------------------------------------------------ the course
//
// The course is data, not code. `courseTex` carries one primitive per row —
// the same RawTexture-plus-textureLoad pattern the deformation brushes use,
// for the same reason: no uniform-array packing, one upload, one shader for
// every course. The Summit Line numbers this replaced live in
// `src/game/courses/summitLine.js`, and the bake-profile fingerprint proves
// the generalisation reproduces them exactly.
//
// Row layout (RGBA texels, x = texel index, y = primitive index):
//   kind 1, JUMP:  t0 = (1, lip, runIn, drop)          t1 = (height, 0, 0, 0)
//   kind 2, PIPE:  t0 = (2, fadeInFrom, from, to)      t1 = (fadeOutTo, wallFrom, wallTo, amp)
//                  t2 = (pack, packFalloff, gateXFrom, gateXTo)
//
// Jumps are additive, gated by the lane and the course's z gate. Pipes are
// not: inside its gate a pipe REPLACES the terrain with a centreline-pinned
// target, because a pipe floor crossed by whatever dunes happen to be there
// is not a pipe. The two blend modes are the reason a naive sum-of-primitives
// design was rejected.

var courseTex: texture_2d<f32>;
var courseTexSampler: sampler;

uniform primCount: f32;
uniform laneHalf: f32;
uniform laneFeather: f32;
// Where the course fades in and back out along z. Four scalars rather than a
// vec4 so the JS side stays setFloat like every other bake uniform.
uniform gateZInFrom: f32;
uniform gateZInTo: f32;
uniform gateZOutFrom: f32;
uniform gateZOutTo: f32;

fn courseJump(z: f32, lip: f32, runIn: f32, drop: f32, height: f32) -> f32 {
    // Quadratic approach: zero slope where the ramp begins, a positive slope all
    // the way through the lip. A smoothstep here would flatten at the crest and
    // quietly remove the vertical velocity the rider needs for a real takeoff.
    let t = clamp((z - (lip - runIn)) / runIn, 0.0, 1.0);
    let rise = t * t;
    let fall = 1.0 - smoothstep(lip, lip + drop, z);
    return rise * fall * height;
}

// The authored course as a light-touch layer on the natural snowfield: added
// lips and pipe walls, never a separate constant downhill plane. Returns
// (shaped height, pipe gate) — the gate also suppresses rock outcrops, since
// a boulder in a pipe floor is a wall at head height.
fn courseShape(
    p: vec2f,
    naturalHeight: f32,
    centreHeight: f32
) -> vec2f {
    let zGate = smoothstep(uniforms.gateZInFrom, uniforms.gateZInTo, p.y)
              * (1.0 - smoothstep(uniforms.gateZOutFrom, uniforms.gateZOutTo, p.y));
    let lane = 1.0 - smoothstep(uniforms.laneHalf, uniforms.laneFeather, abs(p.x));

    var added = 0.0;
    var pipeShape = 0.0;
    var pipePack = 0.0;
    var pipeGate = 0.0;

    let n = i32(uniforms.primCount);
    for (var i = 0; i < n; i++) {
        let t0 = textureLoad(courseTex, vec2i(0, i), 0);
        let kind = i32(t0.x);

        if (kind == 1) {
            let t1 = textureLoad(courseTex, vec2i(1, i), 0);
            added += lane * courseJump(p.y, t0.y, t0.z, t0.w, t1.x);
        } else if (kind == 2) {
            let t1 = textureLoad(courseTex, vec2i(1, i), 0);
            let t2 = textureLoad(courseTex, vec2i(2, i), 0);
            // Longitudinal gate: feather in, hold, feather out.
            let g = smoothstep(t0.y, t0.z, p.y)
                  * (1.0 - smoothstep(t0.w, t1.x, p.y));
            // Quadratic cross-section keeps the centre fast, lifts both walls.
            let wallT = smoothstep(t1.y, t1.z, abs(p.x));
            pipeShape += g * wallT * wallT * t1.w;
            // Slight centre packing keeps the intended line legible without
            // erasing the fine ridges or making a smooth plastic tube.
            pipePack += exp(-p.x * p.x * t2.y) * g * t2.x;
            pipeGate = max(pipeGate, g * (1.0 - smoothstep(t2.z, t2.w, abs(p.x))));
        }
    }

    var shaped = naturalHeight + added * zGate;
    let pipeTarget = centreHeight + pipeShape - pipePack;
    shaped = mix(shaped, pipeTarget, pipeGate);
    return vec2f(shaped, pipeGate);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    let p = uniforms.worldOrigin + input.vUV * uniforms.worldSize;

    var h = terrainMacro(p, uniforms.windAngle, uniforms.heightAmp);
    let centreHeight = terrainMacro(
        vec2f(0.0, p.y), uniforms.windAngle, uniforms.heightAmp
    );
    let course = courseShape(p, h, centreHeight);
    h = course.x;

    // Rock displaces snow upward; snow then re-accumulates on the flatter faces,
    // which the snow material resolves from the mask in the aux bake.
    let rock = rockField(p, uniforms.windAngle);
    let rockKeep = 1.0 - course.y;
    h += rock.x * rockKeep;

    fragmentOutputs.color = vec4f(h, rock.y * rockKeep, 0.0, 1.0);
}
