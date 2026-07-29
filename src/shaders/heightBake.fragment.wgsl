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

// Summit Line is authored into the same R32F bake as the natural field. That
// gives the course one source of truth for rendering, collision, shadows,
// camera clearance, deformation and spell impacts.
fn summitLine(p: vec2f, naturalHeight: f32) -> vec2f {
    let zGate = smoothstep(-72.0, -28.0, p.y)
              * (1.0 - smoothstep(520.0, 585.0, p.y));
    let centre = 1.0 - smoothstep(48.0, 112.0, abs(p.x));
    let blend = zGate * centre;

    // A 74 m vertical drop over the playable run, softened with long snow rolls.
    var shaped = 52.0 - p.y * 0.132;
    shaped += sin((p.y + 18.0) * 0.022) * 1.15;
    shaped += sin((p.y - 42.0) * 0.057) * 0.38;

    // Three progression jumps: a friendly first hit, a longer table, then the
    // finish-line kicker. Their short back faces create real ballistic takeoff.
    shaped += courseJump(p.y, 82.0, 20.0, 7.0, 3.2);
    shaped += courseJump(p.y, 214.0, 28.0, 9.0, 5.1);
    shaped += courseJump(p.y, 472.0, 24.0, 8.0, 4.3);

    // Two halfpipes. The longitudinal gates feather them into the piste while
    // the quadratic cross-section keeps the centre fast and lifts both walls.
    let pipeA = smoothstep(270.0, 292.0, p.y)
              * (1.0 - smoothstep(370.0, 394.0, p.y));
    let pipeB = smoothstep(388.0, 410.0, p.y)
              * (1.0 - smoothstep(450.0, 470.0, p.y));
    let wallT = smoothstep(5.0, 21.0, abs(p.x));
    let walls = wallT * wallT;
    shaped += pipeA * walls * 6.8;
    shaped += pipeB * walls * 5.4;

    // Slight centre packing makes the intended line legible without erasing the
    // snow material's fine ridges or turning the course into a smooth plastic tube.
    shaped -= exp(-p.x * p.x * 0.008) * (pipeA + pipeB) * 0.45;

    return vec2f(mix(naturalHeight, shaped, blend), blend);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    let p = uniforms.worldOrigin + input.vUV * uniforms.worldSize;

    var h = terrainMacro(p, uniforms.windAngle, uniforms.heightAmp);
    let course = summitLine(p, h);
    h = course.x;

    // Rock displaces snow upward; snow then re-accumulates on the flatter faces,
    // which the snow material resolves from the mask in the aux bake.
    let rock = rockField(p, uniforms.windAngle);
    let rockKeep = 1.0 - course.y;
    h += rock.x * rockKeep;

    fragmentOutputs.color = vec4f(h, rock.y * rockKeep, 0.0, 1.0);
}
