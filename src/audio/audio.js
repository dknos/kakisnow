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
 * One master gain, one compressor, and a rocket bus that ducks against nothing
 * because there is nothing else running continuously. That is worth stating
 * plainly: this project has no board, powder, edge or landing audio, so the
 * brief's requirement that the rocket not mask them is currently satisfied by
 * their absence rather than by the mix. When those exist, the rocket bus is
 * where the ducking goes.
 *
 * Allocation per frame: none while the rocket is running — its nodes are built
 * once and held. One-shots allocate their own short-lived nodes, which is what
 * the Web Audio API is for and is bounded by how often a player can collect an
 * ingredient.
 */

import { INGREDIENTS } from "../game/ingredients.js";

/** Master level. Deliberately conservative: this plays over a browser tab. */
const MASTER = 0.42;

/** How far the mix drops while the game is paused. Ducked, not silenced: the
 *  pause menu's own clicks still ride the same master, and a world that goes
 *  dead quiet reads as a mute bug rather than as a held breath. */
const DUCK = 0.16;

export class GameAudio {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx = null;
        this.enabled = true;
        this.unlocked = false;
        this._rocket = null;
        this._noiseBuffer = null;
        /** Player volume 0..1, multiplied under the conservative MASTER. */
        this.volume = 1;
        this._ducked = false;
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

        this._noiseBuffer = this._makeNoise();
        this._buildRocket();

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
     * Duck the whole mix for a pause.
     *
     * The rocket loop, any future board layers and the one-shots all hang off
     * the master, so one gain covers everything that should recede — while UI
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
        bus.connect(this.master);

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

    // ---------------------------------------------------------- the one-shots

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
        this._tone({ freq, to: freq, type: "sine", level: 0.09, decay: 0.06 });
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

    _tone({ freq, to, type, level, decay, delay = 0 }) {
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
        osc.connect(gain).connect(this.master);
        osc.start(t);
        osc.stop(t + decay + 0.05);
    }

    _noiseHit({ level, attack, decay, from, to, q }) {
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
        src.connect(filter).connect(gain).connect(this.master);
        src.start(t, Math.random() * 1.5);
        src.stop(t + decay + 0.05);
    }
}

/** One instance, because there is one output device. */
export const audio = new GameAudio();
