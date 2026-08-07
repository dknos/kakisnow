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
//   kind 3, RIDGE: t0 = (3, zFrom, zTo, featherZ)      t1 = (xCentre, halfWidth, featherX, height)
//     An elongated mound (positive height) or trench (negative — a creek bed,
//     a ditch) along z, offset in x. Additive like the jumps, but NOT lane-
//     gated: a ridge is course architecture — a route divider, a bank — and
//     may legally stand at the lane's edge where the lane gate would erase it.
//   kind 4, SKIJUMP: t0 = (4, fadeInFrom, holdFrom, lipZ)
//                    t1 = (inrunLen, inrunDrop, tableLen, lipRise)
//                    t2 = (hillLen, hillDrop, outrunLen, outrunDrop)
//                    t3 = (closeLen, gateXFrom, gateXTo, bowl)
//     A whole jumping hill: steepened in-run, takeoff table, landing hill,
//     outrun, and the climb back onto the natural field behind it. REPLACE-
//     blended through the same accumulators the pipe uses, and for a stronger
//     version of the same reason: a landing that a passing dune has put a
//     two-metre lump in is a landing that breaks a fifty-metre flight. Its
//     lateral gate also cuts the rock field, so nothing outcrops in the hill.
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

// The jumping hill's longitudinal profile, in metres above the natural
// centreline. Zero at both ends by construction, which is what lets a hill
// forty-odd metres deep sit on a field with ten metres of relief without
// leaving a step anywhere the gate closes.
fn courseSkiJump(
    z: f32, lipZ: f32,
    inrunLen: f32, inrunDrop: f32, tableLen: f32, lipRise: f32,
    hillLen: f32, hillDrop: f32, outrunLen: f32, outrunDrop: f32, closeLen: f32
) -> f32 {
    let tableFrom = lipZ - tableLen;
    if (z < tableFrom) {
        // In-run. Eases into its steepest just before the table, so the
        // approach has no kink where it leaves the natural field — the rider
        // is already committed by the time the ground starts to help.
        let s = clamp(
            (z - (lipZ - inrunLen)) / max(1.0, inrunLen - tableLen), 0.0, 1.0
        );
        return -inrunDrop * s * s;
    }
    let lipH = lipRise - inrunDrop;
    if (z < lipZ) {
        // The table, quadratic for the reason courseJump is: the slope has to
        // still be rising AT the lip. A profile that flattens at the crest
        // hands the rider no vertical velocity and the hill becomes a drop.
        let u = clamp((z - tableFrom) / max(1.0, tableLen), 0.0, 1.0);
        return -inrunDrop + lipRise * u * u;
    }
    let hillEnd = lipH - hillDrop;
    if (z < lipZ + hillLen) {
        // Landing hill: steepest at the knoll, flattening into the outrun. A
        // slow rider lands high on a steep face, a fast one lands low on a
        // shallow one, and both land on snow that is falling away from them —
        // which is the whole difference between a jump and a cliff.
        //
        // Cubic, not quadratic. `SURF_MAX` caps the classic board at 19.5 m/s,
        // so the flight is short and the only lever left on airtime is how
        // fast the ground gets out of the way: a squared falloff put the knoll
        // at 39° and the rider back on the snow after 2.1 s, a cubed one puts
        // it at 50° — which is also what the steepest part of a real landing
        // hill measures — and buys half a second and eleven metres of drop
        // without moving the hill's length or its total fall.
        let v = clamp((z - lipZ) / max(1.0, hillLen), 0.0, 1.0);
        let w = 1.0 - v;
        return lipH - hillDrop * (1.0 - w * w * w);
    }
    if (z < lipZ + hillLen + outrunLen) {
        let v = clamp((z - (lipZ + hillLen)) / max(1.0, outrunLen), 0.0, 1.0);
        return hillEnd - outrunDrop * v;
    }
    // The valley head. Not a playable surface — the play radius stops well
    // short of it — but the basin has to rejoin the natural field somewhere,
    // and a long smooth climb behind the camp is what a valley does anyway.
    let basin = hillEnd - outrunDrop;
    let v = clamp(
        (z - (lipZ + hillLen + outrunLen)) / max(1.0, closeLen), 0.0, 1.0
    );
    return basin * (1.0 - smoothstep(0.0, 1.0, v));
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
        } else if (kind == 3) {
            let t1 = textureLoad(courseTex, vec2i(1, i), 0);
            let g = smoothstep(t0.y - t0.w, t0.y, p.y)
                  * (1.0 - smoothstep(t0.z, t0.z + t0.w, p.y));
            // Squared-smoothstep flank: rounded crest, no sharp shoulder for
            // the board's stiff span to catch on.
            let d = abs(p.x - t1.x);
            let flank = 1.0 - smoothstep(t1.y, t1.y + t1.z, d);
            added += g * flank * flank * t1.w;
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
        } else if (kind == 4) {
            let t1 = textureLoad(courseTex, vec2i(1, i), 0);
            let t2 = textureLoad(courseTex, vec2i(2, i), 0);
            let t3 = textureLoad(courseTex, vec2i(3, i), 0);
            // The profile ends where the closing climb does, so the gate's own
            // extent is derived rather than authored twice and left to drift.
            let profileEnd = t0.w + t2.x + t2.z + t3.x;
            let g = smoothstep(t0.y, t0.z, p.y)
                  * (1.0 - smoothstep(profileEnd, profileEnd + 30.0, p.y));
            let prof = courseSkiJump(
                p.y, t0.w, t1.x, t1.y, t1.z, t1.w, t2.x, t2.y, t2.z, t2.w, t3.x
            );
            // A jumping hill is anchored to ONE height, not to the running
            // centreline the pipe follows. A pipe floor that rolls with the
            // dunes is a pipe; a landing hill that rolls with them is four
            // metres of noise under a rider falling fifty, and the first bake
            // put a 10° riser halfway down the landing. So the surface is the
            // authored profile above the natural height where it begins —
            // which is also why it enters seamlessly: at the top of the
            // in-run the profile is zero, so anchor and mountain agree.
            let anchor = terrainMacro(
                vec2f(0.0, t0.z), uniforms.windAngle, uniforms.heightAmp
            );
            // The landing is dished, from the lip down: a bowl gathers a rider
            // who drifted in the air back toward the centre line. The in-run
            // and table stay dead flat — camber under a board that is trying
            // to go straight is a steering input nobody asked for.
            let bowlT = clamp((p.y - t0.w) / max(1.0, t2.x), 0.0, 1.0);
            let xn = p.x / max(1.0, t3.z);
            pipeShape += g * (
                anchor - centreHeight + prof + t3.w * bowlT * xn * xn
            );
            pipeGate = max(pipeGate, g * (1.0 - smoothstep(t3.y, t3.z, abs(p.x))));
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
