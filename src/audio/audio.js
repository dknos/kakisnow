/**
 * Snow-Burgers audio — synthesised, not sourced.
 *
 * Every sound here is built from oscillators and filtered noise at runtime.
 * That is a licensing decision before it is an aesthetic one: this repository
 * already carries one unresolved provenance caveat on RockerKaki and seven more
 * on the supplied game assets, and adding a folder of sound files with the same
 * problem would make it worse. Nothing in this file has to be attributed,
 * cleared, or shipped.
 *
 * It is also the cheaper answer. The whole subsystem is a few kilobytes of
 * code, there is nothing to download, nothing to decode, and no first-play
 * hitch — which matters for the same reason the render pipelines are warmed
 * behind the loading screen.
 *
 * ------------------------------------------------------------------ the gate
 *
 * A browser will not start an `AudioContext` without a gesture, and this game
 * opens on a menu the player has to click. So the context is created suspended
 * and resumed on the first pointer or key event, once, and everything before
 * that point is silently discarded rather than queued — a countdown that plays
 * three beeps the instant audio unlocks is worse than one that missed them.
 *
 * ------------------------------------------------------------------- the mix
 *
 * master → limiter → destination, with four category buses — music, sfx,
 * ambience, ui — hanging off master. The buses exist so the orchestrator can
 * wire the settings screen to them; nothing in this file persists a bus
 * volume, and `setBusVolume` before `init()` just remembers the value for the
 * graph to be born with. Ducking stays on master rather than on any bus so a
 * pause recedes the whole world in one move — UI clicks are quiet and short
 * enough to stay legible inside the duck (see DUCK), which is why they are
 * ducked *with* everything rather than routed around it.
 *
 * The continuous sounds — the rocket, the board bed (powder glide, edge
 * carve, ice hiss, wind) and the grind loop — are each built once at init and
 * driven by gain moves thereafter, all idling at zero so construction is
 * silent. The board layers live on the ambience bus because they are the
 * mountain: turning ambience down should quiet the world under the player
 * without touching the jumps, landings and grinds that are feedback, which
 * ride sfx with the rocket. The rocket-must-not-mask-the-board problem the
 * brief raised is answered by conservative per-layer levels under one shared
 * limiter, not by side-chaining — nothing here is loud enough to need it.
 *
 * Allocation per frame: none for any continuous layer — `updateRocket`,
 * `updateBoard` and `grindUpdate` only move AudioParams on held nodes.
 * One-shots allocate their own short-lived nodes, which is what the Web Audio
 * API is for and is bounded by how often a player can hit something.
 */

import { INGREDIENTS } from "../game/ingredients.js";

/** Master level. Deliberately conservative: this plays over a browser tab. */
const MASTER = 0.42;

/** How far the mix drops while the game is paused. Ducked, not silenced: the
 *  pause menu's own clicks still ride the same master, and a world that goes
 *  dead quiet reads as a mute bug rather than as a held breath. */
const DUCK = 0.16;

/** The category buses, in one place so a typo'd bus name fails loudly in
 *  review rather than silently routing to nothing. */
const BUS_NAMES = ["music", "sfx", "ambience", "ui"];

/** @param {number} v @returns {number} v clamped to 0..1 */
function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}

export class GameAudio {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx = null;
        this.enabled = true;
        this.unlocked = false;
        this._rocket = null;
        this._board = null;
        this._grind = null;
        this._noiseBuffer = null;
        /** Player volume 0..1, multiplied under the conservative MASTER. */
        this.volume = 1;
        this._ducked = false;
        /** Bus volumes remembered here so `setBusVolume` works before
         *  `init()` — the orchestrator hydrates settings before the first
         *  gesture, and losing those writes would mean every session starts
         *  at full bus volume until the settings screen is opened. */
        this._busVolumes = { music: 1, sfx: 1, ambience: 1, ui: 1 };
        /** @type {Record<string, GainNode>|null} */
        this.buses = null;
    }

    /**
     * Build the graph, suspended, and arm the unlock.
     *
     * Safe to call before any gesture. Safe to call twice.
     */
    init() {
        if (this.ctx) return;
        const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Ctor) return;
        try {
            this.ctx = new Ctor({ latencyHint: "interactive" });
        } catch (err) {
            console.warn("[snow-burgers] audio unavailable:", err);
            return;
        }

        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? MASTER * this.volume : 0;
        // A limiter rather than a compressor in spirit: the rocket and a pickup
        // landing on the same frame should not clip, and the ratio is high
        // enough that it never audibly pumps.
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -8;
        this.limiter.knee.value = 6;
        this.limiter.ratio.value = 12;
        this.limiter.attack.value = 0.003;
        this.limiter.release.value = 0.18;
        this.master.connect(this.limiter).connect(this.ctx.destination);

        this.buses = {};
        for (const name of BUS_NAMES) {
            const bus = this.ctx.createGain();
            bus.gain.value = this._busVolumes[name];
            bus.connect(this.master);
            this.buses[name] = bus;
        }

        this._noiseBuffer = this._makeNoise();
        this._buildRocket();
        this._buildBoard();
        this._buildGrind();

        const unlock = () => {
            if (this.unlocked) return;
            this.unlocked = true;
            this.ctx.resume().catch(() => {});
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
        };
        window.addEventListener("pointerdown", unlock);
        window.addEventListener("keydown", unlock);
    }

    setEnabled(on) {
        this.enabled = !!on;
        this._applyGain();
    }

    /** @param {number} v 0..1 */
    setVolume(v) {
        this.volume = Math.max(0, Math.min(1, v));
        this._applyGain();
    }

    /**
     * Set one category bus level. Not persisted here — the orchestrator owns
     * settings; this file only owns the wire.
     *
     * @param {"music"|"sfx"|"ambience"|"ui"} bus
     * @param {number} v 0..1
     */
    setBusVolume(bus, v) {
        if (!(bus in this._busVolumes)) return;
        const level = clamp01(v);
        this._busVolumes[bus] = level;
        if (!this.buses) return;
        this.buses[bus].gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
    }

    /**
     * Duck the whole mix for a pause.
     *
     * The rocket loop, the board layers and the one-shots all hang off the
     * master, so one gain covers everything that should recede — while UI
     * clicks, which are quiet and short, remain audible inside the duck.
     */
    setDucked(on) {
        this._ducked = !!on;
        this._applyGain();
    }

    _applyGain() {
        if (!this.master) return;
        const level = this.enabled
            ? MASTER * this.volume * (this._ducked ? DUCK : 1)
            : 0;
        this.master.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
    }

    get ready() {
        return !!this.ctx && this.unlocked && this.enabled;
    }

    // ------------------------------------------------------------ the rocket

    /**
     * The engine, built once and held.
     *
     * Three layers, because one is a hiss and two is a hairdryer: a low
     * saw for the body that the throttle detunes, band-passed noise for the
     * roar, and a slow sub-octave rumble that only comes up near full thrust
     * so that opening the throttle has somewhere to go.
     */
    _buildRocket() {
        const ctx = this.ctx;
        const bus = ctx.createGain();
        bus.gain.value = 0;
        bus.connect(this.buses.sfx);

        const body = ctx.createOscillator();
        body.type = "sawtooth";
        body.frequency.value = 62;
        const bodyGain = ctx.createGain();
        bodyGain.gain.value = 0.18;

        const sub = ctx.createOscillator();
        sub.type = "sine";
        sub.frequency.value = 31;
        const subGain = ctx.createGain();
        subGain.gain.value = 0;

        const noise = ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;
        noise.loop = true;
        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = 700;
        band.Q.value = 0.7;
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0.5;

        // One shared low-pass across the lot: closing it as the throttle backs
        // off is what makes a shutdown sound like an engine spooling down
        // rather than a fader moving.
        const tone = ctx.createBiquadFilter();
        tone.type = "lowpass";
        tone.frequency.value = 400;
        tone.Q.value = 0.4;

        body.connect(bodyGain).connect(tone);
        sub.connect(subGain).connect(tone);
        noise.connect(band).connect(noiseGain).connect(tone);
        tone.connect(bus);

        body.start();
        sub.start();
        noise.start();

        this._rocket = { bus, body, sub, subGain, band, tone };
    }

    /**
     * @param {number} throttle 0..1
     * @param {number} speed01 0..1, for the wind the engine is fighting
     * @param {boolean} grounded
     */
    updateRocket(throttle, speed01 = 0, grounded = true) {
        if (!this.ready || !this._rocket) return;
        const r = this._rocket;
        const t = this.ctx.currentTime;
        const k = 0.06;
        // Airborne thrust is thinner: less of the engine couples back through
        // the board, and the brief asks for the two to read differently.
        const air = grounded ? 1 : 0.72;
        r.bus.gain.setTargetAtTime(Math.min(1, throttle) * 0.55 * air, t, k);
        r.body.frequency.setTargetAtTime(58 + throttle * 46 + speed01 * 14, t, k);
        r.sub.frequency.setTargetAtTime(29 + throttle * 22, t, k);
        r.subGain.gain.setTargetAtTime(Math.max(0, throttle - 0.55) * 0.5, t, k);
        r.band.frequency.setTargetAtTime(520 + throttle * 1500 + speed01 * 400, t, k);
        r.tone.frequency.setTargetAtTime(340 + throttle * 2600, t, k);
    }

    /** A short bright transient on top of the ramp, when the engine lights. */
    ignite() {
        if (!this.ready) return;
        this._noiseHit({ level: 0.5, attack: 0.004, decay: 0.28, from: 2600, to: 300, q: 1.1 });
        this._tone({ freq: 150, to: 70, type: "square", level: 0.14, decay: 0.22 });
    }

    shutdown() {
        if (!this.ready) return;
        this._noiseHit({ level: 0.22, attack: 0.01, decay: 0.45, from: 900, to: 120, q: 0.8 });
    }

    // ------------------------------------------------------------- the board

    /**
     * The bed the run rides on, built once and held like the rocket.
     *
     * Four filtered taps of the shared noise loop: a low-passed glide that is
     * the board on powder, a band-passed carve that is an edge loading up, a
     * brighter hiss that hard-packed snow and ice mix in, and a high-passed
     * wind that is the only voice left in the air. Each layer gets its own
     * source at a different fixed offset into the two-second loop — the
     * offsets decorrelate the layers so overlapping bands sum like four
     * sounds instead of one louder one, and they are constants rather than
     * Math.random so an audio bug still reproduces (see `_makeNoise`).
     *
     * Every gain starts at zero: building the bed at init is silent, and the
     * first `updateBoard` of a run fades it in through the same
     * setTargetAtTime path every later frame uses.
     */
    _buildBoard() {
        const ctx = this.ctx;
        const layer = (offset, setup) => {
            const src = ctx.createBufferSource();
            src.buffer = this._noiseBuffer;
            src.loop = true;
            const filter = ctx.createBiquadFilter();
            setup(filter);
            const gain = ctx.createGain();
            gain.gain.value = 0;
            src.connect(filter).connect(gain).connect(this.buses.ambience);
            src.start(0, offset);
            return { filter, gain };
        };

        this._board = {
            glide: layer(0.0, (f) => {
                f.type = "lowpass";
                f.frequency.value = 260;
                f.Q.value = 0.5;
            }),
            carve: layer(0.5, (f) => {
                f.type = "bandpass";
                f.frequency.value = 1200;
                f.Q.value = 2.5;
            }),
            ice: layer(1.0, (f) => {
                f.type = "bandpass";
                f.frequency.value = 4200;
                f.Q.value = 0.8;
            }),
            wind: layer(1.5, (f) => {
                f.type = "highpass";
                f.frequency.value = 330;
                f.Q.value = 0.3;
            }),
        };
    }

    /**
     * Per-frame board telemetry, gain moves only — the same discipline as
     * `updateRocket`, no allocation on this path.
     *
     * Grounded is what lets glide, carve and ice speak at all: in the air
     * only the wind is real, and cutting the contact layers there is what
     * makes leaving the snow *sound* like leaving the snow. They all duck
     * with master automatically on pause, so there is no pause handling here.
     *
     * @param {object} s
     * @param {number} s.speed01 0..1 ground speed
     * @param {number} s.carve signed edge load; only |carve| matters here
     * @param {boolean} s.grounded board is on the snow
     * @param {boolean} s.airborne board has left it (belt and braces with
     *     grounded — the controller exposes both and they can disagree for a
     *     frame at lips, so contact sound requires grounded AND not airborne)
     * @param {number} s.wind01 0..1, orchestrator-derived (higher when airborne)
     * @param {number} s.surfaceHardness 0 = powder, 1 = ice
     */
    updateBoard({ speed01 = 0, carve = 0, grounded = true, airborne = false, wind01 = 0, surfaceHardness = 0 } = {}) {
        if (!this.ready || !this._board) return;
        const b = this._board;
        const t = this.ctx.currentTime;
        const k = 0.08;
        const spd = clamp01(speed01);
        const edge = clamp01(Math.abs(carve));
        const hard = clamp01(surfaceHardness);
        const contact = grounded && !airborne ? 1 : 0;

        // Powder glide: louder and brighter with speed, gone in the air. The
        // ice mix pulls the powder back a little so a hard surface reads as a
        // change of voice, not as a second board.
        b.glide.gain.gain.setTargetAtTime(spd * contact * (1 - hard * 0.45) * 0.26, t, k);
        b.glide.filter.frequency.setTargetAtTime(260 + spd * 940, t, k);

        // Edge carve: 1.2–2.4 kHz sweep with edge load. Scaled by speed as
        // well as |carve| because a stationary board on edge makes no sound.
        b.carve.gain.gain.setTargetAtTime(edge * spd * contact * 0.22, t, k);
        b.carve.filter.frequency.setTargetAtTime(1200 + edge * 1200, t, k);

        // Ice hiss: the bright top that packed snow mixes in.
        b.ice.gain.gain.setTargetAtTime(spd * hard * contact * 0.16, t, k);

        // Wind: the orchestrator owns wind01 (speed-derived, up when
        // airborne), so this layer is deliberately dumb — gain only.
        b.wind.gain.gain.setTargetAtTime(clamp01(wind01) * 0.28, t, k);
    }

    // ------------------------------------------------------------- the grind

    /**
     * The rail voice, built once like the rocket.
     *
     * Metal is a resonance, so: two high-Q band-passes over the shared noise
     * loop, tuned apart (~900/1400 Hz) so they beat against each other
     * instead of reading as one whistle. High Q means little energy gets
     * through, which is why the loop gain ceiling looks high next to the
     * board layers — it is quieter than it reads.
     */
    _buildGrind() {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this._noiseBuffer;
        src.loop = true;

        const bandA = ctx.createBiquadFilter();
        bandA.type = "bandpass";
        bandA.frequency.value = 900;
        bandA.Q.value = 12;
        const trimA = ctx.createGain();
        trimA.gain.value = 1;

        const bandB = ctx.createBiquadFilter();
        bandB.type = "bandpass";
        bandB.frequency.value = 1400;
        bandB.Q.value = 12;
        const trimB = ctx.createGain();
        trimB.gain.value = 0.7;

        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(bandA).connect(trimA).connect(gain);
        src.connect(bandB).connect(trimB).connect(gain);
        gain.connect(this.buses.sfx);
        // Fixed offset for the same reason as the board layers: decorrelated
        // from them, deterministic for reproduction.
        src.start(0, 0.25);

        this._grind = { bandA, gain };
    }

    /** The moment the board meets the rail: one short metallic contact. The
     *  held tone is `grindUpdate`'s job, so this only plays the touch. */
    grindStart() {
        if (!this.ready) return;
        this._tone({ freq: 1400, to: 900, type: "square", level: 0.09, decay: 0.07 });
        this._noiseHit({ level: 0.12, attack: 0.003, decay: 0.09, from: 2600, to: 900, q: 3 });
    }

    /**
     * Per-frame grind intensity while on the rail, gain moves only.
     * @param {number} intensity01 0..1 — the orchestrator's notion of how
     *     loaded the grind is (speed, balance, whatever it decides)
     */
    grindUpdate(intensity01) {
        if (!this.ready || !this._grind) return;
        const g = this._grind;
        const t = this.ctx.currentTime;
        const k = 0.08;
        const i = clamp01(intensity01);
        g.gain.gain.setTargetAtTime(i * 0.4, t, k);
        // A small pitch lean with intensity keeps a long grind from being a
        // frozen chord without turning it into a siren.
        g.bandA.frequency.setTargetAtTime(900 + i * 70, t, k);
    }

    /** Leaving the rail: kill the loop fast (faster than the 0.08 build-up —
     *  a grind that lingers after dismount sounds broken) plus one quiet
     *  release tick so the ending has an edge. */
    grindEnd() {
        if (!this.ready || !this._grind) return;
        this._grind.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
        this._noiseHit({ level: 0.07, attack: 0.002, decay: 0.07, from: 1800, to: 700, q: 2 });
    }

    // ---------------------------------------------------------- the one-shots

    /**
     * Leaving the ground on purpose: a short soft whump whose pitch dips
     * deeper with pop strength, so a big ollie sounds heavier, not louder.
     * @param {number} strength 0..1
     */
    jump(strength = 0.5) {
        if (!this.ready) return;
        const s = clamp01(strength);
        this._tone({ freq: 150 + s * 40, to: 75 - s * 25, type: "sine", level: 0.11 + s * 0.06, decay: 0.16 });
        this._noiseHit({ level: 0.09, attack: 0.008, decay: 0.12, from: 1200, to: 400, q: 0.8 });
    }

    /**
     * Touching down, graded. The grades are meant to be tellable apart with
     * eyes closed: perfect adds a bright tink over the thud, sketchy adds
     * grit, crash is the only one that gets a second impact and a long slide.
     * Impact scales level, not character — a soft crash is still a crash.
     *
     * @param {"perfect"|"clean"|"sketchy"|"crash"} grade
     * @param {number} impact01 0..1
     */
    land(grade = "clean", impact01 = 0.5) {
        if (!this.ready) return;
        const imp = clamp01(impact01);
        const thud = (level, freq, decay, delay = 0) =>
            this._tone({ freq, to: freq * 0.45, type: "sine", level, decay, delay });
        switch (grade) {
            case "perfect":
                thud(0.15 + imp * 0.08, 130, 0.13);
                // The reward ping falls in pitch so it reads as an object,
                // not as the UI's flat sine bell.
                this._tone({ freq: 1500, to: 1050, type: "triangle", level: 0.09, decay: 0.10, delay: 0.02 });
                break;
            case "sketchy":
                thud(0.14 + imp * 0.08, 110, 0.17);
                this._noiseHit({ level: 0.13, attack: 0.004, decay: 0.16, from: 1900, to: 700, q: 2.2 });
                break;
            case "crash":
                thud(0.19 + imp * 0.10, 95, 0.2);
                thud(0.15 + imp * 0.08, 70, 0.28, 0.09);
                this._noiseHit({ level: 0.19 + imp * 0.08, attack: 0.006, decay: 0.55, from: 1400, to: 130, q: 0.8 });
                break;
            default: // "clean" — one honest thud, nothing else to say.
                thud(0.13 + imp * 0.07, 120, 0.15);
                break;
        }
    }

    /** A wipeout by name, because call sites that mean "crash" should not
     *  have to know it is a landing grade. */
    crash() {
        this.land("crash", 1);
    }

    /** Threading past an obstacle: one restrained whoosh. Quiet on purpose —
     *  the reward for a near miss is that nothing louder happened. */
    nearMiss() {
        if (!this.ready) return;
        this._noiseHit({ level: 0.11, attack: 0.02, decay: 0.2, from: 600, to: 180, q: 1.4 });
    }

    /**
     * Trick score banked: a two-note confirm that climbs mildly with the
     * score — up to about a minor third, so a monster line sounds a little
     * sweeter without ever going jackpot.
     * @param {number} score01 0..1
     */
    trickBank(score01 = 0) {
        if (!this.ready) return;
        const root = 494 * Math.pow(2, (clamp01(score01) * 3) / 12);
        this._tone({ freq: root, to: root, type: "triangle", level: 0.13, decay: 0.12 });
        this._tone({ freq: root * (4 / 3), to: root * (4 / 3), type: "triangle", level: 0.11, decay: 0.14, delay: 0.07 });
    }

    /** Passing a checkpoint: a tiny soft chime, quieter than a pickup —
     *  it marks progress, it is not the reward. */
    checkpoint() {
        if (!this.ready) return;
        this._tone({ freq: 784, to: 784, type: "sine", level: 0.07, decay: 0.16 });
        this._tone({ freq: 1568, to: 1568, type: "sine", level: 0.035, decay: 0.12, delay: 0.02 });
    }

    /**
     * An ingredient going into the tray.
     *
     * Pitched per ingredient off its index, so four pickups in a run are four
     * different notes rather than the same blip four times — a rising line, so
     * a full order sounds like a full order.
     */
    pickup(id) {
        if (!this.ready) return;
        const ids = Object.keys(INGREDIENTS);
        const i = Math.max(0, ids.indexOf(id));
        const root = 523.25 * Math.pow(2, i / 12) * 1.0; // C5 upward by semitone
        this._tone({ freq: root, to: root * 1.5, type: "triangle", level: 0.20, decay: 0.20 });
        this._tone({ freq: root * 2, to: root * 3, type: "sine", level: 0.10, decay: 0.14, delay: 0.03 });
        this._noiseHit({ level: 0.13, attack: 0.002, decay: 0.16, from: 5200, to: 1400, q: 1.4 });
    }

    /** The countdown. `n` is 3, 2, 1, or 0 for the drop. */
    countdown(n) {
        if (!this.ready) return;
        const go = n <= 0;
        this._tone({
            freq: go ? 660 : 440, to: go ? 880 : 440,
            type: "triangle", level: go ? 0.26 : 0.16, decay: go ? 0.5 : 0.16,
        });
    }

    /** The burger is served. A warm major triad, the only chord in the game. */
    finish() {
        if (!this.ready) return;
        const root = 349.23; // F4
        const voices = [1, 1.26, 1.5, 2];
        for (let i = 0; i < voices.length; i++) {
            this._tone({
                freq: root * voices[i], to: root * voices[i],
                type: "triangle", level: 0.15, decay: 1.1, delay: i * 0.055,
            });
        }
        this._noiseHit({ level: 0.16, attack: 0.006, decay: 0.7, from: 3000, to: 400, q: 0.7 });
    }

    /** A grill hiss, for the moment the patty lands on it. */
    sizzle() {
        if (!this.ready) return;
        this._noiseHit({ level: 0.20, attack: 0.05, decay: 1.4, from: 5200, to: 2200, q: 0.5 });
    }

    /** Interface. Quiet enough to be felt rather than heard. */
    ui(kind = "move") {
        if (!this.ready) return;
        const freq = kind === "confirm" ? 620 : 380;
        this._tone({ freq, to: freq, type: "sine", level: 0.09, decay: 0.06, bus: this.buses.ui });
    }

    // ------------------------------------------------------------- internals

    /** Two seconds of white noise, generated once and looped by everything. */
    _makeNoise() {
        const n = Math.floor(this.ctx.sampleRate * 2);
        const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        // A cheap deterministic generator rather than Math.random, so the same
        // build always makes the same noise floor — which matters only because
        // it means an audio bug reproduces.
        let s = 22222;
        for (let i = 0; i < n; i++) {
            s = (s * 1664525 + 1013904223) >>> 0;
            d[i] = (s / 2147483648) - 1;
        }
        return buf;
    }

    /** One-shots default onto the sfx bus; only `ui()` routes elsewhere. */
    _tone({ freq, to, type, level, decay, delay = 0, bus = this.buses.sfx }) {
        const ctx = this.ctx;
        const t = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + decay);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(level, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        osc.connect(gain).connect(bus);
        osc.start(t);
        osc.stop(t + decay + 0.05);
    }

    _noiseHit({ level, attack, decay, from, to, q, bus = this.buses.sfx }) {
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = this._noiseBuffer;
        // A random offset into the loop, so repeated hits are not identical.
        src.loopStart = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.Q.value = q;
        filter.frequency.setValueAtTime(from, t);
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + decay);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(level, t + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        src.connect(filter).connect(gain).connect(bus);
        src.start(t, Math.random() * 1.5);
        src.stop(t + decay + 0.05);
    }
}

/** One instance, because there is one output device. */
export const audio = new GameAudio();
