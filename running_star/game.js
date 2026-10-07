/**
 * Lumen Run — a short 3D platform game.
 *
 * Frame: the play camera sits on world +Z behind the wisp, above and behind,
 * and looks a little ahead. A narrow screen uses a longer offset; the axes
 * stay the same. In that view, screen-forward is world −Z and screen-right
 * is world +X, so WASD is applied in world axes.
 * The wisp faces local −Z. Heading is a world vector; mesh yaw is only
 * atan2(−heading.x, −heading.z).
 *
 * Solids are platform bodies only. Trim, lamps, shards, the lane carpet,
 * spikes, pendulums, beacons, and the gate are triggers or decoration.
 */
import * as THREE from "three";

const params = new URLSearchParams(location.search);
const AUTO = params.has("autostart");
const SELFTEST = params.has("selftest");
const DEBUG = params.has("debug");
const WATCH_BOT = params.has("watchbot");
const FORCE_TOUCH = params.has("touch");
const levelQuery = Number(params.get("level"));
const devLevel = Number.isInteger(levelQuery) && levelQuery >= 1 && levelQuery <= 10 ? levelQuery - 1 : null;

const RADIUS = 0.42;
const GRAVITY = -30;
const MOVE_SPEED = 7.25;
const ACCEL_GROUND = 36;
const ACCEL_AIR = 14;
const JUMP_V = 10.2;
const DASH_SPEED = 16.5;
const DASH_TIME = 0.16;
const DASH_COOLDOWN = 0.78;
const SAFE_X = 2.35;
const KILL_Y = -8;

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (id) => document.getElementById(id);
const view = $("view");
const hintEl = $("hint");
const scoreEl = $("score");
const shardsEl = $("shards");
const comboEl = $("combo");
const clockEl = $("clock");
const lightFill = $("light-fill");
const pipsEl = $("pips");
const bestEl = $("best");
const muteBtn = $("mute");
const selftestEl = $("selftest");
const endKicker = $("end-kicker");
const endTitle = $("end-title");
const endStats = $("end-stats");
const flashEl = $("flash");

const keys = new Set();
const stick = { x: 0, z: 0, active: false };
const scripted = { active: false, x: 0, z: 0, jump: false, dash: false };
let jumpBuffer = 0;
let dashBuffer = 0;
let prevPadJump = false;
let prevPadDash = false;
let prevScriptJump = false;
let prevScriptDash = false;

const player = {
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  heading: new THREE.Vector3(0, 0, -1),
};
const spawn = new THREE.Vector3();

let state = "title";
let lives = 3;
let light = 100;
let score = 0;
let combo = 0;
let comboTimer = 0;
let runTime = 0;
let iframe = 0;
let coyote = 0;
let dashing = 0;
let dashCd = 0;
let grounded = false;
let riding = null;
let lastGround = null;
let darkTimer = 0;
let shardsGot = 0;
let clock = 0;
let camPull = 0;

const platforms = [];
const shards = [];
let levelIndex = 0;
let selectedIndex = 0;
let courseRoot = null;
const pendulums = [];
const spikes = [];
const checkpoints = [];
let gate = null;
let rig = null;
let avatar = null;
let nose = null;
let shadowDisc = null;
let renderer = null;
let scene = null;
let camera = null;
let skyPivot = null;
let dirLight = null;
let playerLight = null;
let botWp = 0;
let botStuck = 0;
let botLast = new THREE.Vector3();

const shardScratch = new THREE.Vector3();
const wishWorld = new THREE.Vector3();
const bladeBox = new THREE.Box3();

const MUSIC_BPM = 78;
const MUSIC_BEAT = 60 / MUSIC_BPM;
const MUSIC_LOOP = 32 * MUSIC_BEAT;
// beat, frequency, length in beats. An original loop: Am, F, C, G.
const MELODY = [
  [0, 659.25, 0.85], [1, 523.25, 0.85], [2, 440, 0.85], [3, 523.25, 0.85],
  [4, 659.25, 1.4], [6, 783.99, 0.85], [7, 659.25, 0.85],
  [8, 698.46, 0.85], [9, 523.25, 0.85], [10, 440, 0.85], [11, 523.25, 0.85],
  [12, 698.46, 0.85], [13, 659.25, 0.85], [14, 587.33, 1.5],
  [16, 659.25, 0.85], [17, 783.99, 0.85], [18, 659.25, 0.85], [19, 587.33, 0.85],
  [20, 523.25, 1.5], [22, 659.25, 1.3],
  [24, 587.33, 0.85], [25, 493.88, 0.85], [26, 392, 0.85], [27, 493.88, 0.85],
  [28, 587.33, 0.85], [29, 659.25, 0.85], [30, 440, 1.7],
];
const PADS = [
  [0, [220, 261.63, 329.63]],
  [8, [174.61, 220, 261.63]],
  [16, [261.63, 329.63, 392]],
  [24, [196, 246.94, 293.66]],
];
const BASS = [[0, 110], [8, 87.31], [16, 130.81], [24, 98]];

function storedVolume() {
  const raw = localStorage.getItem("lumen-volume");
  if (raw == null || raw === "") return 70;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 70;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const audio = {
  ctx: null,
  master: null,
  music: null,
  sfx: null,
  noiseBuf: null,
  muted: localStorage.getItem("lumen-mute") === "1",
  volume: storedVolume(),
  loopAt: 0,
  stepAt: 0,
  stepN: 0,
  level() {
    return (this.muted || this.volume <= 0 ? 0 : this.volume / 100) * 0.85;
  },
  applyGain() {
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    const target = this.level();
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(target, now + 0.04);
  },
  ensure() {
    try {
      this.start();
    } catch (err) {
      console.warn(err);
    }
  },
  start() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.level();
    this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.9;
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 1;
    const warmth = this.ctx.createBiquadFilter();
    warmth.type = "lowpass";
    warmth.frequency.value = 2200;
    this.music.connect(warmth);
    warmth.connect(this.master);
    this.sfx.connect(this.master);
    const seconds = 0.45;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * seconds), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.loopAt = this.ctx.currentTime + 0.05;
  },
  setVolume(percent) {
    this.volume = Math.max(0, Math.min(100, Math.round(percent)));
    localStorage.setItem("lumen-volume", String(this.volume));
    if (this.volume > 0 && this.muted) {
      this.muted = false;
      localStorage.setItem("lumen-mute", "0");
    }
    this.applyGain();
    paintAudio();
  },
  toggle() {
    const silent = this.muted || this.volume <= 0;
    this.muted = !silent;
    if (!this.muted && this.volume <= 0) {
      this.volume = 70;
      localStorage.setItem("lumen-volume", "70");
    }
    localStorage.setItem("lumen-mute", this.muted ? "1" : "0");
    this.applyGain();
    paintAudio();
  },
  tick() {
    if (!this.ctx || this.ctx.state !== "running" || state === "pause") return;
    const now = this.ctx.currentTime;
    if (this.loopAt < now - 0.02) this.loopAt = now + 0.05;
    let guard = 0;
    while (this.loopAt < now + 0.55 && guard < 2) {
      this.playLoop(this.loopAt);
      this.loopAt += MUSIC_LOOP;
      guard += 1;
    }
  },
  playLoop(start) {
    for (const [beat, voices] of PADS) {
      for (const freq of voices) {
        this.tone(freq, start + beat * MUSIC_BEAT, 7.6 * MUSIC_BEAT, "sine", 0.018, this.music);
      }
    }
    for (const [beat, freq] of BASS) {
      this.tone(freq, start + beat * MUSIC_BEAT, 3.4 * MUSIC_BEAT, "triangle", 0.07, this.music);
    }
    for (const [beat, freq, beats] of MELODY) {
      this.tone(freq, start + beat * MUSIC_BEAT, beats * MUSIC_BEAT, "triangle", 0.055, this.music);
    }
  },
  tone(freq, when, dur, type, gain, bus) {
    if (!this.ctx || !this.sfx || !(gain > 0)) return;
    const t = when || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(bus || this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },
  noise(dur, gain, freq, type = "lowpass") {
    if (!this.ctx || !this.noiseBuf || !(gain > 0)) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
  },
  sweep(from, to, dur, gain) {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },
  foot() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now < this.stepAt) return;
    this.stepAt = now + 0.34;
    this.stepN += 1;
    this.noise(0.045, 0.035, 380);
    this.tone(120 + (this.stepN % 2) * 24, now, 0.05, "sine", 0.03);
  },
  land() {
    this.noise(0.1, 0.07, 220);
    this.tone(86, 0, 0.09, "sine", 0.05);
  },
  jump() {
    this.tone(420, 0, 0.07, "triangle", 0.06);
    this.tone(680, 0, 0.1, "sine", 0.04);
  },
  dash() {
    this.noise(0.16, 0.05, 1400, "bandpass");
    this.sweep(240, 80, 0.16, 0.035);
  },
  shard() {
    this.tone(660 + combo * 30, 0, 0.12, "sine", 0.07);
    this.tone(990, 0, 0.16, "triangle", 0.045);
    this.tone(1320, 0, 0.18, "sine", 0.02);
  },
  hurt() {
    this.noise(0.22, 0.05, 180);
    this.tone(110, 0, 0.22, "square", 0.04);
    this.tone(70, 0, 0.32, "sine", 0.05);
  },
  check() {
    this.tone(520, 0, 0.1, "sine", 0.055);
    this.tone(780, 0, 0.16, "sine", 0.045);
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, (this.ctx ? this.ctx.currentTime : 0) + i * 0.08, 0.32, "sine", 0.07));
  },
  lose() {
    this.tone(196, 0, 0.35, "triangle", 0.06);
    this.tone(130, 0, 0.5, "sine", 0.055);
    this.noise(0.3, 0.04, 160);
  },
};

function paintAudio() {
  const vol = Math.round(audio.volume);
  const silent = audio.muted || vol <= 0;
  muteBtn.textContent = silent ? "Muted" : "Sound";
  muteBtn.setAttribute("aria-pressed", silent ? "true" : "false");
  const slider = $("volume");
  const readout = $("volume-readout");
  if (slider) {
    slider.value = String(vol);
    slider.setAttribute("aria-valuenow", String(vol));
  }
  if (readout) readout.textContent = String(vol);
}

const LEVELS = [
  {
    name: "First Light",
    drain: 2.3,
    intro: "WASD or arrows to move. Space jumps. Shift dashes.",
    isles: [
      { name: "start", x: 0, top: 0, w: 14, d: 14, maxZ: 15 },
      { name: "hop", x: 0, top: 0.2, w: 6, d: 5, gap: 2.55 },
      { name: "rise", x: 0, top: 0.75, w: 5.6, d: 5, gap: 2.6 },
      { name: "ferry", x: 0, top: 0.75, w: 5.4, d: 3.8, gap: 2.5, move: { axis: "x", amp: 2, speed: 0.75 } },
      { name: "ledge", x: 0, top: 1.25, w: 8, d: 7, gap: 2.45, lane: SAFE_X, spike: -2.45, beacon: true, bonus: [-3.15, -1.6] },
      { name: "hall", x: 0, top: 1.25, w: 8, d: 16, overlap: 0.35, role: "hall", lane: SAFE_X },
      { name: "step", x: 0, top: 2.25, w: 6.5, d: 5.2, gap: 2.4 },
      { name: "beam", x: 0, top: 2.25, w: 2.8, d: 9, overlap: 0.3 },
      { name: "beacon", x: 0, top: 2.45, w: 9, d: 8, gap: 1.85, beacon: true },
      { name: "lift", x: 0, top: 2.45, w: 4.2, d: 4.2, gap: 2.2, move: { axis: "y", amp: 1.9, speed: 0.55 } },
      { name: "crown", x: 0, top: 4.2, w: 7, d: 7, gap: 2.45 },
      { name: "leap", x: 0, top: 4.2, w: 7, d: 8, gap: 3.05 },
      { name: "gate", x: 0, top: 4.4, w: 12, d: 12, gap: 2.25, role: "gate" },
    ],
  },
  {
    name: "Two Bridges",
    drain: 2.5,
    intro: "The stones step aside. Aim before you jump.",
    isles: [
      { name: "start", x: 0, top: 0, w: 12, d: 12, maxZ: 14 },
      { name: "east", x: 1.6, top: 0.15, w: 6, d: 5, gap: 2.35 },
      { name: "west", x: -1.5, top: 0.4, w: 6, d: 5, gap: 2.45 },
      { name: "ferry", x: 0, top: 0.4, w: 5.8, d: 4, gap: 2.4, move: { axis: "x", amp: 1.6, speed: 0.65 } },
      { name: "rest", x: 0, top: 0.75, w: 8, d: 6.5, gap: 2.35, beacon: true },
      { name: "side", x: 1.8, top: 1.2, w: 5.4, d: 5, gap: 2.5 },
      { name: "gate", x: 0, top: 1.35, w: 11, d: 10, gap: 2.3, role: "gate" },
    ],
  },
  {
    name: "Switchback",
    drain: 2.75,
    intro: "Each landing sits on the other side. Do not rush the teeth.",
    isles: [
      { name: "start", x: 0, top: 0, w: 12, d: 11, maxZ: 13 },
      { name: "a", x: 2.2, top: 0.25, w: 5.2, d: 4.6, gap: 2.45 },
      { name: "b", x: -2.2, top: 0.6, w: 5.2, d: 4.6, gap: 2.5 },
      { name: "c", x: 2.3, top: 0.95, w: 4.8, d: 4.4, gap: 2.55 },
      { name: "ledge", x: 0, top: 1.25, w: 9, d: 7, gap: 2.4, lane: 2.1, spike: -2.6, beacon: true },
      { name: "d", x: -1.5, top: 1.75, w: 5.2, d: 4.8, gap: 2.5 },
      { name: "gate", x: 0, top: 1.95, w: 10, d: 10, gap: 2.4, role: "gate" },
    ],
  },
  {
    name: "The Slide",
    drain: 3.0,
    intro: "Two ferries. Match their drift, then step off.",
    isles: [
      { name: "start", x: 0, top: 0, w: 12, d: 11, maxZ: 13 },
      { name: "ferry", x: 0, top: 0.2, w: 5.8, d: 3.8, gap: 2.5, move: { axis: "x", amp: 1.8, speed: 0.72 } },
      { name: "land", x: 0, top: 0.2, w: 6.5, d: 4.6, gap: 2.5, beacon: true },
      { name: "ferry2", x: 0, top: 0.65, w: 5.6, d: 3.6, gap: 2.6, move: { axis: "x", amp: 1.9, speed: 0.82 } },
      { name: "rise", x: 0, top: 1.35, w: 5.4, d: 4.8, gap: 2.6 },
      { name: "hop", x: 1.6, top: 1.95, w: 5.2, d: 4.6, gap: 2.7 },
      { name: "gate", x: 0, top: 2.15, w: 10, d: 9, gap: 2.45, role: "gate" },
    ],
  },
  {
    name: "Lamp Hall",
    drain: 3.25,
    intro: "The lamps mark the only safe line. The blades own the rest.",
    isles: [
      { name: "start", x: 0, top: 0, w: 12, d: 11, maxZ: 13 },
      { name: "hop", x: 0, top: 0.3, w: 6, d: 5, gap: 2.5 },
      { name: "hall", x: 0, top: 0.3, w: 8, d: 18, overlap: 0.3, role: "hall", lane: 2.3 },
      { name: "step", x: 0, top: 1.2, w: 5.4, d: 4.8, gap: 2.5 },
      { name: "beam", x: 0, top: 1.2, w: 2.8, d: 8, overlap: 0.25 },
      { name: "beacon", x: 0, top: 1.5, w: 8, d: 7, gap: 2.15, beacon: true },
      { name: "gate", x: 0, top: 1.7, w: 11, d: 10, gap: 2.4, role: "gate" },
    ],
  },
  {
    name: "High Steps",
    drain: 3.5,
    intro: "Climb, wait for the lift to crest, then dash the long gap.",
    isles: [
      { name: "start", x: 0, top: 0, w: 12, d: 11, maxZ: 13 },
      { name: "s1", x: 0, top: 0.85, w: 5.4, d: 4.6, gap: 2.35 },
      { name: "s2", x: 0, top: 1.7, w: 5, d: 4.4, gap: 2.4 },
      { name: "s3", x: 0, top: 2.5, w: 4.8, d: 4.4, gap: 2.45, beacon: true },
      { name: "lift", x: 0, top: 2.5, w: 4.4, d: 4.2, gap: 2.2, move: { axis: "y", amp: 1.75, speed: 0.62 } },
      { name: "crown", x: 0, top: 4.15, w: 6.5, d: 6, gap: 2.3 },
      { name: "leap", x: 0, top: 4.15, w: 6.2, d: 6.5, gap: 3.15 },
      { name: "gate", x: 0, top: 4.35, w: 10, d: 9, gap: 2.4, role: "gate" },
    ],
  },
  {
    name: "Twin Ferries",
    drain: 3.8,
    intro: "Short landings. Leave the ferry while it still crosses your line.",
    isles: [
      { name: "start", x: 0, top: 0, w: 11, d: 11, maxZ: 12 },
      { name: "ferry", x: 0, top: 0.2, w: 5.8, d: 3.7, gap: 2.55, move: { axis: "x", amp: 1.7, speed: 0.8 } },
      { name: "pad", x: 0, top: 0.2, w: 6.2, d: 4.4, gap: 2.5, beacon: true },
      { name: "ferry2", x: 0, top: 0.6, w: 5.6, d: 3.5, gap: 2.6, move: { axis: "x", amp: 1.85, speed: 0.86 } },
      { name: "pad2", x: 0, top: 0.95, w: 5.6, d: 4.2, gap: 2.55 },
      { name: "lift", x: 0, top: 0.95, w: 4.2, d: 4, gap: 2.3, move: { axis: "y", amp: 1.6, speed: 0.7 } },
      { name: "crown", x: 0, top: 2.45, w: 6, d: 5.5, gap: 2.35 },
      { name: "hop", x: 0, top: 2.45, w: 5.6, d: 5.2, gap: 3.05 },
      { name: "gate", x: 0, top: 2.6, w: 10, d: 9, gap: 2.5, role: "gate" },
    ],
  },
  {
    name: "Razor Line",
    drain: 4.15,
    intro: "Teeth, then blades, then a beam no wider than your nerve.",
    isles: [
      { name: "start", x: 0, top: 0, w: 11, d: 11, maxZ: 12 },
      { name: "ledge", x: 0, top: 0.25, w: 9, d: 7, gap: 2.5, lane: 2.15, spike: -2.7, beacon: true },
      { name: "hall", x: 0, top: 0.25, w: 8, d: 14, overlap: 0.3, role: "hall", lane: 2.25 },
      { name: "beam", x: 0, top: 0.25, w: 2.7, d: 9, overlap: 0.25 },
      { name: "step", x: 0, top: 1.15, w: 5.2, d: 4.6, gap: 2.55 },
      { name: "leap", x: 0, top: 1.15, w: 6, d: 6, gap: 3.25 },
      { name: "gate", x: 0, top: 1.35, w: 10, d: 9, gap: 2.55, role: "gate" },
    ],
  },
  {
    name: "Broken Stair",
    drain: 4.6,
    intro: "The stair leans both ways. The lift does not wait long.",
    isles: [
      { name: "start", x: 0, top: 0, w: 11, d: 11, maxZ: 12 },
      { name: "a", x: 1.8, top: 0.7, w: 4.8, d: 4.3, gap: 2.55 },
      { name: "b", x: -1.8, top: 1.45, w: 4.6, d: 4.1, gap: 2.6 },
      { name: "ferry", x: 0, top: 1.45, w: 5.6, d: 3.5, gap: 2.6, move: { axis: "x", amp: 1.7, speed: 0.88 } },
      { name: "lift", x: 0, top: 2.05, w: 4, d: 3.9, gap: 2.4, move: { axis: "y", amp: 1.9, speed: 0.74 } },
      { name: "crown", x: 0, top: 3.85, w: 5.6, d: 5, gap: 2.3, beacon: true },
      { name: "beam", x: 0, top: 3.85, w: 2.6, d: 8, overlap: 0.25 },
      { name: "leap", x: 0, top: 3.85, w: 5.6, d: 5.4, gap: 3.3 },
      { name: "gate", x: 0, top: 4.05, w: 9, d: 8, gap: 2.6, role: "gate" },
    ],
  },
  {
    name: "Last Gate",
    drain: 5.05,
    intro: "Everything you learned, and less light to spend it.",
    isles: [
      { name: "start", x: 0, top: 0, w: 11, d: 11, maxZ: 12 },
      { name: "zig", x: 2, top: 0.45, w: 4.6, d: 4.1, gap: 2.6 },
      { name: "zag", x: -2, top: 0.95, w: 4.4, d: 4, gap: 2.65 },
      { name: "ferry", x: 0, top: 0.95, w: 6, d: 3.5, gap: 2.65, move: { axis: "x", amp: 1.8, speed: 0.9 } },
      { name: "ledge", x: 0, top: 1.5, w: 8.5, d: 6.5, gap: 2.55, lane: 2.05, spike: -2.55, beacon: true },
      { name: "hall", x: 0, top: 1.5, w: 8, d: 15, overlap: 0.28, role: "hall", lane: 2.3 },
      { name: "beam", x: 0, top: 1.5, w: 2.6, d: 8, overlap: 0.22 },
      { name: "lift", x: 0, top: 2.15, w: 3.8, d: 3.8, gap: 2.35, move: { axis: "y", amp: 1.95, speed: 0.8 } },
      { name: "crown", x: 0, top: 4, w: 5.4, d: 4.8, gap: 2.25 },
      { name: "leap", x: 0, top: 4, w: 5.4, d: 5.2, gap: 3.35 },
      { name: "gate", x: 0, top: 4.2, w: 9, d: 8, gap: 2.65, role: "gate" },
    ],
  },
];

function syncBox(p) {
  p.box.min.x = p.x - p.w / 2;
  p.box.max.x = p.x + p.w / 2;
  p.box.min.y = p.top - p.h;
  p.box.max.y = p.top;
  p.box.min.z = p.minZ;
  p.box.max.z = p.maxZ;
}

function layoutLevel(level) {
  platforms.length = 0;
  let prev = null;
  for (const spec of level.isles) {
    let maxZ;
    if (!prev) maxZ = spec.maxZ;
    else if (spec.overlap) maxZ = prev.minZ + spec.overlap;
    else maxZ = prev.minZ - spec.gap;
    const minZ = maxZ - spec.d;
    const p = {
      ...spec,
      z: (maxZ + minZ) / 2,
      minZ,
      maxZ,
      baseX: spec.x,
      baseTop: spec.top,
      h: 1.75,
      lane: spec.lane ?? null,
      x: spec.x,
      top: spec.top,
      box: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
    };
    if (spec.spike != null && !p.role) p.role = "spikes";
    syncBox(p);
    platforms.push(p);
    prev = p;
  }
}

function routeX(p) {
  return p.baseX + (p.lane || 0);
}

function containsX(p, x) {
  return x >= p.baseX - p.w / 2 + RADIUS + 0.2 && x <= p.baseX + p.w / 2 - RADIUS - 0.2;
}

function zJoined(a, b) {
  return b.maxZ >= a.minZ - 0.08;
}

function edgeGap(a, b) {
  const gapX = Math.max(0, Math.abs(a.baseX - b.baseX) - a.w / 2 - b.w / 2);
  const gapZ = Math.max(0, a.minZ - b.maxZ);
  return Math.hypot(gapX, gapZ);
}


function byName(name) {
  return platforms.find((p) => p.name === name);
}

function makeRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x07060f);
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x241433, 28, 86);
  camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 420);
  camera.up.set(0, 1, 0);
  camera.position.set(0, 8, 28);

  scene.add(new THREE.HemisphereLight(0xb9c6ff, 0x3a2418, 0.62));
  dirLight = new THREE.DirectionalLight(0xffd2a8, 2.35);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 70;
  dirLight.shadow.camera.left = -16;
  dirLight.shadow.camera.right = 16;
  dirLight.shadow.camera.top = 16;
  dirLight.shadow.camera.bottom = -16;
  dirLight.shadow.bias = -0.00035;
  dirLight.shadow.normalBias = 0.03;
  scene.add(dirLight, dirLight.target);

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: { sun: { value: new THREE.Vector3(0.62, 0.32, 0.18).normalize() } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 sun;
      void main() {
        vec3 d = normalize(vDir);
        vec3 top = vec3(0.03, 0.045, 0.11);
        vec3 mid = vec3(0.20, 0.10, 0.30);
        vec3 hor = vec3(0.95, 0.55, 0.36);
        vec3 deep = vec3(0.05, 0.02, 0.06);
        vec3 col = mix(hor, mid, smoothstep(0.0, 0.42, d.y));
        col = mix(col, top, smoothstep(0.28, 0.95, d.y));
        col = mix(deep, col, smoothstep(-0.45, 0.08, d.y));
        float s = pow(max(dot(d, sun), 0.0), 42.0);
        col += vec3(1.0, 0.75, 0.5) * s;
        col += vec3(0.9, 0.38, 0.22) * pow(max(dot(d, sun), 0.0), 6.0) * 0.28;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  skyPivot = new THREE.Group();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(240, 32, 20), skyMat);
  sky.frustumCulled = false;
  skyPivot.add(sky);
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(11, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xf4e2c4 }),
  );
  moon.position.set(78, 46, -40);
  skyPivot.add(moon);
  const starPositions = new Float32Array(500 * 3);
  const rnd = mulberry32(11);
  for (let i = 0; i < 500; i++) {
    const r = 190;
    const theta = rnd() * Math.PI * 2;
    const y = rnd() * 2 - 0.15;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    starPositions[i * 3] = Math.cos(theta) * ring * r;
    starPositions[i * 3 + 1] = y * r;
    starPositions[i * 3 + 2] = Math.sin(theta) * ring * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xfff6ea, size: 1.4, sizeAttenuation: false, fog: false }),
  );
  skyPivot.add(stars);
  scene.add(skyPivot);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Dark grey stone. The darkest swatch is still grey, not black.
const FLOOR_GREYS = [0x6e727b, 0x6a6e76, 0x666a72, 0x62666e, 0x5e626a, 0x5a5e66, 0x565a62, 0x52565e, 0x4e525a, 0x4a4e56];
const FOG_TINTS = [0x241433, 0x26162e, 0x1b2236, 0x2a1828, 0x23162a, 0x1a2032, 0x2c1822, 0x201428, 0x161820, 0x2a141c];

function disposeObject(root) {
  const mats = new Set();
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of list) mats.add(m);
    }
  });
  for (const m of mats) {
    m.map?.dispose();
    m.dispose();
  }
}

function mountLevel(index) {
  levelIndex = index;
  disposeCourse();
  layoutLevel(LEVELS[index]);
  buildCourse();
  waypoints = [];
  if (scene?.fog) scene.fog.color.setHex(FOG_TINTS[index] || FOG_TINTS[0]);
}

function disposeCourse() {
  if (!courseRoot) return;
  scene.remove(courseRoot);
  disposeObject(courseRoot);
  courseRoot = null;
  platforms.length = 0;
  shards.length = 0;
  pendulums.length = 0;
  spikes.length = 0;
  checkpoints.length = 0;
  gate = null;
}

function buildCourse() {
  courseRoot = new THREE.Group();
  courseRoot.name = "course";
  scene.add(courseRoot);

  const topMat = new THREE.MeshStandardMaterial({
    color: FLOOR_GREYS[levelIndex] || FLOOR_GREYS[0], roughness: 0.78, metalness: 0.04,
  });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x454952, roughness: 0.9 });
  const moveTop = new THREE.MeshStandardMaterial({ color: 0x8fb8b0, roughness: 0.62, metalness: 0.08 });
  const moveSide = new THREE.MeshStandardMaterial({ color: 0x3e484c, roughness: 0.88 });
  const trimStill = new THREE.MeshStandardMaterial({
    color: 0x14382f, emissive: 0x7ddec8, emissiveIntensity: 0.35, roughness: 0.45,
  });
  const trimMove = new THREE.MeshStandardMaterial({
    color: 0x4a3018, emissive: 0xffb15a, emissiveIntensity: 0.55, roughness: 0.4,
  });
  const laneMat = new THREE.MeshStandardMaterial({
    color: 0xf0d7b0, emissive: 0xffc98a, emissiveIntensity: 0.18, roughness: 0.7,
  });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff1d2, emissive: 0xffc56a, emissiveIntensity: 1.1, roughness: 0.35,
  });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x3b3348, roughness: 0.8 });

  for (const p of platforms) {
    const moving = Boolean(p.move);
    const mats = moving
      ? [moveSide, moveSide, moveTop, moveSide, moveSide, moveSide]
      : [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
    const group = new THREE.Group();
    group.position.set(p.x, p.top - p.h / 2, p.z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), mats);
    body.castShadow = true;
    body.receiveShadow = true;
    body.name = "body";
    group.add(body);
    const trim = moving ? trimMove : trimStill;
    const y = p.h / 2 + 0.03;
    const edges = [
      [p.w, 0.07, 0.08, 0, y, p.d / 2 - 0.04],
      [p.w, 0.07, 0.08, 0, y, -p.d / 2 + 0.04],
      [0.08, 0.07, p.d, p.w / 2 - 0.04, y, 0],
      [0.08, 0.07, p.d, -p.w / 2 + 0.04, y, 0],
    ];
    for (const e of edges) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(e[0], e[1], e[2]), trim);
      bar.position.set(e[3], e[4], e[5]);
      group.add(bar);
    }
    if (p.role === "hall" && p.lane != null) {
      const lane = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, p.d - 0.6), laneMat);
      lane.position.set(p.lane, p.h / 2 + 0.045, 0);
      lane.receiveShadow = true;
      group.add(lane);
      for (let z = -p.d / 2 + 1.4; z <= p.d / 2 - 1.2; z += 3.15) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.85, 6), postMat);
        post.position.set(p.lane + 0.95, p.h / 2 + 0.42, z);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), lampMat);
        lamp.position.set(p.lane + 0.95, p.h / 2 + 0.92, z);
        group.add(post, lamp);
      }
    }
    p.group = group;
    p.body = body;
    courseRoot.add(group);
    if (DEBUG) {
      const helper = new THREE.BoxHelper(body, 0x39f5b0);
      helper.name = "debug";
      courseRoot.add(helper);
      p.helper = helper;
    }
  }

  const shardMat = new THREE.MeshStandardMaterial({
    color: 0xffe1a8, emissive: 0xffb03a, emissiveIntensity: 0.9, roughness: 0.28, metalness: 0.15,
  });
  const placeShard = (host, x, z, bonus) => {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(bonus ? 0.24 : 0.3, 0), shardMat.clone());
    const localY = 1.15;
    if (host.move) {
      mesh.position.set(x - host.x, localY, z - host.z);
      host.group.add(mesh);
    } else {
      mesh.position.set(x, host.top + localY, z);
      courseRoot.add(mesh);
    }
    shards.push({
      mesh, host, bonus, got: false, phase: shards.length * 0.7, baseY: host.top + localY, localY,
    });
  };
  for (const p of platforms) {
    if (p.shards) {
      for (const s of p.shards) placeShard(p, p.x + s[0], p.z + s[1], Boolean(s[2]));
      continue;
    }
    if (p.role === "gate") continue;
    if (p.name === "start") {
      placeShard(p, p.x, p.z - 1.6, false);
      placeShard(p, p.x, p.z - 4.2, false);
      continue;
    }
    const x = p.x + (p.lane || 0);
    if (p.role === "hall") {
      // Both sit on the lamp line, before the path leaves it for the next isle.
      placeShard(p, x, p.maxZ - 2.2, false);
      placeShard(p, x, p.z, false);
    } else {
      placeShard(p, x, p.z, false);
    }
    if (p.bonus) placeShard(p, p.x + p.bonus[0], p.z + p.bonus[1], true);
  }

  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x5a2030, emissive: 0xff4058, emissiveIntensity: 0.85, roughness: 0.35,
  });
  const armMat = new THREE.MeshStandardMaterial({ color: 0x4a4560, roughness: 0.6, metalness: 0.2 });
  for (const hall of platforms) {
    if (hall.role !== "hall") continue;
    const spots = hall.d >= 12
      ? [hall.z + hall.d * 0.12, hall.z - hall.d * 0.26]
      : [hall.z];
    spots.forEach((z, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(hall.x - 1.55, hall.top + 3.35, z);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.35, 8), armMat);
      arm.position.y = -1.18;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.22, 0.28), bladeMat);
      blade.position.y = -2.45;
      pivot.add(arm, blade);
      courseRoot.add(pivot);
      pendulums.push({ pivot, blade, phase: i * 2.1, amp: 0.72, speed: 1.15 + levelIndex * 0.035, host: hall });
    });
  }

  const coneMat = new THREE.MeshStandardMaterial({
    color: 0xff5d6e, emissive: 0xff3048, emissiveIntensity: 0.7, roughness: 0.4,
  });
  for (const host of platforms) {
    if (host.spike == null) continue;
    const spike = { x: host.x + host.spike, z: host.z + 0.2, y: host.top, r: 0.62, host };
    for (let i = 0; i < 5; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.48, 5), coneMat);
      const a = (i / 5) * Math.PI * 2;
      cone.position.set(spike.x + Math.cos(a) * 0.28, host.top + 0.24, spike.z + Math.sin(a) * 0.28);
      cone.castShadow = true;
      courseRoot.add(cone);
    }
    spikes.push(spike);
  }

  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xffe6c2, emissive: 0xffb15a, emissiveIntensity: 0.4, roughness: 0.3,
  });
  for (const host of platforms) {
    if (!host.beacon) continue;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.045, 8, 28), ringMat.clone());
    ring.rotation.x = Math.PI / 2;
    const x = host.x + (host.lane || 0);
    ring.position.set(x, host.top + 0.08, host.z);
    courseRoot.add(ring);
    checkpoints.push({
      mesh: ring,
      point: new THREE.Vector3(x, host.top + RADIUS, host.z),
      active: false,
      host,
    });
  }

  const gateHost = byName("gate");
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(1.55, 0.085, 12, 40),
    new THREE.MeshStandardMaterial({
      color: 0xfff4e4, emissive: 0xffc56a, emissiveIntensity: 1.15, roughness: 0.25,
    }),
  );
  torus.position.set(gateHost.x, gateHost.top + 1.55, gateHost.z);
  courseRoot.add(torus);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a3352, roughness: 0.8 });
  for (const x of [-2.7, 2.7]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 3.1, 8), pillarMat);
    pillar.position.set(gateHost.x + x, gateHost.top + 1.55, gateHost.z);
    pillar.castShadow = true;
    courseRoot.add(pillar);
  }
  const gateLight = new THREE.PointLight(0xffc56a, 3, 14, 2);
  gateLight.position.copy(torus.position);
  courseRoot.add(gateLight);
  gate = { mesh: torus, light: gateLight, r: 1.62, x: gateHost.x, z: gateHost.z };

  const start = byName("start");
  addLabel("BEGIN", start.x, start.top + 0.06, start.maxZ - 1.8);
  addLabel("ENTER", gateHost.x, gateHost.top + 0.06, gateHost.z + Math.min(3.2, gateHost.d * 0.28));

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a2038, roughness: 0.95, flatShading: true });
  const rnd = mulberry32(4 + levelIndex * 17);
  const span = start.maxZ - platforms[platforms.length - 1].minZ + 10;
  for (let i = 0; i < 16; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + rnd() * 1.6, 0), rockMat);
    const side = rnd() < 0.5 ? -1 : 1;
    rock.position.set(side * (7.5 + rnd() * 8), -1.5 + rnd() * 3, start.maxZ - rnd() * span);
    rock.rotation.set(rnd(), rnd(), rnd());
    rock.castShadow = true;
    courseRoot.add(rock);
  }
}

function buildAvatar() {
  rig = new THREE.Group();
  avatar = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xfff6ea }),
  );
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.5, 1),
    new THREE.MeshStandardMaterial({
      color: 0x9fe7ff,
      emissive: 0x3ad6c4,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.38,
      roughness: 0.12,
      depthWrite: false,
    }),
  );
  // ConeGeometry points along +Y. A −90° rotation about X takes +Y onto −Z,
  // which is the wisp's front. The nose position, not this rotation, is the facing cue.
  nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.2, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff8ef }),
  );
  nose.position.set(0, 0.04, -0.5);
  nose.rotation.x = -Math.PI / 2;
  nose.name = "nose";
  avatar.add(core, shell, nose);
  rig.add(avatar);
  playerLight = new THREE.PointLight(0xffd8ae, 2.2, 9, 2);
  playerLight.position.y = 0.2;
  rig.add(playerLight);
  scene.add(rig);

  shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.46, 20),
    new THREE.MeshBasicMaterial({ color: 0x3a3e46, transparent: true, opacity: 0.42, depthWrite: false }),
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  scene.add(shadowDisc);

  const sparkGeo = new THREE.SphereGeometry(0.06, 6, 6);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffe1b0 }));
    m.visible = false;
    m.userData.life = 0;
    m.userData.v = new THREE.Vector3();
    scene.add(m);
    sparkPool.push(m);
  }
}


function addLabel(text, x, y, z) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, 256, 128);
  g.fillStyle = "rgba(255, 236, 210, 0.9)";
  g.font = "700 54px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  courseRoot.add(mesh);
}

function burst(x, y, z, color) {
  for (let i = 0; i < 8; i++) {
    const m = sparkPool[sparkCursor++ % sparkPool.length];
    m.visible = true;
    m.position.set(x, y, z);
    m.material.color.set(color);
    m.userData.life = 0.38;
    m.userData.v.set((Math.random() - 0.5) * 4, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 4);
  }
}
const sparkPool = [];
let sparkCursor = 0;

function updateSparks(dt) {
  for (const m of sparkPool) {
    if (!m.visible) continue;
    m.userData.life -= dt;
    if (m.userData.life <= 0) {
      m.visible = false;
      continue;
    }
    m.position.addScaledVector(m.userData.v, dt);
    m.userData.v.y -= 8 * dt;
  }
}

function overlap1D(c, r, min, max) {
  return c + r > min && c - r < max;
}

function overlaps(pos, box) {
  return overlap1D(pos.x, RADIUS, box.min.x, box.max.x)
    && overlap1D(pos.y, RADIUS, box.min.y, box.max.y)
    && overlap1D(pos.z, RADIUS, box.min.z, box.max.z);
}

function movePlatforms(carried) {
  for (const p of platforms) {
    if (!p.move) continue;
    const prevX = p.x;
    const prevTop = p.top;
    const offset = Math.sin(clock * p.move.speed) * p.move.amp;
    if (p.move.axis === "x") p.x = p.baseX + offset;
    if (p.move.axis === "y") p.top = p.baseTop + offset;
    syncBox(p);
    p.group.position.set(p.x, p.top - p.h / 2, p.z);
    if (carried === p) {
      player.pos.x += p.x - prevX;
      player.pos.y += p.top - prevTop;
    }
  }
}

function updateAnimations(dt) {
  for (const s of shards) {
    if (s.got) continue;
    const bob = Math.sin(clock * 2.1 + s.phase) * 0.12;
    s.mesh.rotation.y += dt * 1.7;
    if (s.host.move) s.mesh.position.y = s.localY + bob;
    else s.mesh.position.y = s.baseY + bob;
  }
  for (const pen of pendulums) {
    pen.pivot.rotation.z = Math.sin(clock * pen.speed + pen.phase) * pen.amp;
  }
  for (const cp of checkpoints) {
    const pulse = 1 + Math.sin(clock * 3) * 0.06;
    cp.mesh.scale.setScalar(pulse);
    cp.mesh.material.emissiveIntensity = cp.active ? 1.3 : 0.35;
  }
  if (gate) {
    gate.mesh.rotation.z = clock * 0.35;
    const s = 1 + Math.sin(clock * 2) * 0.03;
    gate.mesh.scale.setScalar(s);
  }
}

function readWish() {
  let x = stick.x;
  let z = stick.z;
  const pads = navigator.getGamepads?.();
  const gp = pads && pads[0];
  if (gp) {
    if (Math.abs(gp.axes[0]) > 0.18) x += gp.axes[0];
    if (Math.abs(gp.axes[1]) > 0.18) z += gp.axes[1];
    const jumpDown = gp.buttons[0]?.pressed;
    const dashDown = gp.buttons[1]?.pressed || gp.buttons[5]?.pressed || gp.buttons[7]?.pressed;
    if (jumpDown && !prevPadJump) jumpBuffer = 0.14;
    if (dashDown && !prevPadDash) dashBuffer = 0.14;
    prevPadJump = Boolean(jumpDown);
    prevPadDash = Boolean(dashDown);
  }
  if (scripted.active) {
    x += scripted.x;
    z += scripted.z;
    if (scripted.jump && !prevScriptJump) jumpBuffer = 0.14;
    if (scripted.dash && !prevScriptDash) dashBuffer = 0.14;
    prevScriptJump = scripted.jump;
    prevScriptDash = scripted.dash;
  } else {
    prevScriptJump = false;
    prevScriptDash = false;
  }
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) z -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z += 1;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  wishWorld.set(x, 0, z);
}

function approach(current, target, maxDelta) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

function collideHorizontal(axis, delta) {
  player.pos[axis] += delta;
  const other = axis === "x" ? "z" : "x";
  for (let pass = 0; pass < 2; pass++) {
    for (const p of platforms) {
      const box = p.box;
      if (!overlaps(player.pos, box)) continue;
      if (!overlap1D(player.pos.y, RADIUS - 0.02, box.min.y, box.max.y)) continue;
      if (!overlap1D(player.pos[other], RADIUS, box.min[other], box.max[other])) continue;
      if (delta > 0) player.pos[axis] = box.min[axis] - RADIUS;
      else if (delta < 0) player.pos[axis] = box.max[axis] + RADIUS;
      player.vel[axis] = 0;
    }
  }
}

function collideVertical(delta) {
  const prevY = player.pos.y;
  player.pos.y += delta;
  let landed = null;
  let bestSurface = -Infinity;
  for (const p of platforms) {
    const box = p.box;
    if (!overlap1D(player.pos.x, RADIUS, box.min.x, box.max.x)) continue;
    if (!overlap1D(player.pos.z, RADIUS, box.min.z, box.max.z)) continue;
    if (!overlap1D(player.pos.y, RADIUS, box.min.y, box.max.y)) continue;
    if (delta <= 0) {
      const surface = box.max.y + RADIUS;
      if (prevY >= surface - 0.08 && surface >= bestSurface) {
        bestSurface = surface;
        landed = p;
      }
    } else if (prevY <= box.min.y - RADIUS + 0.08) {
      player.pos.y = box.min.y - RADIUS;
      player.vel.y = Math.min(player.vel.y, 0);
    }
  }
  if (landed) {
    player.pos.y = bestSurface;
    player.vel.y = 0;
    grounded = true;
    riding = landed.move ? landed : null;
    lastGround = landed;
  }
}

function simulate(dt) {
  const wasGrounded = grounded;
  grounded = false;
  riding = null;
  jumpBuffer = Math.max(0, jumpBuffer - dt);
  dashBuffer = Math.max(0, dashBuffer - dt);
  dashCd = Math.max(0, dashCd - dt);
  coyote = Math.max(0, coyote - dt);
  if (iframe > 0) iframe -= dt;

  readWish();
  const speedH = Math.hypot(player.vel.x, player.vel.z);
  if (speedH > 0.45) player.heading.set(player.vel.x, 0, player.vel.z).normalize();

  if (dashBuffer > 0 && dashCd <= 0 && dashing <= 0) {
    const dir = wishWorld.lengthSq() > 0.04 ? wishWorld : player.heading;
    const len = Math.hypot(dir.x, dir.z) || 1;
    player.vel.x = (dir.x / len) * DASH_SPEED;
    player.vel.z = (dir.z / len) * DASH_SPEED;
    dashing = DASH_TIME;
    dashCd = DASH_COOLDOWN;
    dashBuffer = 0;
    audio.dash();
    burst(player.pos.x, player.pos.y, player.pos.z, 0xc8fff2);
  }
  if (dashing > 0) dashing -= dt;

  const canJump = wasGrounded || coyote > 0;
  if (canJump && jumpBuffer > 0) {
    player.vel.y = JUMP_V;
    grounded = false;
    coyote = 0;
    jumpBuffer = 0;
    audio.jump();
  }

  if (dashing <= 0) {
    const horiz = Math.hypot(player.vel.x, player.vel.z);
    // A dash leaves extra speed. Bleed it back to a run quickly so the
    // burst clears a gap without carrying the wisp off the next isle.
    let accel = wasGrounded ? ACCEL_GROUND : ACCEL_AIR;
    if (horiz > MOVE_SPEED + 0.4) accel = 70;
    player.vel.x = approach(player.vel.x, wishWorld.x * MOVE_SPEED, accel * dt);
    player.vel.z = approach(player.vel.z, wishWorld.z * MOVE_SPEED, accel * dt);
  }

  collideHorizontal("x", player.vel.x * dt);
  collideHorizontal("z", player.vel.z * dt);
  // Re-stick to the surface we were already on. A zero-velocity rest sits
  // exactly on the top face, which is not an overlap, so gravity would
  // flutter grounded every other frame and moving isles would drop us.
  const stickToGround = wasGrounded && player.vel.y <= 0 && jumpBuffer <= 0;
  const fallVy = player.vel.y;
  if (stickToGround) {
    player.vel.y = 0;
    const beforeY = player.pos.y;
    collideVertical(-0.35);
    if (!grounded) player.pos.y = beforeY;
  } else {
    player.vel.y = Math.max(-32, player.vel.y + GRAVITY * dt);
    collideVertical(player.vel.y * dt);
  }
  if (!wasGrounded && grounded && fallVy < -3.5) audio.land();

  if (wasGrounded && !grounded && player.vel.y <= 0) coyote = 0.12;

  const travel = Math.hypot(player.vel.x, player.vel.z);
  if (travel > 0.5) {
    player.heading.set(player.vel.x, 0, player.vel.z).normalize();
    rig.rotation.y = Math.atan2(-player.heading.x, -player.heading.z);
  }
  if (grounded && dashing <= 0 && travel > 1.6) audio.foot();

  for (const s of shards) {
    if (s.got) continue;
    s.mesh.getWorldPosition(shardScratch);
    if (shardScratch.distanceTo(player.pos) < 1.12) collectShard(s);
  }

  for (const pen of pendulums) {
    bladeBox.setFromObject(pen.blade);
    const hit = player.pos.x > bladeBox.min.x - 0.15
      && player.pos.x < bladeBox.max.x + 0.15
      && player.pos.y > bladeBox.min.y - 0.3
      && player.pos.y < bladeBox.max.y + 0.3
      && player.pos.z > bladeBox.min.z - 0.3
      && player.pos.z < bladeBox.max.z + 0.3;
    if (hit) {
      pen.blade.getWorldPosition(shardScratch);
      const k = player.pos.clone().sub(shardScratch);
      k.y = 0;
      if (k.lengthSq() < 0.01) k.set(1, 0, 0);
      k.normalize().multiplyScalar(8);
      hurt("blade", k.x, k.z);
    }
  }

  for (const spike of spikes) {
    const dx = player.pos.x - spike.x;
    const dz = player.pos.z - spike.z;
    if (Math.hypot(dx, dz) < spike.r && player.pos.y < spike.y + 1.1) {
      hurt("spike", dx * 4, dz * 4);
    }
  }

  for (const cp of checkpoints) {
    if (cp.active) continue;
    const dx = player.pos.x - cp.point.x;
    const dz = player.pos.z - cp.point.z;
    if (Math.hypot(dx, dz) < 1.25 && Math.abs(player.pos.y - cp.point.y) < 1.4) {
      cp.active = true;
      spawn.copy(cp.point);
      light = Math.min(100, light + 12);
      audio.check();
      burst(cp.point.x, cp.point.y + 0.4, cp.point.z, 0xffd7a1);
      floatText("Beacon", cp.point.x, cp.point.y + 1.4, cp.point.z);
    }
  }

  if (gate && state === "play") {
    const dx = player.pos.x - gate.mesh.position.x;
    const dy = player.pos.y - gate.mesh.position.y;
    const dz = player.pos.z - gate.mesh.position.z;
    if (dx * dx + dy * dy + dz * dz < gate.r * gate.r) finish("won");
  }

  if (player.pos.y < KILL_Y && state === "play") {
    if (iframe > 0 && lives > 0) respawn();
    else hurt("fall");
  }

  light = Math.max(0, light - LEVELS[levelIndex].drain * dt);
  if (light <= 0 && state === "play") {
    darkTimer += dt;
    if (darkTimer > 8) {
      darkTimer = 0;
      hurt("dark");
    }
  } else darkTimer = 0;

  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) combo = 0;
  }
}

function collectShard(s) {
  s.got = true;
  s.mesh.visible = false;
  shardsGot += 1;
  if (comboTimer <= 0) combo = 0;
  combo += 1;
  comboTimer = 3.2;
  score += 100 * combo;
  light = Math.min(100, light + (s.bonus ? 28 : 18));
  audio.shard();
  const p = s.mesh.getWorldPosition(shardScratch);
  burst(p.x, p.y, p.z, 0xffe1a8);
  floatText(`+${100 * combo}`, p.x, p.y + 0.4, p.z);
}

function hurt(kind, kx = 0, kz = 0) {
  if (state !== "play" || iframe > 0) return;
  lives -= 1;
  iframe = 1.15;
  light = Math.max(0, light - 16);
  combo = 0;
  comboTimer = 0;
  audio.hurt();
  flashEl.style.background = kind === "dark" ? "#1a0a16" : "#ff8d7a";
  if (!reduceMotion) {
    flashEl.classList.remove("on");
    void flashEl.offsetWidth;
    flashEl.classList.add("on");
  }
  if (lives <= 0) {
    player.vel.set(kx, 7, kz);
    finish("lost");
    return;
  }
  if (kind === "fall") respawn();
  else {
    player.vel.x = kx;
    player.vel.y = 7;
    player.vel.z = kz;
  }
}

function respawn() {
  player.pos.copy(spawn);
  player.pos.y = spawn.y + 0.08;
  player.vel.set(0, 0, 0);
  riding = null;
  iframe = Math.max(iframe, 0.7);
}

function finish(kind) {
  if (state !== "play") return;
  state = kind;
  document.body.dataset.state = kind;
  const isle = LEVELS[levelIndex];
  const nextBtn = $("next");
  const retryBtn = $("retry");
  if (kind === "won") {
    const par = 28 + platforms.length * 3.5;
    const timeBonus = Math.max(0, Math.round((par - runTime) * 12));
    score += timeBonus + lives * 400 + 700 * (levelIndex + 1);
    audio.win();
    endKicker.textContent = `Isle ${levelIndex + 1} · ${isle.name}`;
    endTitle.textContent = levelIndex === LEVELS.length - 1 ? "The sky is yours" : "You kept the light";
  } else {
    audio.lose();
    endKicker.textContent = `Isle ${levelIndex + 1} · ${isle.name}`;
    endTitle.textContent = "The isles go dark";
  }
  if (!SELFTEST) saveBest(kind === "won");
  const best = loadProgress().bests[levelIndex] || {};
  endStats.innerHTML = "";
  const rows = [
    ["Score", score.toLocaleString()],
    ["Time", formatTime(runTime)],
    ["Shards", `${shardsGot} / ${shards.length}`],
    ["Lives left", String(Math.max(0, lives))],
  ];
  if (best.score) rows.push(["Best score", best.score.toLocaleString()]);
  if (best.time) rows.push(["Best time", formatTime(best.time)]);
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    endStats.append(dt, dd);
  }
  const showNext = kind === "won" && levelIndex < LEVELS.length - 1;
  nextBtn.hidden = !showNext;
  nextBtn.classList.toggle("primary", showNext);
  retryBtn.classList.toggle("primary", !showNext);
  (showNext ? nextBtn : retryBtn).focus();
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t - Math.floor(t)) * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function loadProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem("lumen-run") || "{}");
    if (raw && raw.bests) return { unlocked: raw.unlocked || 0, bests: raw.bests };
    const bests = {};
    if (raw && (raw.score || raw.time)) bests[0] = { score: raw.score || 0, time: raw.time || 0 };
    return { unlocked: raw && raw.time ? 1 : 0, bests };
  } catch {
    return { unlocked: 0, bests: {} };
  }
}

function saveBest(won) {
  const prog = loadProgress();
  const prev = prog.bests[levelIndex] || {};
  const next = { ...prev };
  if (!next.score || score > next.score) next.score = score;
  if (won && (!next.time || runTime < next.time)) next.time = runTime;
  prog.bests[levelIndex] = next;
  if (won) prog.unlocked = Math.max(prog.unlocked || 0, levelIndex + 1);
  localStorage.setItem("lumen-run", JSON.stringify(prog));
}

function isleOpen(index, prog = loadProgress()) {
  return index <= (prog.unlocked || 0) || index === devLevel;
}

function paintBest() {
  const prog = loadProgress();
  const best = prog.bests[selectedIndex] || {};
  const open = Math.min(LEVELS.length, (prog.unlocked || 0) + 1);
  const bits = [`Isles open ${open}/${LEVELS.length}`];
  if (best.score) bits.push(`best score ${best.score.toLocaleString()}`);
  if (best.time) bits.push(`best time ${formatTime(best.time)}`);
  bestEl.textContent = bits.join(" · ");
}

function paintLevels() {
  const host = $("levels");
  if (!host) return;
  host.innerHTML = "";
  LEVELS.forEach((lvl, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(i + 1);
    const open = isleOpen(i);
    btn.disabled = !open;
    btn.setAttribute("aria-pressed", i === selectedIndex ? "true" : "false");
    btn.title = open ? `Isle ${i + 1}: ${lvl.name}` : `Isle ${i + 1} is still dark`;
    btn.addEventListener("click", () => selectLevel(i));
    host.appendChild(btn);
  });
}

function selectLevel(index) {
  if (!isleOpen(index) || state !== "title") return;
  selectedIndex = index;
  levelIndex = index;
  mountLevel(index);
  const lvl = LEVELS[index];
  $("title-kicker").textContent = `Isle ${index + 1} · ${lvl.name}`;
  $("play").textContent = `Begin isle ${index + 1}`;
  paintLevels();
  paintBest();
}

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function updateHud() {
  setText(scoreEl, score.toLocaleString());
  setText(shardsEl, `Shards ${shardsGot}/${shards.length}`);
  setText($("level-name"), `Isle ${levelIndex + 1} · ${LEVELS[levelIndex].name}`);
  setText(clockEl, formatTime(runTime));
  lightFill.style.transform = `scaleX(${Math.max(0, Math.min(1, light / 100))})`;
  document.body.classList.toggle("dim", light < 28 && state === "play");
  if (combo >= 2 && comboTimer > 0) {
    comboEl.hidden = false;
    setText(comboEl, `×${combo}`);
  } else comboEl.hidden = true;
  [...pipsEl.children].forEach((el, i) => el.classList.toggle("on", i < lives));
  const hint = hintFor();
  if (hint) {
    hintEl.classList.add("show");
    setText(hintEl, hint);
  } else hintEl.classList.remove("show");
}

function hintFor() {
  if (state !== "play") return "";
  if (light < 26) return "Your light is thinning. Gather a shard.";
  const here = lastGround;
  if (!here) return LEVELS[levelIndex].intro;
  if (here.name === "start" && runTime < 7) return LEVELS[levelIndex].intro;
  if (here.move?.axis === "x") return "The pale stone slides. Ride it across.";
  if (here.role === "hall") return "Follow the lamps. The middle of the hall bites.";
  if (here.role === "spikes") return "The red teeth bite. Keep to the open side.";
  const i = platforms.indexOf(here);
  const next = platforms[i + 1];
  if (!next) return "";
  if (next.move?.axis === "y") return "Wait until the lift crests, then jump.";
  if (next.role === "gate") return "Step through the ring.";
  if (!zJoined(here, next) && edgeGap(here, next) > 2.9) return "Take a run at the long gap. Dash if you are short.";
  return "";
}

function placeGameplayCamera() {
  camera.up.set(0, 1, 0);
  const rise = state === "won" ? camPull : 0;
  // Narrow screens keep the same behind-and-above frame, just further out,
  // so the path ahead stays in view and the wisp does not fill the portrait.
  const narrow = camera.aspect < 0.9;
  const height = narrow ? 7.1 : 4.4;
  const back = narrow ? 12.4 : 8.6;
  const lookUp = narrow ? 0.45 : 1.0;
  const lookAhead = narrow ? 3.1 : 1.6;
  camera.position.set(player.pos.x, player.pos.y + height + rise, player.pos.z + back);
  camera.lookAt(player.pos.x, player.pos.y + lookUp + rise * 0.3, player.pos.z - lookAhead);
}

function attractShots() {
  if (!platforms.length) return [{ p: [7, 7.5, 24], l: [0, 1.2, 6] }];
  const idx = [0, 0.34, 0.67, 1].map((t) => Math.min(platforms.length - 1, Math.round(t * (platforms.length - 1))));
  return [...new Set(idx)].map((i) => {
    const p = platforms[i];
    return {
      p: [p.x + 7, p.top + 7.4, p.maxZ + 9],
      l: [p.x, p.top + 1.1, p.z],
    };
  });
}

function placeAttractCamera(t) {
  const shots = attractShots();
  let span = reduceMotion ? 0 : (t * 0.045) % shots.length;
  if (!Number.isFinite(span) || span < 0) span = 0;
  else if (span >= shots.length) span = 0;
  const i = Math.floor(span);
  const f = span - i;
  const a = shots[i];
  const b = shots[(i + 1) % shots.length];
  const k = f * f * (3 - 2 * f);
  camera.position.set(
    a.p[0] + (b.p[0] - a.p[0]) * k,
    a.p[1] + (b.p[1] - a.p[1]) * k,
    a.p[2] + (b.p[2] - a.p[2]) * k,
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(
    a.l[0] + (b.l[0] - a.l[0]) * k,
    a.l[1] + (b.l[1] - a.l[1]) * k,
    a.l[2] + (b.l[2] - a.l[2]) * k,
  );
}

function syncRig() {
  const show = state !== "title";
  rig.visible = show;
  if (!show) {
    shadowDisc.visible = false;
    return;
  }
  const bob = reduceMotion || state !== "play" ? 0 : Math.sin(clock * 3) * 0.05;
  rig.position.set(player.pos.x, player.pos.y + bob, player.pos.z);
  if (iframe > 0 && state === "play" && !reduceMotion) avatar.visible = Math.floor(clock * 16) % 2 === 0;
  else avatar.visible = true;
  const dim = 0.35 + 0.65 * (light / 100);
  playerLight.intensity = 0.6 + 2 * dim;
  shadowDisc.visible = grounded && state === "play";
  shadowDisc.position.set(player.pos.x, player.pos.y - RADIUS + 0.03, player.pos.z);
}

function lightsFollow() {
  dirLight.position.set(player.pos.x + 14, player.pos.y + 24, player.pos.z + 8);
  dirLight.target.position.set(player.pos.x, player.pos.y, player.pos.z);
  skyPivot.position.copy(camera.position);
}

function floatText(msg, x, y, z) {
  const el = document.createElement("div");
  el.className = "pop";
  el.textContent = msg;
  const v = new THREE.Vector3(x, y, z).project(camera);
  el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
  el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

function showTitle() {
  state = "title";
  document.body.dataset.state = "title";
  if (audio.ctx?.state === "suspended") audio.ctx.resume();
  const lvl = LEVELS[selectedIndex];
  $("title-kicker").textContent = `Isle ${selectedIndex + 1} · ${lvl.name}`;
  $("play").textContent = `Begin isle ${selectedIndex + 1}`;
  paintLevels();
  paintBest();
  $("play").focus();
}

function begin() {
  selectedIndex = levelIndex;
  mountLevel(levelIndex);
  const start = byName("start");
  const spawnZ = start.maxZ - 3.6;
  state = "play";
  document.body.dataset.state = "play";
  lives = 3;
  light = 100;
  score = 0;
  combo = 0;
  comboTimer = 0;
  runTime = 0;
  iframe = 0;
  coyote = 0;
  dashing = 0;
  dashCd = 0;
  darkTimer = 0;
  shardsGot = 0;
  grounded = false;
  riding = null;
  lastGround = start;
  camPull = 0;
  botWp = 0;
  botStuck = 0;
  player.heading.set(0, 0, -1);
  player.vel.set(0, 0, 0);
  player.pos.set(start.x, start.top + RADIUS + 0.2, spawnZ);
  spawn.set(start.x, start.top + RADIUS, spawnZ);
  rig.rotation.y = 0;
  for (const s of shards) {
    s.got = false;
    s.mesh.visible = true;
  }
  for (const cp of checkpoints) cp.active = false;
  for (const p of platforms) {
    p.x = p.baseX;
    p.top = p.baseTop;
    syncBox(p);
    p.group.position.set(p.x, p.top - p.h / 2, p.z);
  }
  placeGameplayCamera();
  updateHud();
}

function step(dt) {
  clock += dt;
  if (state !== "pause") {
    movePlatforms(riding);
    updateAnimations(dt);
    updateSparks(dt);
  }
  if (state === "play") {
    if (WATCH_BOT) applyBot();
    simulate(dt);
    runTime += dt;
    placeGameplayCamera();
  } else if (state === "won") {
    camPull = Math.min(3.2, camPull + dt * 0.8);
    rig.rotation.y += dt * 0.8;
    placeGameplayCamera();
  } else if (state === "lost") {
    player.vel.y += GRAVITY * dt * 0.35;
    player.pos.addScaledVector(player.vel, dt);
    placeGameplayCamera();
  } else if (state === "title") {
    placeAttractCamera(clock);
  }
  syncRig();
  lightsFollow();
  if (state === "play" || state === "won" || state === "lost") updateHud();
  audio.tick();
  if (DEBUG) {
    for (const p of platforms) p.helper?.update();
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (state !== "pause") step(dt);
  else renderer.render(scene, camera);
  if (state !== "pause") renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function bindInput() {
  window.addEventListener("keydown", (e) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === "Enter" && state === "title") {
      e.preventDefault();
      $("play").click();
      return;
    }
    if (e.code === "Escape") {
      if (state === "play") setPause(true);
      else if (state === "pause") setPause(false);
      return;
    }
    if (state !== "play") return;
    keys.add(e.code);
    if (e.code === "Space") jumpBuffer = 0.14;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") dashBuffer = 0.14;
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());

  $("title").addEventListener("pointerdown", () => audio.ensure());
  $("volume").addEventListener("input", () => {
    audio.setVolume(Number($("volume").value));
    audio.ensure();
  });
  $("play").addEventListener("click", () => {
    audio.ensure();
    levelIndex = selectedIndex;
    begin();
  });
  $("pause-btn").addEventListener("click", () => setPause(true));
  $("resume").addEventListener("click", () => {
    audio.ensure();
    setPause(false);
  });
  $("quit").addEventListener("click", () => showTitle());
  $("retry").addEventListener("click", () => {
    audio.ensure();
    begin();
  });
  $("next").addEventListener("click", () => {
    audio.ensure();
    if (levelIndex >= LEVELS.length - 1) return;
    levelIndex += 1;
    begin();
  });
  $("to-title").addEventListener("click", () => showTitle());
  muteBtn.addEventListener("click", () => {
    audio.ensure();
    audio.toggle();
  });

  const stickEl = $("stick");
  const knob = $("knob");
  let pointerId = null;
  const moveKnob = (clientX, clientY) => {
    const rect = stickEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const max = 42;
    const mag = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(max, mag);
    dx = (dx / mag) * clamped;
    dy = (dy / mag) * clamped;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stick.x = dx / max;
    stick.z = dy / max;
  };
  stickEl.addEventListener("pointerdown", (e) => {
    pointerId = e.pointerId;
    stickEl.setPointerCapture(e.pointerId);
    stick.active = true;
    moveKnob(e.clientX, e.clientY);
  });
  stickEl.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointerId) return;
    moveKnob(e.clientX, e.clientY);
  });
  const endStick = (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    stick.active = false;
    stick.x = 0;
    stick.z = 0;
    knob.style.transform = "translate(0px, 0px)";
  };
  stickEl.addEventListener("pointerup", endStick);
  stickEl.addEventListener("pointercancel", endStick);
  $("btn-jump").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    jumpBuffer = 0.14;
  });
  $("btn-dash").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dashBuffer = 0.14;
  });

  const coarse = matchMedia("(pointer: coarse)").matches;
  if (coarse || FORCE_TOUCH) document.body.classList.add("touch");
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

function setPause(paused) {
  if (paused && state === "play") {
    state = "pause";
    document.body.dataset.state = "pause";
    audio.ctx?.suspend();
    $("resume").focus();
  } else if (!paused && state === "pause") {
    state = "play";
    document.body.dataset.state = "play";
    audio.ctx?.resume();
    last = performance.now();
  }
}

function currentPlatform() {
  let best = null;
  let bestDy = 1e9;
  for (const p of platforms) {
    if (player.pos.x < p.box.min.x - 0.05 || player.pos.x > p.box.max.x + 0.05) continue;
    if (player.pos.z < p.box.min.z - 0.05 || player.pos.z > p.box.max.z + 0.05) continue;
    const surface = p.box.max.y + RADIUS;
    const dy = Math.abs(player.pos.y - surface);
    if (player.pos.y >= surface - 0.35 && dy < bestDy) {
      bestDy = dy;
      best = p;
    }
  }
  return bestDy < 1.1 ? best : null;
}

function edgeDistance(platform, dirX, dirZ) {
  let tx = Infinity;
  let tz = Infinity;
  if (dirX > 0.02) tx = (platform.box.max.x - player.pos.x) / dirX;
  else if (dirX < -0.02) tx = (platform.box.min.x - player.pos.x) / dirX;
  if (dirZ > 0.02) tz = (platform.box.max.z - player.pos.z) / dirZ;
  else if (dirZ < -0.02) tz = (platform.box.min.z - player.pos.z) / dirZ;
  return Math.min(tx, tz);
}

function buildWaypoints() {
  const wps = [];
  const start = platforms[0];
  wps.push({ x: routeX(start), z: start.maxZ - 3.6, on: start.name });
  for (let i = 1; i < platforms.length; i++) {
    const prev = platforms[i - 1];
    const p = platforms[i];
    const joined = zJoined(prev, p);
    wps.push({
      x: routeX(p),
      z: p.z,
      on: p.name,
      jump: !joined,
      gap: joined ? 0 : edgeGap(prev, p),
      ride: p.move?.axis === "x" ? p.name : null,
    });
    const after = platforms[i + 1];
    if (p.move?.axis === "y" && after && after.baseTop > p.baseTop + 0.35) {
      wps.push({ x: routeX(p), z: p.z, on: p.name, waitFor: after.name });
    }
    if (after && (p.lane != null || p.role === "hall" || p.role === "spikes")) {
      const exitX = containsX(p, routeX(after)) ? routeX(after) : routeX(p);
      wps.push({ x: exitX, z: p.minZ + 0.9, on: p.name });
    }
  }
  return wps;
}

let waypoints = [];

function applyBot() {
  if (!waypoints.length) waypoints = buildWaypoints();
  if (botWp >= waypoints.length || state !== "play") {
    scripted.active = false;
    return;
  }
  const goal = waypoints[botWp];
  const here = currentPlatform() || lastGround;
  let aimX = goal.x;
  let aimZ = goal.z;
  if (goal.ride) {
    const ride = byName(goal.ride);
    aimX = ride.x;
    aimZ = ride.z;
  }
  if (goal.waitFor) {
    const lift = byName(goal.on);
    const dest = byName(goal.waitFor);
    aimX = lift.x;
    aimZ = lift.z;
    if (lift.top + 0.12 >= dest.baseTop && here?.name === lift.name) botWp += 1;
  }
  let dx = aimX - player.pos.x;
  let dz = aimZ - player.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 0.001) {
    dx /= dist;
    dz /= dist;
  }
  let jump = false;
  let dash = false;
  if (goal.jump && grounded && here && here.name !== goal.on) {
    const edge = edgeDistance(here, dx, dz);
    const speed = Math.hypot(player.vel.x, player.vel.z);
    const needed = Math.min(5.6, 2.1 + Math.max(0, goal.gap) * 0.85);
    if (edge < 0.62 && speed >= needed) {
      jump = true;
      if (goal.gap > 2.95) dash = true;
    } else if (edge < 0.5 && speed < needed) {
      const back = edgeDistance(here, -dx, -dz);
      if (back > 1.1) {
        dx = -dx;
        dz = -dz;
      } else if (edge < 0.35) {
        jump = true;
        if (goal.gap > 2.4) dash = true;
      }
    }
  }
  const arrived = here?.name === goal.on && dist < (goal.jump ? 1.15 : 0.7) && grounded;
  if (arrived && !goal.waitFor) botWp += 1;
  scripted.active = true;
  scripted.x = dx;
  scripted.z = dz;
  scripted.jump = jump;
  scripted.dash = dash;
}

function gapReport() {
  const lines = [];
  for (let i = 0; i < platforms.length - 1; i++) {
    const a = platforms[i];
    const b = platforms[i + 1];
    lines.push(`${a.name}->${b.name} zGap ${(a.minZ - b.maxZ).toFixed(2)} dy ${(b.baseTop - a.baseTop).toFixed(2)}`);
  }
  return lines.join("\n");
}

function assertCourse(assert) {
  const label = LEVELS[levelIndex].name;
  const fails = [];
  for (const p of platforms) {
    p.body.updateWorldMatrix(true, true);
    const bb = new THREE.Box3().setFromObject(p.body);
    const checks = [
      [Math.abs(bb.max.y - p.baseTop) < 0.03, `${p.name} mesh top`],
      [Math.abs(bb.min.y - (p.baseTop - p.h)) < 0.03, `${p.name} mesh bottom`],
      [Math.abs((bb.max.x - bb.min.x) - p.w) < 0.04, `${p.name} mesh width`],
      [Math.abs((bb.max.z - bb.min.z) - p.d) < 0.04, `${p.name} mesh depth`],
    ];
    for (const [ok, msg] of checks) if (!ok) fails.push(msg);
  }
  assert(fails.length === 0, fails.length ? `${label} geometry: ${fails.join(", ")}` : `${label} geometry`);
  assert(platforms[0]?.name === "start" && platforms.at(-1)?.name === "gate", `${label} runs from start to gate`);
  for (let i = 0; i < platforms.length - 1; i++) {
    const a = platforms[i];
    const b = platforms[i + 1];
    const joined = zJoined(a, b);
    const dy = b.baseTop - a.baseTop;
    if (joined) assert(containsX(a, routeX(b)), `${label} ${a.name} can walk onto ${b.name}`);
    else assert(edgeGap(a, b) <= 3.45, `${label} ${a.name}->${b.name} gap ${edgeGap(a, b).toFixed(2)}`);
    if (dy > 1.2) {
      const crest = a.move?.axis === "y" && a.baseTop + a.move.amp + 0.08 >= b.baseTop;
      assert(crest, `${label} ${a.name} lift reaches ${b.name}`);
    }
    if (a.lane != null) assert(containsX(a, routeX(a)), `${label} ${a.name} lane is on the stone`);
  }
  for (const pen of pendulums) {
    let worst = -Infinity;
    for (let i = 0; i <= 24; i++) {
      pen.pivot.rotation.z = Math.sin((i / 24) * Math.PI * 2) * pen.amp;
      pen.pivot.updateWorldMatrix(true, true);
      const bb = new THREE.Box3().setFromObject(pen.blade);
      worst = Math.max(worst, bb.max.x);
    }
    const lane = pen.host.x + pen.host.lane;
    assert(worst < lane - RADIUS - 0.35, `${label} pendulum stays off the lamp lane (reaches ${worst.toFixed(2)}, lane ${lane.toFixed(2)})`);
  }
  updateAnimations(0);
  for (const spike of spikes) {
    const clear = Math.abs(spike.x - routeX(spike.host)) - spike.r;
    assert(clear > 0.9, `${label} route clears the spikes (${clear.toFixed(2)})`);
  }
}

function selfTest() {
  const results = [];
  const assert = (cond, msg) => {
    results.push(`${cond ? "ok" : "FAIL"}  ${msg}`);
    return cond;
  };

  levelIndex = 0;
  begin();
  assertCourse(assert);
  scripted.active = false;
  for (let i = 0; i < 20; i++) step(1 / 60);
  assert(grounded, "settles onto the start isle");
  assert(lastGround?.name === "start", "standing on start");

  camera.updateMatrixWorld(true);
  const camFwd = new THREE.Vector3();
  camera.getWorldDirection(camFwd);
  camFwd.y = 0;
  camFwd.normalize();
  const camRight = new THREE.Vector3().crossVectors(camFwd, new THREE.Vector3(0, 1, 0));
  assert(camFwd.z < -0.98 && Math.abs(camFwd.x) < 0.03, `camera forward is −Z (${camFwd.x.toFixed(2)}, ${camFwd.z.toFixed(2)})`);
  assert(camRight.x > 0.98 && Math.abs(camRight.z) < 0.03, `camera right is +X (${camRight.x.toFixed(2)}, ${camRight.z.toFixed(2)})`);

  const noseWorld = new THREE.Vector3();
  const rigWorld = new THREE.Vector3();
  const modelFront = () => {
    rig.updateWorldMatrix(true, true);
    nose.getWorldPosition(noseWorld);
    rig.getWorldPosition(rigWorld);
    return noseWorld.sub(rigWorld).setY(0).normalize();
  };

  const press = (code, frames) => {
    keys.add(code);
    if (code === "Space") jumpBuffer = 0.14;
    for (let i = 0; i < frames; i++) step(1 / 60);
  };
  const release = (code) => keys.delete(code);

  const origin = () => {
    const pad = byName("start");
    player.pos.set(pad.x, pad.top + RADIUS + 0.3, pad.z);
    player.vel.set(0, 0, 0);
    for (let i = 0; i < 15; i++) step(1 / 60);
  };

  for (const [code, axis, sign] of [
    ["KeyD", "r", +1],
    ["KeyA", "r", -1],
    ["KeyW", "f", +1],
    ["KeyS", "f", -1],
    ["ArrowRight", "r", +1],
    ["ArrowUp", "f", +1],
  ]) {
    origin();
    camera.updateMatrixWorld(true);
    const f = new THREE.Vector3();
    camera.getWorldDirection(f);
    f.y = 0;
    f.normalize();
    const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0));
    const basis = { f, r };
    const p0 = player.pos.clone();
    press(code, 36);
    const d = player.pos.clone().sub(p0);
    d.y = 0;
    const along = d.lengthSq() > 0 ? d.clone().normalize().dot(basis[axis]) * sign : 0;
    assert(d.length() > 0.8, `${code} moves (${d.length().toFixed(2)})`);
    assert(along > 0.9, `${code} matches the camera (${along.toFixed(2)})`);
    rig.updateWorldMatrix(true, true);
    const facing = new THREE.Vector3(0, 0, -1).applyQuaternion(rig.quaternion);
    const face = d.lengthSq() > 0 ? facing.dot(d.clone().normalize()) : 0;
    assert(face > 0.9, `${code} wisp faces its travel (${face.toFixed(2)})`);
    const front = modelFront();
    const noseDot = front.dot(facing);
    assert(noseDot > 0.9, `${code} nose matches heading (${noseDot.toFixed(2)})`);
    release(code);
  }

  origin();
  const y0 = player.pos.y;
  press("Space", 4);
  release("Space");
  let apex = y0;
  let landed = false;
  for (let i = 0; i < 80; i++) {
    step(1 / 60);
    apex = Math.max(apex, player.pos.y);
    if (i > 10 && grounded) landed = true;
  }
  assert(apex > y0 + 0.9, `jump rises (${(apex - y0).toFixed(2)})`);
  assert(landed, "jump lands back on stone");

  const indices = devLevel == null ? LEVELS.map((_, i) => i) : [devLevel];
  for (const n of indices) {
    levelIndex = n;
    begin();
    if (n !== 0) assertCourse(assert);
    waypoints = buildWaypoints();
    botWp = 0;
    botStuck = 0;
    let failWhy = "";
    const limit = 60 * (55 + platforms.length * 8);
    for (let i = 0; i < limit && state === "play"; i++) {
      applyBot();
      step(1 / 60);
      if (lives < 3) {
        failWhy = `lost a life near ${lastGround?.name || "?"} at (${player.pos.x.toFixed(1)}, ${player.pos.z.toFixed(1)}) wp ${botWp} ${waypoints[botWp]?.on || ""}`;
        break;
      }
      if (i % 45 === 0) {
        if (botLast.distanceTo(player.pos) < 0.2 && !(waypoints[botWp]?.waitFor)) botStuck += 1;
        else botStuck = 0;
        botLast.copy(player.pos);
        if (botStuck > 8) {
          failWhy = `stuck at wp ${botWp} ${waypoints[botWp]?.on} pos (${player.pos.x.toFixed(1)}, ${player.pos.z.toFixed(1)})`;
          break;
        }
      }
    }
    scripted.active = false;
    const name = LEVELS[n].name;
    const routeShards = shards.filter((s) => !s.bonus).length;
    assert(!failWhy, failWhy ? `${name}: ${failWhy}` : `${name} bot stays on the isles`);
    assert(state === "won", `${name} bot reaches the gate (state ${state}, wp ${botWp}/${waypoints.length})`);
    assert(lives === 3, `${name} bot keeps all lives (${lives})`);
    assert(shardsGot >= routeShards - 1, `${name} bot gathers the path shards (${shardsGot}/${routeShards})`);
  }

  const pass = results.every((line) => line.startsWith("ok"));
  const report = [`Lumen Run self-test: ${pass ? "PASS" : "FAIL"}`, "", gapReport(), "", ...results].join("\n");
  selftestEl.hidden = false;
  selftestEl.classList.toggle("fail", !pass);
  selftestEl.textContent = report;
  window.__SELFTEST = { pass, report };
  console.log(report);
  return pass;
}

function boot() {
  window.__BOOTED = true;
  for (let i = 0; i < 3; i++) {
    const pip = document.createElement("span");
    pip.className = "pip on";
    pipsEl.appendChild(pip);
  }
  paintAudio();
  const prog = loadProgress();
  selectedIndex = Math.min(prog.unlocked || 0, LEVELS.length - 1);
  if (devLevel != null) selectedIndex = devLevel;
  levelIndex = selectedIndex;
  makeRenderer();
  buildAvatar();
  bindInput();
  if (SELFTEST) selfTest();
  else if (AUTO || WATCH_BOT) begin();
  else {
    mountLevel(selectedIndex);
    showTitle();
  }
  requestAnimationFrame(frame);
  window.__game = { step, begin, player, camera, platforms, get state() { return state; } };
}

try {
  boot();
} catch (err) {
  console.error(err);
  const el = $("boot-error");
  el.hidden = false;
  el.textContent = `The scene didn’t start. ${err?.message || err}`;
  if (SELFTEST) {
    selftestEl.hidden = false;
    selftestEl.classList.add("fail");
    selftestEl.textContent = `FAIL\n${err?.stack || err}`;
    window.__SELFTEST = { pass: false, report: selftestEl.textContent };
  }
}

setTimeout(() => {
  if (!window.__BOOTED) $("boot-error").hidden = false;
}, 8000);
