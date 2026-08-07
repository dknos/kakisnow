/**
 * Trick accounting — recognition, worth, and the combo, as pure arithmetic.
 *
 * The physics layer owns the truth about the rider. The orchestrator watches
 * the controller, detects takeoff, integrates attitude, and feeds this module;
 * nothing here touches a scene, a clock or a random source. Everything a
 * tracker answers is a function of exactly what it was fed, so a run's score
 * is replayable to the digit and every rule is provable under plain Node —
 * this file imports nothing.
 *
 * ---------------------------------------------------------- the conventions
 *
 * Rotation arrives world-relative, in radians, signed, per frame:
 * `addRotation(dYaw, dPitch, dt)`. dt rides on the same call rather than on a
 * separate `addTime` because the orchestrator has exactly one per-frame touch
 * point while airborne, and two methods that must agree about the same frame
 * is a drift waiting to happen. Air time and grab-hold time both accrue from
 * this dt.
 *
 * Pitch sign: NEGATIVE is nose-down. A net-negative flip is a Frontflip, a
 * net-positive one a Backflip. The orchestrator's integration must match.
 *
 * Spin and flip magnitude is the NET accumulated rotation — |sum of the
 * signed deltas| — not the travel. A rider wobbling half a turn each way has
 * spun nothing, and counting travel would score the wobble.
 *
 * ------------------------------------------------------------- the scoring
 *
 * A trick's score is `round(base * multiplier * decay)`:
 *
 *   base        spin steps x 80, plus flips x 260, plus 60 if grabbed
 *   multiplier  1.15^(spinSteps-1) x 1.2(grab) x 1.25(kicker) x landing
 *   decay       0.6^(prior uses of this NAME this run), floored at 0.15
 *
 * The result object carries all three apart because the HUD toast shows them
 * apart. The rotation multiplier compounds over the whole base — the schema
 * has one multiplier scalar, and a 540 makes the flip beside it worth more.
 *
 * --------------------------------------------------------------- the combo
 *
 * Scored tricks (grade perfect/clean/sketchy) join the open combo; its
 * multiplier is 1 + 0.25 per trick past the first, capped at 2.5, and applies
 * to the SUM when the combo banks — via `bank()` (the orchestrator's settle
 * timer) or automatically when a grind exits clean. A crash landing or
 * `loseCombo()` zeroes the open portion and keeps what was banked. A crashed
 * trick scores zero, joins nothing, and does not count as a use for decay —
 * the rider already paid for it. Plain airtime (nothing recognized, or air
 * under 0.35 s) returns null from `land()` and leaves the combo alone: not a
 * trick, not a failure — unless the grade was "crash", which always drops the
 * combo, because a crash is a crash whatever the air held.
 */

// ------------------------------------------------------------------ constants

/** Points per named 180° of spin. */
const SPIN_STEP_POINTS = 80;
/** Compounding rotation multiplier per 180 step past the first. */
const SPIN_STEP_MULT = 1.15;
/** Degrees forgiven under each 180 step: 150° already names a "180". */
const SPIN_FORGIVENESS_DEG = 30;
/** Points per flip. */
const FLIP_POINTS = 260;
/** Degrees forgiven under each full 360 of pitch: one flip at 300°, two at 660°. */
const FLIP_FORGIVENESS_DEG = 60;
const FLIP_STEP_DEG = 360;
/** Grab: flat points added to the base, and the multiplier on the trick it decorates. */
const GRAB_POINTS = 60;
const GRAB_MULT = 1.2;
/** Cumulative hold, seconds, under which a grab is a twitch and not a trick. */
const GRAB_MIN_HOLD = 0.25;
/** Taking off from a kicker is worth a quarter more. */
const KICKER_MULT = 1.25;
/** An air shorter than this scores nothing, whatever happened during it. */
const MIN_AIR_TIME = 0.35;
/** Landing multipliers. Crash zeroes the trick and drops the open combo. */
const LANDING_MULT = { perfect: 1.5, clean: 1.0, sketchy: 0.55, crash: 0 };
/** Repetition: each prior scored use of the same NAME this run multiplies by 0.6. */
const DECAY_RATE = 0.6;
const DECAY_FLOOR = 0.15;
/** Grind: points per second on the rail, and the clean-exit bonus. */
const GRIND_RATE = 40;
const GRIND_CLEAN_MULT = 1.3;
const GRIND_NAME = "Grind";
/** Combo: 1 + 0.25 per trick past the first, capped. */
const COMBO_STEP = 0.25;
const COMBO_CAP = 2.5;
/** The HUD log keeps the newest entries; the oldest fall off past this. */
const LOG_CAP = 64;

/** Absorbs float dust at the naming boundaries (rad→deg round trips, dt sums). */
const EPS = 1e-6;

const RAD_TO_DEG = 180 / Math.PI;

// -------------------------------------------------------------- recognition

/** Nearest lower 180 step with 30° forgiveness: 150° names "180", 330° "360". */
function spinSteps(deg) {
    return Math.max(Math.floor((deg + SPIN_FORGIVENESS_DEG + EPS) / 180), 0);
}

/** Full 360s of pitch with 60° forgiveness: 300° is one flip, 660° two. */
function flipCount(deg) {
    return Math.max(Math.floor((deg + FLIP_FORGIVENESS_DEG + EPS) / FLIP_STEP_DEG), 0);
}

/** The longer-held qualifying grab, or null. A tie goes left, deterministically. */
function qualifiedGrab(grabTime) {
    const l = grabTime.left >= GRAB_MIN_HOLD - EPS ? grabTime.left : 0;
    const r = grabTime.right >= GRAB_MIN_HOLD - EPS ? grabTime.right : 0;
    if (l === 0 && r === 0) return null;
    return l >= r ? "left" : "right";
}

/** "540", "Backflip", "Frontflip 540", "360 + Left Tweak", "Right Tweak". */
function trickName(steps, flips, netPitch, grab) {
    let core = "";
    if (flips > 0) {
        const dir = netPitch < 0 ? "Frontflip" : "Backflip";
        const prefix =
            flips === 2 ? "Double " :
            flips === 3 ? "Triple " :
            flips > 3 ? `${flips}x ` : "";
        core = prefix + dir;
        if (steps > 0) core += ` ${steps * 180}`;
    } else if (steps > 0) {
        core = String(steps * 180);
    }
    if (grab) {
        const tweak = grab === "left" ? "Left Tweak" : "Right Tweak";
        core = core ? `${core} + ${tweak}` : tweak;
    }
    return core;
}

// ------------------------------------------------------------------ tracker

/**
 * One per run. `reset()` between runs; all state is explicit and cleared.
 */
export class TrickTracker {
    constructor() {
        this.reset();
    }

    reset() {
        /** Banked points — the run total the results screen reads. */
        this.total = 0;
        /** Scored tricks this run. Crashed attempts are not scored. */
        this.trickCount = 0;
        /** @type {{name:string, score:number}|null} the highest single trick. */
        this.best = null;
        /** @type {{name:string, score:number, grade:string}[]} newest-last, capped. */
        this.log = [];

        /** @type {Record<string, number>} prior scored uses per trick name. */
        this._uses = Object.create(null);

        this._comboScore = 0;
        this._comboCount = 0;

        /** @type {null|object} the air in flight, or null on the ground. */
        this._air = null;
        this._railTime = 0;
    }

    /** {score, count, multiplier} while a combo is open, else null. */
    get open() {
        if (this._comboCount === 0) return null;
        return {
            score: this._comboScore,
            count: this._comboCount,
            multiplier: this._comboMultiplier(),
        };
    }

    // -------------------------------------------------------------------- air

    /**
     * Takeoff. An air already open is discarded — the orchestrator is the
     * authority on when the rider left the ground, and a stale air means a
     * land() was missed, not that two airs happened at once.
     */
    beginAir({ onKicker = false } = {}) {
        this._air = {
            onKicker,
            yaw: 0,
            pitch: 0,
            airTime: 0,
            grab: null,
            grabTime: { left: 0, right: 0 },
        };
    }

    /**
     * Per-frame while airborne: signed world-relative radians, and the frame's
     * dt. Ignored on the ground — the orchestrator drives the lifecycle.
     */
    addRotation(dYaw, dPitch, dt = 0) {
        const a = this._air;
        if (!a) return;
        a.yaw += dYaw;
        a.pitch += dPitch;
        a.airTime += dt;
        if (a.grab) a.grabTime[a.grab] += dt;
    }

    /** @param {"left"|"right"|null} dir the grab held right now, or null. */
    setGrab(dir) {
        if (!this._air) return;
        this._air.grab = dir === "left" || dir === "right" ? dir : null;
    }

    /**
     * Touchdown. Closes the air and returns the trick result, or null if
     * nothing scored. Null does not break the combo — unless the grade was
     * "crash", which always does.
     *
     * @param {"perfect"|"clean"|"sketchy"|"crash"} grade
     */
    land(grade) {
        const landMult = LANDING_MULT[grade];
        if (landMult === undefined) throw new Error(`unknown landing grade "${grade}"`);

        const a = this._air;
        this._air = null;
        if (grade === "crash") this._dropCombo();
        if (!a) return null;

        const steps = spinSteps(Math.abs(a.yaw) * RAD_TO_DEG);
        const flips = flipCount(Math.abs(a.pitch) * RAD_TO_DEG);
        const grab = qualifiedGrab(a.grabTime);
        if ((steps === 0 && flips === 0 && !grab) || a.airTime < MIN_AIR_TIME) {
            return null; // plain airtime: not a trick, not a failure
        }

        const base =
            steps * SPIN_STEP_POINTS +
            flips * FLIP_POINTS +
            (grab ? GRAB_POINTS : 0);
        let multiplier = Math.pow(SPIN_STEP_MULT, Math.max(steps - 1, 0));
        if (grab) multiplier *= GRAB_MULT;
        if (a.onKicker) multiplier *= KICKER_MULT;
        multiplier *= landMult;

        return this._settle({
            name: trickName(steps, flips, a.pitch, grab),
            base,
            rotationSteps: steps,
            flips,
            grab,
            grade,
            multiplier,
        });
    }

    // ------------------------------------------------------------------ rails

    /** Per-frame while grinding. */
    addRailTime(dt) {
        this._railTime += dt;
    }

    /**
     * Off the rail. `clean` means the rider chose the exit — jumped off or
     * rode off the end — and earns the bonus AND banks the combo, grind
     * included: a clean rail exit is a settled landing. An unclean exit still
     * scores the time held (grade "sketchy") and leaves the combo open; if the
     * rider actually went down, that is the orchestrator's `loseCombo()`.
     *
     * @returns {object|null} a grind trick result, or null if no time was held.
     */
    endRail(clean) {
        const held = this._railTime;
        this._railTime = 0;
        if (held <= 0) return null;

        const result = this._settle({
            name: GRIND_NAME,
            base: GRIND_RATE * held,
            rotationSteps: 0,
            flips: 0,
            grab: null,
            grade: clean ? "clean" : "sketchy",
            multiplier: clean ? GRIND_CLEAN_MULT : 1,
        });
        if (clean) this.bank();
        return result;
    }

    // ------------------------------------------------------------------ combo

    /**
     * Move the open combo to the run total — the orchestrator calls this when
     * a landing has settled. @returns {number} the points banked.
     */
    bank() {
        if (this._comboCount === 0) return 0;
        const banked = Math.round(this._comboScore * this._comboMultiplier());
        this.total += banked;
        this._comboScore = 0;
        this._comboCount = 0;
        return banked;
    }

    /**
     * The open combo is gone — bailed, out of bounds, recovered by hand.
     * Banked points are kept. `reason` is accepted for the caller's own
     * logging; nothing here needs it. @returns {number} the points lost.
     */
    loseCombo(reason = "") {
        void reason;
        return this._dropCombo();
    }

    // -------------------------------------------------------------- internals

    _comboMultiplier() {
        return Math.min(1 + COMBO_STEP * (this._comboCount - 1), COMBO_CAP);
    }

    _dropCombo() {
        const lost = this._comboScore;
        this._comboScore = 0;
        this._comboCount = 0;
        return lost;
    }

    /**
     * Every recognized trick funnels through here: decay, the score, the
     * combo, the books. `parts.multiplier` is everything except decay —
     * rotation compounding, grab, kicker, landing — kept apart in the result
     * because the HUD shows them apart.
     */
    _settle(parts) {
        const prior = this._uses[parts.name] ?? 0;
        const decay = Math.max(Math.pow(DECAY_RATE, prior), DECAY_FLOOR);
        const score = Math.round(parts.base * parts.multiplier * decay);

        const crashed = parts.grade === "crash";
        let comboCount = 0;
        let comboMultiplier = 1;
        if (!crashed) {
            this._uses[parts.name] = prior + 1;
            this._comboScore += score;
            this._comboCount += 1;
            comboCount = this._comboCount;
            comboMultiplier = this._comboMultiplier();
            this.trickCount += 1;
            if (!this.best || score > this.best.score) {
                this.best = { name: parts.name, score };
            }
        }

        this.log.push({ name: parts.name, score, grade: parts.grade });
        if (this.log.length > LOG_CAP) this.log.shift();

        // Everything the HUD toast needs, no lookups. base and the scalars are
        // tidied for display; `score` is the exact number the combo carries.
        return {
            name: parts.name,
            base: +parts.base.toFixed(2),
            rotationSteps: parts.rotationSteps,
            flips: parts.flips,
            grab: parts.grab,
            grade: parts.grade,
            multiplier: +parts.multiplier.toFixed(4),
            decay: +decay.toFixed(4),
            score,
            comboCount,
            comboMultiplier,
        };
    }
}
