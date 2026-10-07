import * as THREE from 'three'
import { ZONE_LABEL } from './constants.js'
import { createAudio } from './audio.js'
import { createInput } from './input.js'
import { createGame, step, update } from './sim.js'
import { createView } from './view.js'
import './style.css'

const canvas = document.getElementById('c')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const view = createView(canvas, { reduceMotion })
const audio = createAudio()
const input = createInput(canvas, {
  left: document.getElementById('btn-left'),
  right: document.getElementById('btn-right'),
  jump: document.getElementById('btn-jump'),
  down: document.getElementById('btn-down'),
})

const hud = document.getElementById('hud')
const title = document.getElementById('title')
const pauseEl = document.getElementById('pause')
const overEl = document.getElementById('over')
const touch = document.getElementById('touch')
const callout = document.getElementById('callout')
const hint = document.getElementById('hint')
const flash = document.getElementById('flash')
const vignette = document.getElementById('vignette')
const scoreEl = document.getElementById('score')
const bestEl = document.getElementById('best')
const titleBest = document.getElementById('title-best')
const zoneEl = document.getElementById('zone')
const multEl = document.getElementById('mult')
const comboEl = document.getElementById('combo')
const kmhEl = document.getElementById('kmh')
const metersEl = document.getElementById('meters')
const muteBtn = document.getElementById('mute')
const pauseBtn = document.getElementById('pause-btn')

const BEST_KEY = 'shred-street-3d-best'
let best = loadBest()
let game = createGame(1)
let mode = 'title'
let overTimer = 0
let shownScore = -1
let shownBest = -1
let shownZone = ''
let shownMeters = -1
let shownKmh = -1

titleBest.textContent = fmt(best)
bestEl.textContent = fmt(best)

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

function saveBest(value) {
  best = value
  try {
    localStorage.setItem(BEST_KEY, String(value))
  } catch {
    /* private mode */
  }
}

function fmt(n) {
  return Math.floor(n).toLocaleString('en-US')
}

function show(modeName) {
  mode = modeName
  const playing = modeName === 'play' || modeName === 'crashing'
  title.hidden = modeName !== 'title'
  pauseEl.hidden = modeName !== 'pause'
  overEl.hidden = modeName !== 'over'
  hud.hidden = !playing && modeName !== 'pause'
  touch.hidden = modeName !== 'play'
  pauseBtn.hidden = modeName !== 'play' && modeName !== 'pause'
}

function clearEdges() {
  input.left = false
  input.right = false
  input.pending = 0
  input.jump = false
  input.pause = false
  input.mute = false
}

function start() {
  window.clearTimeout(overTimer)
  audio.start()
  game = createGame((Math.random() * 1e9) >>> 0)
  clearEdges()
  show('play')
  shownScore = -1
}

function finish(event) {
  const score = event.score
  const isBest = score > best
  if (isBest) saveBest(score)
  document.getElementById('final-score').textContent = fmt(score)
  document.getElementById('final-dist').textContent = `${event.distance} m`
  document.getElementById('final-coins').textContent = String(event.coins)
  document.getElementById('final-perfects').textContent = String(event.perfects)
  document.getElementById('final-best').textContent = fmt(best)
  document.getElementById('new-best').hidden = !isBest
  titleBest.textContent = fmt(best)
  show('crashing')
  window.clearTimeout(overTimer)
  overTimer = window.setTimeout(() => {
    if (mode === 'crashing') show('over')
  }, 720)
}

function pop(el, text, className, ms) {
  el.hidden = false
  el.className = className
  el.textContent = text
  el.classList.remove('pop')
  void el.offsetWidth
  el.classList.add('pop')
  el.dataset.until = String(performance.now() + ms)
}

function flashScreen() {
  flash.classList.add('on')
  window.setTimeout(() => flash.classList.remove('on'), 70)
}

function handleEvents(events) {
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.type === 'coin') {
      audio.coin(event.combo)
      view.burst(0xffd24a, 7, 3.2)
    } else if (event.type === 'jump') {
      audio.jump()
    } else if (event.type === 'perfect') {
      audio.perfect()
      flashScreen()
      pop(callout, event.label, `callout ${event.label === 'PERFECT' ? 'perfect' : 'sick'}`, 880)
      view.burst(0x39f3ff, 18, 6)
    } else if (event.type === 'boost') {
      audio.boost()
      pop(callout, 'SPEED +', 'callout boost', 760)
    } else if (event.type === 'zone') {
      pop(callout, ZONE_LABEL[event.zone], 'callout zone', 1400)
    } else if (event.type === 'hint') {
      pop(hint, event.text, 'hint', 2600)
    } else if (event.type === 'land') {
      audio.land()
      view.burst(0xfff8ea, 8, 2.4)
    } else if (event.type === 'crash') {
      audio.crash()
      finish(event)
    }
  }
}

function syncHud() {
  const score = Math.floor(game.score)
  if (score !== shownScore) {
    shownScore = score
    scoreEl.textContent = fmt(score)
  }
  if (best !== shownBest) {
    shownBest = best
    bestEl.textContent = fmt(best)
  }
  const label = ZONE_LABEL[game.zone]
  if (label !== shownZone) {
    shownZone = label
    zoneEl.textContent = label
  }
  const meters = Math.floor(game.distance)
  if (meters !== shownMeters) {
    shownMeters = meters
    metersEl.textContent = `${meters} m`
  }
  const kmh = Math.round(game.player.speed * 3.6)
  if (kmh !== shownKmh) {
    shownKmh = kmh
    kmhEl.textContent = `${kmh} km/h`
  }
  if (game.multiplier > 1) {
    multEl.hidden = false
    multEl.textContent = `2×  ${Math.max(0, game.multiplierTime).toFixed(1)}s`
  } else {
    multEl.hidden = true
  }
  comboEl.textContent = game.combo > 1 ? `${game.combo}× combo` : ''
  const speedT = Math.min(1, Math.max(0, (game.player.speed - 12) / 24))
  vignette.style.opacity = String(0.18 + speedT * 0.62)
  const now = performance.now()
  if (!callout.hidden && now > Number(callout.dataset.until || 0)) callout.hidden = true
  if (!hint.hidden && now > Number(hint.dataset.until || 0)) hint.hidden = true
}

document.getElementById('play').addEventListener('click', start)
document.getElementById('retry').addEventListener('click', start)
document.getElementById('resume').addEventListener('click', () => {
  if (mode === 'pause') show('play')
})
pauseBtn.addEventListener('click', () => {
  if (mode === 'play') show('pause')
  else if (mode === 'pause') show('play')
})
muteBtn.addEventListener('click', () => {
  audio.start()
  const muted = audio.toggleMute()
  muteBtn.textContent = muted ? '×' : '♪'
  muteBtn.setAttribute('aria-pressed', String(muted))
  muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute')
})

window.addEventListener('keydown', (event) => {
  if (event.repeat) return
  if ((event.code === 'Space' || event.code === 'Enter') && (mode === 'title' || mode === 'over')) {
    event.preventDefault()
    start()
  }
})
window.addEventListener('pointerdown', () => audio.start(), { once: false })
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play') show('pause')
})

window.__selfTestControls = () => {
  window.__pauseLoop = true
  const notes = []
  const check = (ok, msg) => {
    notes.push(`${ok ? 'ok' : 'FAIL'}: ${msg}`)
    if (!ok) console.error(msg)
  }
  try {
    if (mode !== 'play') start()
    game.player.x = 0
    game.player.lane = 1
    game.player.lean = 0
    view.render(game, 1 / 60, 0, 'play')
    view.camera.updateMatrixWorld(true)
    const fwd = new THREE.Vector3()
    view.camera.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0))
    check(fwd.z < -0.85, `camera forward ${fwd.z.toFixed(2)}`)
    check(right.x > 0.85, `camera right ${right.x.toFixed(2)}`)
    const x0 = game.player.x
    const z0 = game.player.z
    step(game, { left: false, right: true, jump: false, down: false }, 1 / 60)
    for (let i = 0; i < 24; i++) step(game, { left: false, right: false, jump: false, down: false }, 1 / 60)
    check(game.player.x > x0 + 0.4, `right moved +x ${(game.player.x - x0).toFixed(2)}`)
    check(game.player.z < z0, 'travel is −Z')
    view.render(game, 1 / 60, 0.2, 'play')
    const nose = new THREE.Vector3()
    const tail = new THREE.Vector3()
    view.skater.getObjectByName('nose').getWorldPosition(nose)
    view.skater.getObjectByName('tail').getWorldPosition(tail)
    const front = nose.clone().sub(tail).setY(0).normalize()
    const facing = new THREE.Vector3(0, 0, -1).applyQuaternion(view.skater.quaternion)
    check(front.dot(facing) > 0.85, `asset faces heading ${front.dot(facing).toFixed(2)}`)
    check(facing.dot(new THREE.Vector3(0, 0, -1)) > 0.85, 'heading matches travel')
    return notes
  } finally {
    window.__pauseLoop = false
  }
}

show('title')
let last = performance.now()
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (input.mute) {
    input.mute = false
    const muted = audio.toggleMute()
    muteBtn.textContent = muted ? '×' : '♪'
    muteBtn.setAttribute('aria-pressed', String(muted))
  }
  if (input.pause) {
    input.pause = false
    if (mode === 'play') show('pause')
    else if (mode === 'pause') show('play')
  }
  input.refreshDown()
  if (mode === 'play' && !window.__pauseLoop) handleEvents(update(game, input, dt))
  audio.tick({
    mode,
    zone: game.zone,
    speed: game.player.speed,
    grounded: game.player.grounded,
  })
  view.render(game, dt, now / 1000, mode === 'title' ? 'title' : 'play')
  if (mode === 'play' || mode === 'crashing' || mode === 'pause') syncHud()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
