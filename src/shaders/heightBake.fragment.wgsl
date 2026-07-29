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

fn courseJump(z: f32, lip: f32, runIn: f32, drop: f32, height: f32) -> f32 {
    // Quadratic approach: zero slope where the ramp begins, a positive slope all
    // the way through the lip. A smoothstep here would flatten at the crest and
    // quietly remove the vertical velocity the rider needs for a real takeoff.
    let t = clamp((z - (lip - runIn)) / runIn, 0.0, 1.0);
    let rise = t * t;
    let fall = 1.0 - smoothstep(lip, lip + drop, z);
    return rise * fall * height;
}

// Summit Line is a light-touch layer on the original rolling snowfield. It
// adds readable lips and pipe walls without replacing the terrain with a
// separate constant downhill plane.
fn summitLine(
    p: vec2f,
    naturalHeight: f32,
    centreHeight: f32
) -> vec2f {
    let zGate = smoothstep(-72.0, -28.0, p.y)
              * (1.0 - smoothstep(520.0, 585.0, p.y));
    let lane = 1.0 - smoothstep(34.0, 68.0, abs(p.x));
    var added = 0.0;

    // Long backsides retain a clear release but land as snow rolls, not cliffs.
    added += lane * courseJump(p.y, 50.0, 22.0, 20.0, 1.55);
    added += lane * courseJump(p.y, 184.0, 26.0, 24.0, 1.80);
    added += lane * courseJump(p.y, 496.0, 26.0, 24.0, 1.75);

    // Two halfpipes. The longitudinal gates feather them into the piste while
    // the quadratic cross-section keeps the centre fast and lifts both walls.
    let pipeA = smoothstep(270.0, 292.0, p.y)
              * (1.0 - smoothstep(370.0, 394.0, p.y));
    let pipeB = smoothstep(388.0, 410.0, p.y)
              * (1.0 - smoothstep(450.0, 470.0, p.y));
    let wallT = smoothstep(5.0, 21.0, abs(p.x));
    let walls = wallT * wallT;
    let pipeShape = pipeA * walls * 4.4 + pipeB * walls * 4.0;

    // Slight centre packing makes the intended line legible without erasing the
    // snow material's fine ridges or turning the course into a smooth plastic tube.
    let centrePack =
        exp(-p.x * p.x * 0.008) * (pipeA + pipeB) * 0.24;

    var shaped = naturalHeight + added * zGate;
    let pipeGate = max(pipeA, pipeB)
        * (1.0 - smoothstep(27.0, 40.0, abs(p.x)));
    let pipeTarget = centreHeight + pipeShape - centrePack;
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
    let course = summitLine(p, h, centreHeight);
    h = course.x;

    // Rock displaces snow upward; snow then re-accumulates on the flatter faces,
    // which the snow material resolves from the mask in the aux bake.
    let rock = rockField(p, uniforms.windAngle);
    let rockKeep = 1.0 - course.y;
    h += rock.x * rockKeep;

    fragmentOutputs.color = vec4f(h, rock.y * rockKeep, 0.0, 1.0);
}
