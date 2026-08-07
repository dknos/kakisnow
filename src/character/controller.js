/**
 * Character locomotion + snow-surf physics.
 *
 * This owns motion only — the visual rig, cloth and fur read the state this
 * produces. Two modes share one integrator:
 *
 *  - WALK: camera-relative desired velocity, eased facing, distance-driven gait
 *    phase so footfalls land where the feet actually are (no sliding).
 *  - SURF: momentum-carrying. Thrust along facing, steering from mouse yaw,
 *    strong lateral grip that bleeds into a drift as you push the carve, and
 *    slope-driven acceleration so dropping down a dune face feels like a gain.
 *
 * Blending between them is eased in both directions; there is no snap.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scalar } from "@babylonjs/core/Maths/math.scalar.js";
import { input } from "../core/input.js";
import { expDamp } from "../core/camera.js";

const _wish = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _tmp = new Vector3();
const _n = new Vector3();

const WALK_SPEED = 2.5;
const RUN_SPEED = 5.4;
const WALK_ACCEL = 26;
const WALK_DECEL = 30;

const SURF_MAX = 19.5;
const SURF_THRUST = 11.0;
const SURF_DRAG = 0.42;
const SURF_TURN = 2.35; // rad/s at full steer
const SURF_GRIP = 7.5;

/**
 * Rocket thrust, m/s², at full throttle on the ground.
 *
 * Added to the same forward thrust the surf already applies, along the same
 * heading, so it is an engine on the board rather than a second way to move.
 * That it is purely horizontal is not an oversight — it is what makes
 * indefinite vertical flight structurally impossible rather than something
 * that has to be caught by a limit.
 */
const BOOST_THRUST = 22.0;
/**
 * How much of it survives leaving the ground.
 *
 * Enough to extend a jump, not enough to fly one. A rider who can hold full
 * thrust in the air stops reading terrain and starts reading a fuel gauge.
 */
const BOOST_AIR_SCALE = 0.35;
/**
 * Extra drag above the unboosted top speed, per (m/s)² of overspeed.
 *
 * The terminal speed under boost comes out of this rather than out of a clamp:
 * thrust and drag balance around 26 m/s, and the rider feels the engine stop
 * gaining rather than the number stop moving. The clamp below still exists, at
 * a speed the drag should never let anything reach, because a backstop that
 * never fires costs nothing and a NaN that escapes costs the frame.
 */
const BOOST_OVERSPEED_DRAG = 0.55;
/** Absolute backstop. Drag settles well under this; nothing should reach it. */
const BOOST_SPEED_CEILING = 32.0;

const GRAVITY = 18.5;
const JUMP_SPEED = 7.25;
const JUMP_BUFFER = 0.14;
const COYOTE_TIME = 0.11;
const NATURAL_TAKEOFF_MIN_SPEED = 7.5;
const NATURAL_TAKEOFF_MIN_RISE = 1.15;
const NATURAL_TAKEOFF_CLEARANCE = 0.008;

// ------------------------------------------------------------------- tricks
//
// Trick rotation is VISUAL, never ballistic: the trajectory a jump takes is
// identical whether the rider spins or not, which keeps the committed smoke
// tools' flight assertions true and means a trick can never be used to fly.
// What a trick risks is the landing — the residual rotation at touchdown
// decides the grade, and the grade decides speed, integrity and the combo.
/** Full spin rate at held input, rad/s. Two revolutions per airborne second. */
const TRICK_SPIN_RATE = 12.6;
/** Flip rate, rad/s. A single flip wants about two thirds of a second. */
const TRICK_FLIP_RATE = 10.0;
/** How fast held rotation ramps in/out — a flick, not a light switch. */
const TRICK_RAMP = 10;
/** Residuals (rad) and impacts that grade a landing. Impact alone can only
 *  make a landing sketchy, never a crash — this course drops riders off
 *  kickers at speed all run long, and the scoring has always held that every
 *  landing here is a bit sketchy. A crash needs a blown rotation (below) or
 *  a frontal obstacle (the collision response). */
const GRADE_CRASH_FLIP = 0.87;   // ~50° of unfinished flip
const GRADE_CRASH_SPIN = 1.05;   // ~60° of unfinished spin
const GRADE_SKETCHY_FLIP = 0.44;
const GRADE_SKETCHY_SPIN = 0.61;
const GRADE_SKETCHY_IMPACT = 1.05;
const GRADE_PERFECT_RESIDUAL = 0.14;
const GRADE_PERFECT_IMPACT = 0.75;
/** Landing consequences, applied to horizontal speed. */
const PERFECT_SPEED_REWARD = 1.04;
const SKETCHY_SPEED_SCRUB = 0.88;
/** The tumble: how long a crash owns the rider, and how hard it brakes. */
const CRASH_TUMBLE_TIME = 1.0;
const CRASH_SPEED_KEEP = 0.35;
const CRASH_FRICTION = 2.6;
/** The rider's collision body. */
const BODY_RADIUS = 0.42;
const BODY_CENTRE_Y = 0.7;

// -------------------------------------------------------------------- rails
/** How close to a rail's line the falling board has to pass to catch it. */
const RAIL_CATCH_RADIUS = 1.1;
/** Approach heading may differ from the rail's by this much, radians (~35°). */
const RAIL_CATCH_ANGLE = 0.62;
const RAIL_MIN_SPEED = 6;
/** Grinding bleeds speed gently; a rail is a line, not an engine. */
const RAIL_DRAG = 0.55;
/** Popping off a rail is most of a jump, not all of one. */
const RAIL_POP_SPEED = JUMP_SPEED * 0.8;
/** Hitting something head-on above this speed is a crash, not a scrape. */
const CRASH_FRONTAL_DOT = 0.62;
const CRASH_MIN_SPEED = 8;

/** Gait: metres of travel per full stride cycle, scaled by speed. */
const STRIDE_BASE = 1.55;

export class CharacterController {
    /**
     * @param {{ heightAt(x:number,z:number):number, normalAt(x:number,z:number,out:Vector3):Vector3 }} terrain
     */
    constructor(terrain) {
        this.terrain = terrain;

        this.position = new Vector3(0, 0, 0);
        this.velocity = new Vector3(0, 0, 0);
        this.prevVelocity = new Vector3(0, 0, 0);
        this.acceleration = new Vector3(0, 0, 0);

        this.facing = 0; // yaw, radians
        this.speed = 0;
        this.speed01 = 0; // normalised against SURF_MAX, for FOV/wind

        /** 0 = walking, 1 = fully surfing. Eased. */
        this.surf = 0;
        this.surfActive = false;

        /**
         * 0 = not casting, 1 = fully in the bending stance. Written by the spell
         * system, read by the figure.
         *
         * It lives here rather than on the spell system because the figure
         * already reads the controller for everything else it poses from, and a
         * second source of "what is this character doing" is how the arms and the
         * legs end up disagreeing about which frame it is.
         */
        this.cast = 0;
        this.castAimX = 0;
        this.castAimY = 0;
        this.castAimZ = 1;

        /** Signed lean, -1..1 (right positive), from lateral acceleration. */
        this.lean = 0;
        /** Signed carve amount for wake shaping. Positive = turning right. */
        this.carve = 0;
        /**
         * 0..1, how hard the screen-space speed streaks should read. Deadbanded
         * well above walking pace: streaks at a jog make the demo feel cheap.
         */
        this.streak01 = 0;

        // ------------------------------------------------------------- gait
        this.gaitPhase = 0;
        /**
         * True when the legs should be running a gait at all.
         *
         * One flag, read by the figure and by the contact system, because three
         * copies of "is this character walking" is three chances for the feet to
         * disagree with the footprints.
         */
        this.stepping = true;
        /** Set true for exactly one frame when a foot plants. */
        this.footfall = false;
        /** 0 = left foot, 1 = right foot — which foot just planted. */
        this.footIndex = 0;
        /** World position of the foot that just planted. */
        this.footPos = new Vector3();
        /** Impact strength 0..1, scales spray and deformation depth. */
        this.footImpact = 0;

        this.groundY = 0;
        this.groundNormal = new Vector3(0, 1, 0);
        this.grounded = true;
        this.airborne = false;
        this.verticalVelocity = 0;
        this.airTime = 0;
        this.jumpCount = 0;
        this.landed = false;
        this.landingImpact = 0;
        this._jumpBuffer = 0;
        this._coyote = COYOTE_TIME;

        this._prevSpeed = 0;

        /**
         * Rocket throttle, 0..1, written by whatever vehicle the rider is on.
         *
         * Zero for the classic snowboard, which is why nothing about the
         * original ride changes: every term it gates is multiplied by it.
         */
        this.boost = 0;
        /** Metres per second of thrust actually delivered this frame, for telemetry. */
        this.boostDelivered = 0;

        // ------------------------------------------------------------ tricks
        /** Visual trick rotation, radians. The hero renders these on its own
         *  trick node; the terrain fit never sees them. */
        this.trickSpin = 0;
        this.trickFlip = 0;
        /** This frame's rotation deltas, for the score tracker. */
        this.trickDSpin = 0;
        this.trickDFlip = 0;
        /** "left" | "right" | null — tweak currently held in the air. */
        this.grabDir = null;
        /** Whether meaningful trick input happened this air. */
        this.didTrick = false;
        /** One-frame with `landed`: "perfect" | "clean" | "sketchy" | "crash". */
        this.landingGrade = null;
        this._spinRate = 0;
        this._flipRate = 0;

        // ------------------------------------------------------------- crash
        /** The tumble owns the rider: steering frozen, heavy friction. */
        this.crashed = false;
        this.crashTimer = 0;
        /** Set when the tumble ends; the game layer respawns and clears it. */
        this.needsRecovery = false;
        /** One-frame: glanced off something solid this frame. */
        this.scraped = false;
        /** One-frame: brushed something soft (a shrub, a snowbank). */
        this.brushedSoft = false;
        /** Total crashes this run — the game layer resets it. */
        this.crashCount = 0;

        /**
         * The obstacle world, injected by the game layer. Null means open
         * snow — every test and Free Ride Lab before dressing colliders
         * existed — and costs one branch.
         * @type {null|{sweepSphere(x0,y0,z0,x1,y1,z1,r):object|null}}
         */
        this.world = null;

        /**
         * How hard the snow underfoot is, 0 powder .. 1 blue ice. Written by
         * the game layer from the course's surface strips. Ice steals edge
         * grip — the board still thrusts and still steers its heading, but
         * the velocity stops following it, which is exactly what ice does.
         */
        this.surfaceHardness = 0;

        // ------------------------------------------------------------- rails
        /** Attached to a rail. Grounded is false; ballistics are suspended. */
        this.grinding = false;
        /** One-frame: caught a rail this frame. */
        this.grindStarted = false;
        /** One-frame with the exit: {clean} — rode off or popped off = clean. */
        this.grindEnded = null;
        this._rail = null;
        this._railT = 0;
        this._railDir = 1;
        this._railLen = 1;
        /** Re-attach lockout after a detach — popping off a rail at its own
         *  apex otherwise lands the board straight back on the beam. */
        this._railCool = 0;
    }

    /**
     * @param {number} dt
     * @param {import("../core/camera.js").CameraRig} rig
     */
    update(dt, rig) {
        const h = Math.min(dt, 1 / 30);

        this.prevVelocity.copyFrom(this.velocity);
        this.surfActive = input.surf;
        this.landed = false;
        this.landingImpact = 0;
        this.landingGrade = null;
        this.scraped = false;
        this.brushedSoft = false;
        this.trickDSpin = 0;
        this.trickDFlip = 0;
        this.grindStarted = false;
        this.grindEnded = null;

        if (input.jumpPressed) this._jumpBuffer = JUMP_BUFFER;
        else this._jumpBuffer = Math.max(0, this._jumpBuffer - h);
        this._railCool = Math.max(0, this._railCool - h);
        if (this.grounded) this._coyote = COYOTE_TIME;
        else this._coyote = Math.max(0, this._coyote - h);

        // Ease the surf blend — entering and exiting are transitions, not switches.
        this.surf = expDamp(this.surf, this.surfActive ? 1 : 0, this.surfActive ? 2.6 : 3.4, h);

        rig.getFlatForward(_fwd);
        rig.getFlatRight(_right);

        if (this.grinding) {
            // The rail owns everything: position, velocity, heading. The
            // ballistic block below is skipped whole — a grind is neither
            // grounded nor falling.
            this._grindStep(h);
        } else {
        if (this.crashed) this._crashStep(h);
        else if (this.surf > 0.5) this._surfStep(h, rig);
        else this._walkStep(h);

        // ------------------------------------------------ integrate + ground/air
        const oldGround = this.terrain.heightAt(this.position.x, this.position.z);
        const oldY = this.position.y;
        const oldX = this.position.x;
        const oldZ = this.position.z;
        this.position.x += this.velocity.x * h;
        this.position.z += this.velocity.z * h;

        // ------------------------------------------------------- obstacles
        // Swept, like the pickups: at nineteen metres a second a tree is
        // narrower than a frame. The sweep runs at chest height so a rock the
        // rider can roll over does not read as a wall.
        if (this.world && !this.crashed && h > 0) {
            const hit = this.world.sweepSphere(
                oldX, oldY + BODY_CENTRE_Y, oldZ,
                this.position.x, oldY + BODY_CENTRE_Y, this.position.z,
                BODY_RADIUS
            );
            if (hit && hit.collider.kind !== "rail" &&
                hit.collider.kind !== "trigger") {
                this._resolveObstacle(hit, oldX, oldZ, h);
            }
        }

        this.groundY = this.terrain.heightAt(this.position.x, this.position.z);
        this.terrain.normalAt(this.position.x, this.position.z, this.groundNormal);
        const groundRate = h > 0 ? (this.groundY - oldGround) / h : 0;

        // A short buffer plus coyote time makes Space reliable at ramp lips and
        // over uneven snow. The impulse keeps useful upward speed from a takeoff.
        if (this._jumpBuffer > 0 && this._coyote > 0 && !this.crashed) {
            this.grounded = false;
            this.airborne = true;
            this.verticalVelocity = Math.max(JUMP_SPEED, this.verticalVelocity + JUMP_SPEED * 0.42);
            this._jumpBuffer = 0;
            this._coyote = 0;
            this.jumpCount++;
            this._beginAir();
        }

        if (this.grounded) {
            // Carry the ramp's vertical surface velocity forward. When the ground
            // falls away after a fast rising lip, the same ballistic solve used by
            // a Space jump takes over: authored jumps launch, they do not glue the
            // rider to their downhill face.
            const flightY = oldY + this.verticalVelocity * h - GRAVITY * h * h * 0.5;
            const naturalTakeoff =
                this.surf > 0.45 &&
                this.speed >= NATURAL_TAKEOFF_MIN_SPEED &&
                this.verticalVelocity >= NATURAL_TAKEOFF_MIN_RISE &&
                this.groundY < flightY - NATURAL_TAKEOFF_CLEARANCE;

            if (naturalTakeoff) {
                this.grounded = false;
                this.airborne = true;
                this.position.y = flightY;
                this.verticalVelocity -= GRAVITY * h;
                this.jumpCount++;
                this._beginAir();
            } else {
                this.position.y = this.groundY;
                this.verticalVelocity = Scalar.Clamp(groundRate, -5, 9);
            }
        } else {
            this.airTime += h;
            this.verticalVelocity -= GRAVITY * h;
            this.position.y += this.verticalVelocity * h;

            if (this.position.y <= this.groundY && this.verticalVelocity <= groundRate + 0.5) {
                const impactSpeed = Math.max(0, groundRate - this.verticalVelocity);
                const airTimeWas = this.airTime;
                this.position.y = this.groundY;
                this.verticalVelocity = Scalar.Clamp(groundRate, -5, 9);
                this.grounded = true;
                this.airborne = false;
                this.landed = true;
                this.landingImpact = Scalar.Clamp(impactSpeed / 10, 0.2, 1.5);
                this.airTime = 0;
                rig.addTrauma(Math.min(0.38, this.landingImpact * 0.22));
                if (!this.crashed) this._gradeLanding(airTimeWas);
            }
        }

        // Falling near a rail, aligned and fast enough: catch it.
        if (!this.grounded && !this.crashed && this.world &&
            this.verticalVelocity < 1.5 && this._railCool <= 0) {
            this._tryCatchRail();
        }
        } // end of the non-grinding block

        // ------------------------------------------------------------ tricks
        this._updateTricks(h);

        // The crash announces itself to the camera once, however it started —
        // a blown landing above or a tree in `_resolveObstacle`, which has no
        // rig to shake.
        if (this.crashed && !this._crashShaken) {
            this._crashShaken = true;
            rig.addTrauma(0.55);
        } else if (!this.crashed) {
            this._crashShaken = false;
        }

        // --------------------------------------------------------- bookkeeping
        this.speed = Math.hypot(this.velocity.x, this.velocity.z);
        this.speed01 = Scalar.Clamp(this.speed / SURF_MAX, 0, 1);

        // Guarded, because `S.freezeTime` feeds a dt of exactly zero and this
        // is a division by it. Frozen, the quotient was 0/0: acceleration went
        // NaN, lean and carve inherited it, and every consumer downstream got a
        // NaN rotation — which used to cost a slightly wrong body lean and now
        // costs the board's whole attitude. Holding the last value is what
        // "frozen" should mean anyway.
        if (h > 0) {
            this.acceleration.x = (this.velocity.x - this.prevVelocity.x) / h;
            this.acceleration.z = (this.velocity.z - this.prevVelocity.z) / h;
        }

        // Lateral acceleration → lean. Project accel onto the character's right.
        const rx = Math.cos(this.facing);
        const rz = -Math.sin(this.facing);
        const latAcc = this.acceleration.x * rx + this.acceleration.z * rz;
        const leanWant = Scalar.Clamp(latAcc / 26, -1, 1) * (0.35 + 0.65 * this.surf);
        this.lean = expDamp(this.lean, leanWant, 6.5, h);
        this.carve = expDamp(this.carve, leanWant, 9, h);

        this.streak01 = this.surf * Scalar.Clamp((this.speed - 7) / 11, 0, 1);

        this._gait(h);
    }

    _walkStep(h) {
        const maxSpeed = input.sprint ? RUN_SPEED : WALK_SPEED;

        _wish.set(
            _fwd.x * input.moveZ + _right.x * input.moveX,
            0,
            _fwd.z * input.moveZ + _right.z * input.moveX
        );

        const wishLen = Math.hypot(_wish.x, _wish.z);
        if (wishLen > 0.001) {
            _wish.x = (_wish.x / wishLen) * maxSpeed;
            _wish.z = (_wish.z / wishLen) * maxSpeed;

            const a = WALK_ACCEL * h;
            this.velocity.x += Scalar.Clamp(_wish.x - this.velocity.x, -a, a);
            this.velocity.z += Scalar.Clamp(_wish.z - this.velocity.z, -a, a);

            // Face the direction of travel, eased.
            const want = Math.atan2(_wish.x, _wish.z);
            this.facing = angleDamp(this.facing, want, 11, h);
        } else {
            const d = WALK_DECEL * h;
            const s = Math.hypot(this.velocity.x, this.velocity.z);
            if (s > 0.0001) {
                const k = Math.max(0, s - d) / s;
                this.velocity.x *= k;
                this.velocity.z *= k;
            }
        }
    }

    _surfStep(h, rig) {
        // Steer from the mouse (camera yaw drift) plus explicit A/D — except
        // that under the trick modifier in the air, A/D mean tweak, and a
        // command that both steered and grabbed would fight itself.
        const steerX = (input.trickMod && !this.grounded) ? 0 : input.moveX;
        const steer = Scalar.Clamp(
            steerX * 0.85 + angleDelta(this.facing, rig.yaw) * 1.25,
            -1,
            1
        );
        this.facing += steer * SURF_TURN * h;

        // Camera shake, and only from the one thing that earns it: an edge
        // loaded up at speed. Added as a rate rather than as an impulse, so it
        // reaches an equilibrium against the rig's own decay — hard carve at top
        // speed settles around 0.4 trauma, which is a couple of centimetres of
        // rig movement. Anything you can consciously see here is too much.
        const load = Math.abs(steer) * (this.speed / SURF_MAX);
        if (load > 0.25) rig.addTrauma((load - 0.25) * 1.35 * h);

        const fx = Math.sin(this.facing);
        const fz = Math.cos(this.facing);

        // Slope: heading downhill adds speed, uphill scrubs it.
        this.terrain.normalAt(this.position.x, this.position.z, _n);
        // The horizontal normal points downhill. Project it onto the rider's
        // forward direction: downhill adds thrust, uphill removes it.
        const slopeAssist = (_n.x * fx + _n.z * fz) * 26;

        // A steep uphill can slow the ride, but must never turn engine assist
        // into reverse thrust. Pulling back remains the explicit brake/reverse
        // intent; terrain alone always leaves enough drive to crest a roll.
        let thrust = Math.max(3.2, SURF_THRUST + slopeAssist);
        // Under the trick modifier in the air, S means backflip, not brake.
        if (input.moveZ < 0 && !(input.trickMod && !this.grounded)) {
            thrust -= 14; // pull back to scrub speed
        }

        // The engine, along the same heading as everything else.
        const boost = Math.max(0, Math.min(1, this.boost));
        const boostAccel = boost * BOOST_THRUST
            * (this.grounded ? 1 : BOOST_AIR_SCALE);
        thrust += boostAccel;
        this.boostDelivered = boostAccel;

        this.velocity.x += fx * thrust * h;
        this.velocity.z += fz * thrust * h;

        // Lateral grip: kill sideways velocity, but not entirely — the residual
        // is what reads as a drift when you overcook the turn.
        const rx = Math.cos(this.facing);
        const rz = -Math.sin(this.facing);
        const lat = this.velocity.x * rx + this.velocity.z * rz;
        // Ice steals most of the edge. Grounded only — the air owes nothing
        // to the surface it is above.
        const gripScale = this.grounded
            ? 1 - 0.72 * this.surfaceHardness
            : 1;
        const grip = Math.min(1, SURF_GRIP * gripScale * h);
        this.velocity.x -= rx * lat * grip;
        this.velocity.z -= rz * lat * grip;

        // Quadratic drag → a natural terminal speed.
        const s = Math.hypot(this.velocity.x, this.velocity.z);
        if (s > 0.0001) {
            // Ice is also faster: less of the base bites, so less drags.
            const dragScale = this.grounded
                ? 1 - 0.22 * this.surfaceHardness
                : 1;
            let drag = (SURF_DRAG * s * s * 0.02 + 0.9) * dragScale;
            // Above the unboosted top speed, drag grows fast enough to settle
            // the rider rather than let the clamp below catch them. This is
            // what makes a boosted terminal feel like an engine running out of
            // authority instead of a number hitting a wall.
            if (s > SURF_MAX) {
                const over = s - SURF_MAX;
                drag += over * over * BOOST_OVERSPEED_DRAG;
            }
            const k = Math.max(0, s - drag * h) / s;
            this.velocity.x *= k;
            this.velocity.z *= k;
        }
        // Two ceilings, because there are two situations. Without thrust the
        // original hard limit stands exactly as it did; with it, the backstop
        // sits above where drag settles and should never be reached.
        const ceiling = boost > 0 ? BOOST_SPEED_CEILING : SURF_MAX;
        if (s > ceiling) {
            const k = ceiling / s;
            this.velocity.x *= k;
            this.velocity.z *= k;
        }
    }

    // ------------------------------------------------------------------ tricks

    /** A fresh air: nothing rotated yet, nothing held. */
    _beginAir() {
        this.trickSpin = 0;
        this.trickFlip = 0;
        this._spinRate = 0;
        this._flipRate = 0;
        this.grabDir = null;
        this.didTrick = false;
    }

    /**
     * Integrate trick rotation from held input, and unwind it on the ground.
     *
     * While the modifier is held airborne, W/S mean flip and A/D mean tweak —
     * the same axes that steer on the snow. The steering half of that
     * double-booking is resolved in `_surfStep`, which ignores moveX under
     * the modifier in the air; here the inputs only ever add rotation.
     */
    _updateTricks(h) {
        if (this.crashed) {
            // The tumble: keep rolling. Nobody steers a crash.
            this.trickDFlip = 8.5 * h;
            this.trickFlip += this.trickDFlip;
            this.trickDSpin = 1.7 * h;
            this.trickSpin += this.trickDSpin;
            return;
        }
        if (!this.grounded && !this.grinding) {
            const spinWant = input.spin * TRICK_SPIN_RATE;
            const flipWant = (input.trickMod ? input.moveZ : 0) * TRICK_FLIP_RATE;
            this._spinRate = expDamp(this._spinRate, spinWant, TRICK_RAMP, h);
            this._flipRate = expDamp(this._flipRate, flipWant, TRICK_RAMP, h);
            this.trickDSpin = this._spinRate * h;
            this.trickDFlip = this._flipRate * h;
            this.trickSpin += this.trickDSpin;
            this.trickFlip += this.trickDFlip;
            this.grabDir = input.trickMod
                ? (input.moveX < -0.4 ? "left" : input.moveX > 0.4 ? "right" : null)
                : null;
            if (Math.abs(this.trickSpin) + Math.abs(this.trickFlip) > 0.5 ||
                this.grabDir) {
                this.didTrick = true;
            }
            return;
        }
        // Grounded (or on a rail): whatever rotation remains blends away.
        // Toward the nearest half-turn rather than toward zero — a 180 lands
        // travelling switch, and unwinding it the long way would pirouette
        // the rider on the snow.
        this._spinRate = 0;
        this._flipRate = 0;
        this.grabDir = null;
        const spinHome = Math.round(this.trickSpin / Math.PI) * Math.PI;
        const flipHome = Math.round(this.trickFlip / (Math.PI * 2)) * Math.PI * 2;
        this.trickSpin = expDamp(this.trickSpin, spinHome, 14, h);
        this.trickFlip = expDamp(this.trickFlip, flipHome, 14, h);
        if (Math.abs(this.trickSpin - spinHome) < 0.01) this.trickSpin = spinHome;
        if (Math.abs(this.trickFlip - flipHome) < 0.01) this.trickFlip = flipHome;
        // Once settled, fold whole turns away so the numbers cannot grow all run.
        if (this.trickSpin === spinHome) this.trickSpin = 0;
        if (this.trickFlip === flipHome) this.trickFlip = 0;
    }

    /**
     * Judge the touchdown. The residual rotation — how far from a clean
     * multiple the spin and flip were at contact — and the impact decide it;
     * the consequences touch speed here and everything else downstream.
     */
    _gradeLanding(airTime) {
        const spinRes = residual(this.trickSpin, Math.PI);
        const flipRes = residual(this.trickFlip, Math.PI * 2);
        const impact = this.landingImpact;

        let grade;
        if (flipRes > GRADE_CRASH_FLIP || spinRes > GRADE_CRASH_SPIN) {
            grade = "crash";
        } else if (flipRes > GRADE_SKETCHY_FLIP || spinRes > GRADE_SKETCHY_SPIN ||
                   impact > GRADE_SKETCHY_IMPACT) {
            grade = "sketchy";
        } else if (spinRes < GRADE_PERFECT_RESIDUAL &&
                   flipRes < GRADE_PERFECT_RESIDUAL &&
                   impact < GRADE_PERFECT_IMPACT &&
                   (this.didTrick || airTime > 0.45)) {
            grade = "perfect";
        } else {
            grade = "clean";
        }
        this.landingGrade = grade;

        if (grade === "perfect") {
            this.velocity.x *= PERFECT_SPEED_REWARD;
            this.velocity.z *= PERFECT_SPEED_REWARD;
        } else if (grade === "sketchy") {
            this.velocity.x *= SKETCHY_SPEED_SCRUB;
            this.velocity.z *= SKETCHY_SPEED_SCRUB;
        } else if (grade === "crash") {
            this._startCrash();
        }
    }

    // ------------------------------------------------------------------- crash

    /** The world can crash the rider — an avalanche catch, a scripted
     *  hazard. Same tumble, same recovery, same accounting. */
    forceCrash() {
        this._startCrash();
    }

    _startCrash() {
        if (this.crashed) return;
        this.crashed = true;
        this.crashTimer = CRASH_TUMBLE_TIME;
        this.crashCount++;
        this.velocity.x *= CRASH_SPEED_KEEP;
        this.velocity.z *= CRASH_SPEED_KEEP;
    }

    /**
     * The tumble. No steering, heavy friction, and when it is spent the game
     * layer is asked to stand the rider back up at the last safe spot —
     * asked, because where "safe" is belongs to the course, not to physics.
     */
    _crashStep(h) {
        const k = Math.exp(-CRASH_FRICTION * h);
        this.velocity.x *= k;
        this.velocity.z *= k;
        this.crashTimer -= h;
        if (this.crashTimer <= 0 && this.grounded) {
            this.needsRecovery = true;
        }
    }

    /**
     * Stand back up. The game layer calls this with the recovery spot it
     * chose; physics just plants the rider there, stationary and clean.
     */
    finishCrash(x, y, z, facing) {
        this.crashed = false;
        this.crashTimer = 0;
        this.needsRecovery = false;
        this.position.set(x, y, z);
        this.velocity.setAll(0);
        this.verticalVelocity = 0;
        this.facing = facing;
        this.grounded = true;
        this.airborne = false;
        this.airTime = 0;
        this.trickSpin = 0;
        this.trickFlip = 0;
        this._spinRate = 0;
        this._flipRate = 0;
    }

    // ------------------------------------------------------------------- rails

    /** Kinds filter reused by the catch query. */
    static _RAIL_KINDS = ["rail"];

    /**
     * Catch a rail if this falling frame passes close enough, aligned enough,
     * fast enough. The gate is deliberately strict on angle — attaching from
     * a perpendicular approach reads as magnetism, not as landing a grind.
     */
    _tryCatchRail() {
        const near = this.world.nearest(
            this.position.x, this.position.y, this.position.z,
            RAIL_CATCH_RADIUS, CharacterController._RAIL_KINDS
        );
        if (!near) return;
        const s = near.collider.data;
        if (!s) return;

        const dx = s.bx - s.ax;
        const dy = s.by - s.ay;
        const dz = s.bz - s.az;
        const len = Math.hypot(dx, dy, dz);
        if (len < 1) return;

        // Closest param along the segment, then the true gates.
        const px = this.position.x - s.ax;
        const pz = this.position.z - s.az;
        let t = (px * dx + pz * dz) / (dx * dx + dz * dz);
        t = Math.max(0.02, Math.min(0.98, t));
        const railY = s.ay + dy * t;
        // The board must arrive from above, close to the beam's top.
        if (this.position.y < railY - 0.15 || this.position.y > railY + 0.9) return;

        const speed = Math.hypot(this.velocity.x, this.velocity.z);
        if (speed < RAIL_MIN_SPEED) return;

        const railHeading = Math.atan2(dx, dz);
        const velHeading = Math.atan2(this.velocity.x, this.velocity.z);
        const along = angleDelta(velHeading, railHeading);
        let dir = 1;
        let misalign = Math.abs(along);
        if (misalign > Math.PI / 2) {
            dir = -1;
            misalign = Math.PI - misalign;
        }
        if (misalign > RAIL_CATCH_ANGLE) return;

        this.grinding = true;
        this.grindStarted = true;
        this._rail = s;
        this._railLen = len;
        this._railT = t;
        this._railDir = dir;
        this.airborne = false;
        this.verticalVelocity = 0;
        this.airTime = 0;
    }

    /**
     * Ride the rail. Position is the segment evaluated at the param; speed
     * bleeds gently; Space pops off; the far end simply runs out. Both exits
     * are clean — falling off sideways is not modelled, because a balance
     * minigame on a 44 m beam is a course's worth of design this rail does
     * not carry. The brief asked for limited balance influence; the limit
     * chosen is zero.
     */
    _grindStep(h) {
        const s = this._rail;
        const dx = s.bx - s.ax;
        const dy = s.by - s.ay;
        const dz = s.bz - s.az;

        let speed = Math.hypot(this.velocity.x, this.velocity.z);
        speed = Math.max(RAIL_MIN_SPEED * 0.7, speed - RAIL_DRAG * h);
        this._railT += (this._railDir * speed * h) / this._railLen;

        const off = this._railT <= 0 || this._railT >= 1;
        const pop = input.jumpPressed;
        if (off || pop) {
            this.grinding = false;
            this.grindEnded = { clean: true };
            this._rail = null;
            this._railCool = 0.6;
            this.grounded = false;
            this.airborne = true;
            this.verticalVelocity = pop ? RAIL_POP_SPEED : 0.6;
            if (pop) {
                this.jumpCount++;
                this._jumpBuffer = 0;
                this._coyote = 0;
                this._beginAir();
            }
            return;
        }

        const t = this._railT;
        this.position.set(s.ax + dx * t, s.ay + dy * t + 0.02, s.az + dz * t);
        const inv = this._railDir / this._railLen;
        this.velocity.x = dx * inv * speed;
        this.velocity.z = dz * inv * speed;
        const heading = Math.atan2(dx * this._railDir, dz * this._railDir);
        this.facing = angleDamp(this.facing, heading, 14, h);
        this.grounded = false;
        this.airborne = false;
        this.groundY = this.terrain.heightAt(this.position.x, this.position.z);
    }

    // --------------------------------------------------------------- obstacles

    /**
     * Something solid interrupted the sweep.
     *
     * Three answers by material and angle: soft things cost a little speed
     * and a puff; a glancing hit slides along the surface and scrapes; a
     * frontal hit at speed is a crash. The position is pulled back to the
     * contact so the next frame starts outside the collider.
     */
    _resolveObstacle(hit, oldX, oldZ, h) {
        const data = hit.collider.data;
        if (data && data.soft) {
            this.velocity.x *= 0.94;
            this.velocity.z *= 0.94;
            this.brushedSoft = true;
            return;
        }

        const speed = Math.hypot(this.velocity.x, this.velocity.z);
        const frontal = speed > 0.001
            ? -(this.velocity.x * hit.nx + this.velocity.z * hit.nz) / speed
            : 0;

        if (frontal > CRASH_FRONTAL_DOT && speed > CRASH_MIN_SPEED) {
            // Stop at the contact, then tumble.
            this.position.x = oldX + (this.position.x - oldX) * hit.t;
            this.position.z = oldZ + (this.position.z - oldZ) * hit.t;
            this._startCrash();
            return;
        }

        // Glancing: keep the tangential component, lose the rest, and step
        // out along the normal so the sweep cannot re-catch the same face.
        const vn = this.velocity.x * hit.nx + this.velocity.z * hit.nz;
        if (vn < 0) {
            this.velocity.x -= hit.nx * vn;
            this.velocity.z -= hit.nz * vn;
        }
        this.velocity.x *= 0.92;
        this.velocity.z *= 0.92;
        this.position.x = oldX + (this.position.x - oldX) * hit.t + hit.nx * 0.06;
        this.position.z = oldZ + (this.position.z - oldZ) * hit.t + hit.nz * 0.06;
        this.position.x += this.velocity.x * (1 - hit.t) * h;
        this.position.z += this.velocity.z * (1 - hit.t) * h;
        this.scraped = true;
    }

    /**
     * Distance-driven gait. Phase advances with ground travelled, not with time,
     * which is what keeps feet planted instead of sliding.
     */
    _gait(h) {
        this.footfall = false;

        // Feet stay on the board while surfing — and for the run-out afterwards.
        //
        // The surf blend eases to zero in a fifth of a second, but the momentum
        // takes two thirds of one to bleed off, and in between the character is
        // travelling at nineteen metres a second. The gait is distance-driven, so
        // it answered that with a twelve-hertz cadence and the legs blurred. A
        // sprint is the fastest thing anyone walks at; above it, glide.
        this.stepping = this.grounded && this.surf <= 0.5 && this.speed <= RUN_SPEED * 1.2;
        if (!this.stepping) {
            this.gaitPhase = 0;
            return;
        }

        const dist = this.speed * h;
        const stride = STRIDE_BASE * (0.72 + 0.28 * Math.min(1, this.speed / RUN_SPEED));
        const prev = this.gaitPhase;
        this.gaitPhase = (this.gaitPhase + dist / stride) % 1;

        if (this.speed < 0.15) return;

        // Two plants per cycle, at phase 0.0 and 0.5.
        const crossed =
            (prev < 0.5 && this.gaitPhase >= 0.5) || this.gaitPhase < prev;
        if (!crossed) return;

        this.footfall = true;
        this.footIndex = this.gaitPhase < 0.5 ? 0 : 1;
        this.footImpact = Scalar.Clamp(0.35 + this.speed / RUN_SPEED, 0, 1.3);

        // Offset the plant to the correct side of the body.
        const side = this.footIndex === 0 ? -0.17 : 0.17;
        const rx = Math.cos(this.facing);
        const rz = -Math.sin(this.facing);
        this.footPos.set(
            this.position.x + rx * side,
            this.position.y,
            this.position.z + rz * side
        );
    }
}

// ------------------------------------------------------------------ helpers

/** Distance from `angle` to its nearest multiple of `step`, in radians. */
function residual(angle, step) {
    const r = Math.abs(angle % step);
    return Math.min(r, step - r);
}

/** Shortest signed delta from a to b, wrapped to [-PI, PI]. */
export function angleDelta(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}

/** Framerate-independent easing across the shortest arc. */
export function angleDamp(cur, target, rate, dt) {
    return cur + angleDelta(cur, target) * (1 - Math.exp(-rate * dt));
}
