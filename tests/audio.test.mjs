import test from "node:test";
import assert from "node:assert/strict";

/**
 * Small Web Audio double.  The tests care about graph shape and parameter
 * scheduling, not DSP output, so this intentionally records calls instead of
 * pretending to be a speaker.
 */
class FakeParam {
    constructor(value = 0) {
        this.value = value;
        this.calls = [];
    }
    setTargetAtTime(value, time, constant) {
        this.value = value;
        this.calls.push({ method: "target", value, time, constant });
    }
    setValueAtTime(value, time) {
        this.value = value;
        this.calls.push({ method: "set", value, time });
    }
    exponentialRampToValueAtTime(value, time) {
        this.value = value;
        this.calls.push({ method: "ramp", value, time });
    }
}

class FakeNode {
    constructor(kind, ctx) {
        this.kind = kind;
        this.ctx = ctx;
        this.connections = [];
        this.connectCount = 0;
    }
    connect(node) {
        this.connections.push(node);
        this.connectCount++;
        return node;
    }
    disconnect() {
        this.connections.length = 0;
    }
}

class FakeGain extends FakeNode {
    constructor(ctx) {
        super("gain", ctx);
        this.gain = new FakeParam(1);
    }
}

class FakeOscillator extends FakeNode {
    constructor(ctx) {
        super("oscillator", ctx);
        this.frequency = new FakeParam(440);
        this.type = "sine";
    }
    start() { this.ctx.started++; }
    stop() { this.ctx.stopped++; }
}

class FakeBufferSource extends FakeNode {
    constructor(ctx) {
        super("buffer-source", ctx);
        this.loop = false;
        this.loopStart = 0;
    }
    start() { this.ctx.started++; }
    stop() { this.ctx.stopped++; }
}

class FakeFilter extends FakeNode {
    constructor(ctx) {
        super("filter", ctx);
        this.frequency = new FakeParam(440);
        this.Q = new FakeParam(1);
        this.type = "lowpass";
    }
}

class FakeCompressor extends FakeNode {
    constructor(ctx) {
        super("compressor", ctx);
        this.threshold = new FakeParam(0);
        this.knee = new FakeParam(0);
        this.ratio = new FakeParam(1);
        this.attack = new FakeParam(0);
        this.release = new FakeParam(0);
    }
}

class FakeAudioContext {
    constructor() {
        this.currentTime = 0;
        this.sampleRate = 8000;
        this.destination = new FakeNode("destination", this);
        this.nodes = [];
        this.started = 0;
        this.stopped = 0;
        this.resumeCalls = 0;
        this.suspendCalls = 0;
        this.state = "suspended";
    }
    _make(Ctor) {
        const node = new Ctor(this);
        this.nodes.push(node);
        return node;
    }
    createGain() { return this._make(FakeGain); }
    createOscillator() { return this._make(FakeOscillator); }
    createBufferSource() { return this._make(FakeBufferSource); }
    createBiquadFilter() { return this._make(FakeFilter); }
    createDynamicsCompressor() { return this._make(FakeCompressor); }
    createBuffer(channels, length, sampleRate) {
        return { channels, length, sampleRate, getChannelData: () => new Float32Array(length) };
    }
    resume() {
        this.resumeCalls++;
        this.state = "running";
        return Promise.resolve();
    }
    suspend() {
        this.suspendCalls++;
        this.state = "suspended";
        return Promise.resolve();
    }
}

class FakeEventTarget {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, fn) {
        const list = this.listeners.get(type) ?? [];
        list.push(fn);
        this.listeners.set(type, list);
    }
    removeEventListener(type, fn) {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((entry) => entry !== fn));
    }
    emit(type) {
        for (const fn of this.listeners.get(type) ?? []) fn();
    }
}

globalThis.AudioContext = FakeAudioContext;
const fakeWindow = new FakeEventTarget();
const fakeDocument = new FakeEventTarget();
fakeDocument.visibilityState = "visible";
globalThis.window = fakeWindow;
globalThis.document = fakeDocument;

const { GameAudio, MUSIC_STATES } = await import("../src/audio/audio.js");

function freshAudio() {
    const a = new GameAudio();
    a.setBusVolume("music", 0.42);
    a.setMusicState("big-air");
    a.init();
    // The unlock event is intentionally gesture-gated in production.
    a.unlocked = true;
    return a;
}

test("adaptive score accepts the closed state vocabulary and crossfades one held graph", () => {
    assert.deepEqual(MUSIC_STATES, [
        "menu", "order", "countdown", "run", "speed", "trick",
        "avalanche", "big-air", "finish", "results", "tour-complete", "credits",
    ]);
    const audio = freshAudio();
    const nodeCount = audio.ctx.nodes.length;
    assert.equal(audio.musicState, "big-air");
    assert.equal(audio.setMusicState("results"), true);
    assert.equal(audio.musicState, "results");
    assert.equal(audio.setMusicState("not-a-state"), false);
    assert.equal(audio.musicState, "results");
    assert.equal(audio.ctx.nodes.length, nodeCount);
    const d = audio.getMusicDiagnostics();
    assert.equal(d.nodeCount, 16);
    assert.equal(d.crossfadeSeconds, 0.32);
    assert.equal(audio.buses.music.gain.value, 0.42);
    assert.ok(audio._music.pad.gain.calls.some((call) => call.constant === 0.32));
});

test("steady score updates only schedule held parameters and never create nodes", () => {
    const audio = freshAudio();
    const nodeCount = audio.ctx.nodes.length;
    const createGain = audio.ctx.createGain;
    const createOscillator = audio.ctx.createOscillator;
    audio.ctx.createGain = () => { throw new Error("steady music update created a gain"); };
    audio.ctx.createOscillator = () => { throw new Error("steady music update created an oscillator"); };
    for (let i = 0; i < 1000; i++) {
        const speed = (i % 100) / 100;
        audio.updateMusic(speed, 0.65, 0.25, i % 50 < 25 ? 0.8 : 0);
    }
    assert.equal(audio.ctx.nodes.length, nodeCount);
    assert.equal(audio.getMusicDiagnostics().bigAir01, 0);
    audio.updateMusic(0.9, 0.65, 0.25, 0.8);
    assert.equal(audio.getMusicDiagnostics().bigAir01, 0.8);
    audio.ctx.createGain = createGain;
    audio.ctx.createOscillator = createOscillator;
});

test("non-finite telemetry is silent-safe and the held phrase advances on the audio clock", () => {
    const audio = freshAudio();
    audio.updateMusic(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN);
    let d = audio.getMusicDiagnostics();
    assert.equal(d.speed01, 0);
    assert.equal(d.trick01, 0);
    assert.equal(d.avalanche01, 0);
    assert.equal(d.bigAir01, 0);
    audio.updateRocket(Number.NaN, Number.POSITIVE_INFINITY, true);
    audio.avalancheUpdate(Number.NaN);
    audio.snowcatUpdate(Number.POSITIVE_INFINITY);
    audio.scrape(Number.NaN);
    audio.setVolume(Number.NaN);
    assert.equal(audio._rocket.bus.gain.calls.at(-1).value, 0);
    assert.equal(audio._rumble.bus.gain.calls.at(-1).value, 0);
    assert.equal(audio._snowcat.bus.gain.calls.at(-1).value, 0);
    assert.equal(audio.master.gain.calls.at(-1).value, 0);
    const scrapeGain = audio.ctx.nodes.filter((node) => node.kind === "gain").at(-1);
    assert.ok(scrapeGain.gain.calls.every((call) => Number.isFinite(call.value)));

    const before = audio._music.phraseOsc.frequency.calls.length;
    audio.ctx.currentTime = 0.26;
    audio.updateMusic(0.5, 0.2, 0, 0);
    assert.ok(audio._music.phraseOsc.frequency.calls.length > before);
    assert.equal(audio._musicPhraseStep, 1);
    // A steady second call in the same quarter-second does not reschedule the
    // phrase voice, which keeps the audio clock boundary sparse.
    const afterStep = audio._music.phraseOsc.frequency.calls.length;
    audio.ctx.currentTime = 0.27;
    audio.updateMusic(0.5, 0.2, 0, 0);
    assert.equal(audio._music.phraseOsc.frequency.calls.length, afterStep);
});

function fakeAnalyserSnapshot(audio) {
    return {
        pulseEnvelope: audio._music.pulse.gain.calls.at(-1)?.value,
        bassEnvelope: audio._music.bass.gain.calls.at(-1)?.value,
        phraseEnvelope: audio._music.phrase.gain.calls.at(-1)?.value,
        pulseFrequency: audio._music.pulseTone.frequency.calls.at(-1)?.value,
        leadFrequency: audio._music.leadTone.frequency.calls.at(-1)?.value,
        bassFrequency: audio._music.bassTone.frequency.calls.at(-1)?.value,
        phraseFrequency: audio._music.phraseOsc.frequency.calls.at(-1)?.value,
    };
}

test("fake analyser sees a gated pulse envelope and distinct state spectra", () => {
    const audio = freshAudio();
    audio.setMusicState("run", { immediate: true });
    const samples = [];
    for (let step = 0; step < 8; step++) {
        audio.ctx.currentTime = step / 4;
        audio.updateMusic(0.35, 0, 0, 0);
        samples.push(fakeAnalyserSnapshot(audio));
    }
    const pulseLevels = samples.map((sample) => sample.pulseEnvelope);
    const pulseFrequencies = samples.map((sample) => sample.pulseFrequency);
    const phraseLevels = samples.map((sample) => sample.phraseEnvelope);
    const bassLevels = samples.map((sample) => sample.bassEnvelope);
    const phraseFrequencies = samples.map((sample) => sample.phraseFrequency);
    assert.ok(new Set(pulseLevels).size >= 5, "pulse gate is not rhythmically varying");
    assert.ok(Math.max(...pulseLevels) > Math.min(...pulseLevels));
    assert.ok(pulseFrequencies.every(Number.isFinite), "pulse filter is not finite");
    assert.ok(new Set(phraseFrequencies).size >= 5, "phrase oscillator is not advancing");
    assert.ok(phraseLevels.every((level, index) => level > bassLevels[index]),
        "phrase is masked by the bass envelope in the run state");
    assert.ok(samples.every((sample) => Object.values(sample).every(Number.isFinite)));

    const run = samples.at(-1);
    audio.setMusicState("avalanche", { immediate: true });
    audio.ctx.currentTime = 2.01;
    audio.updateMusic(0.35, 0, 0.8, 0);
    const avalanche = fakeAnalyserSnapshot(audio);
    assert.notEqual(run.leadFrequency, avalanche.leadFrequency);
    assert.notEqual(run.pulseFrequency, avalanche.pulseFrequency);
    assert.ok(avalanche.phraseEnvelope > 0);
    assert.ok(avalanche.bassEnvelope < 0.055);
    assert.ok(audio.getMusicDiagnostics().nodeCount === 16);
});

test("the full run boundary sequence is accepted and retry reset remains node-stable", () => {
    const audio = freshAudio();
    const nodeCount = audio.ctx.nodes.length;
    const sequence = [
        "order", "countdown", "run", "speed", "trick", "avalanche",
        "big-air", "finish", "results",
    ];
    for (const state of sequence) {
        assert.equal(audio.setMusicState(state), true);
        audio.updateMusic(0.8, state === "trick" ? 0.9 : 0,
            state === "avalanche" ? 0.8 : 0,
            state === "big-air" ? 1 : 0);
    }
    // A results -> countdown retry uses the immediate path, then settles into
    // the ordinary run again. Both paths retain the same held graph.
    assert.equal(audio.setMusicState("countdown", { immediate: true }), true);
    audio.updateMusic(0, 0, 0, 0);
    assert.equal(audio.setMusicState("run"), true);
    audio.updateMusic(0.25, 0, 0, 0);
    for (let i = 0; i < 120; i++) {
        audio.setMusicState(sequence[i % sequence.length], { immediate: i % 3 === 0 });
        audio.updateMusic(i / 120, 0.2, i % 5 === 0 ? 0.4 : 0, i % 7 === 0 ? 0.8 : 0);
    }
    assert.equal(audio.ctx.nodes.length, nodeCount);
    assert.equal(audio.musicState, sequence[119 % sequence.length]);
    assert.ok(audio.getMusicDiagnostics().transitionCount >= 100);
    assert.ok(audio.getMusicDiagnostics().updateCount >= 100);
});

test("master mute, bus levels, intentional duck, and focus suspend are independent", async () => {
    const audio = freshAudio();
    const normalMaster = audio.master.gain.value;
    audio.setDucked(true);
    assert.equal(audio.master.gain.value, normalMaster * 0.16);
    audio.setDucked(false);
    assert.equal(audio.master.gain.value, normalMaster);
    audio.setEnabled(false);
    assert.equal(audio.master.gain.value, 0);
    audio.setBusVolume("sfx", 0.2);
    assert.equal(audio.buses.sfx.gain.value, 0.2);
    audio.setEnabled(true);
    assert.equal(audio.master.gain.value, normalMaster);

    audio.setFocusPaused(true);
    assert.equal(audio.focusPaused, true);
    assert.equal(audio.ctx.suspendCalls, 1);
    assert.equal(audio.ready, false);
    audio.setFocusPaused(false);
    await Promise.resolve();
    assert.equal(audio.focusPaused, false);
    assert.equal(audio.ctx.resumeCalls, 1);
    assert.equal(audio.ready, true);
});

test("visibility and window focus listeners suspend and resume the context", async () => {
    const audio = freshAudio();
    fakeDocument.visibilityState = "hidden";
    fakeDocument.emit("visibilitychange");
    assert.equal(audio.focusPaused, true);
    fakeDocument.visibilityState = "visible";
    fakeDocument.emit("visibilitychange");
    fakeWindow.emit("blur");
    assert.equal(audio.focusPaused, true);
    fakeWindow.emit("focus");
    await Promise.resolve();
    assert.equal(audio.focusPaused, false);
});
