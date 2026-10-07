export function createAudio() {
  let ctx = null
  let master = null
  let musicGain = null
  let sfxGain = null
  let wheelGain = null
  let wheelFilter = null
  let started = false
  let muted = false
  let nextNote = 0
  let stepIndex = 0

  function ensure() {
    if (ctx) return ctx
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.9
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 18
    comp.ratio.value = 8
    comp.attack.value = 0.004
    comp.release.value = 0.18
    master.connect(comp)
    comp.connect(ctx.destination)
    musicGain = ctx.createGain()
    musicGain.gain.value = 0.16
    musicGain.connect(master)
    sfxGain = ctx.createGain()
    sfxGain.gain.value = 0.8
    sfxGain.connect(master)
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1
      last = last * 0.96 + white * 0.04
      data[i] = last * 4
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    wheelFilter = ctx.createBiquadFilter()
    wheelFilter.type = 'bandpass'
    wheelFilter.frequency.value = 280
    wheelFilter.Q.value = 0.7
    wheelGain = ctx.createGain()
    wheelGain.gain.value = 0
    source.connect(wheelFilter)
    wheelFilter.connect(wheelGain)
    wheelGain.connect(sfxGain)
    source.start()
    return ctx
  }

  function envGain(at, peak, dur, destination) {
    const g = ctx.createGain()
    g.connect(destination)
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), at + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    return g
  }

  function tone(at, freq, dur, type, peak, destination, slideTo) {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, at)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), at + dur)
    const g = envGain(at, peak, dur, destination)
    osc.connect(g)
    osc.start(at)
    osc.stop(at + dur + 0.02)
  }

  function noise(at, dur, peak, destination, from, to) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      last = last * 0.85 + white * 0.15
      data[i] = last
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(from, at)
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, to), at + dur)
    const g = envGain(at, peak, dur, destination)
    source.connect(filter)
    filter.connect(g)
    source.start(at)
    source.stop(at + dur + 0.02)
  }

  function schedule(step, time, zone) {
    const bar = step % 8
    if (bar % 2 === 0) tone(time, 150, 0.08, 'sine', 0.9, musicGain)
    if (bar === 2 || bar === 6) noise(time, 0.09, 0.35, musicGain, 1800, 900)
    if (bar % 2 === 1) noise(time, 0.03, 0.12, musicGain, 5000, 4000)
    else noise(time, 0.02, 0.07, musicGain, 6000, 5000)
    const bass = [55, 55, 65.4, 55, 73.4, 49, 82.4, 55]
    if (bar % 2 === 0) {
      const f = bass[(step / 2) % bass.length] * (zone === 'downtown' ? 1 : 1)
      tone(time, f, 0.18, 'sawtooth', zone === 'downtown' ? 0.18 : 0.13, musicGain)
    }
    if (zone !== 'suburbs' && bar === 4) tone(time, 440, 0.12, 'square', 0.05, musicGain, 660)
    if (zone === 'downtown' && bar === 7) tone(time, 523, 0.1, 'square', 0.045, musicGain)
  }

  return {
    start() {
      const audio = ensure()
      if (!audio) return
      if (audio.state === 'suspended') audio.resume()
      started = true
      nextNote = audio.currentTime + 0.05
    },
    toggleMute() {
      muted = !muted
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.03)
      return muted
    },
    get muted() {
      return muted
    },
    tick(info) {
      if (!started || !ctx) return
      const grounded = info.mode === 'play' && info.grounded
      const vol = grounded ? Math.min(0.07, 0.02 + info.speed * 0.0015) : 0
      wheelGain.gain.setTargetAtTime(vol, ctx.currentTime, 0.05)
      wheelFilter.frequency.setTargetAtTime(170 + info.speed * 18, ctx.currentTime, 0.08)
      if (muted) return
      const bpm = info.zone === 'downtown' ? 156 : info.zone === 'park' ? 138 : 124
      const eighth = 60 / bpm / 2
      let guard = 0
      while (nextNote < ctx.currentTime + 0.25 && guard++ < 8) {
        schedule(stepIndex, nextNote, info.zone)
        stepIndex += 1
        nextNote += eighth
      }
    },
    coin(combo) {
      if (!ctx || muted) return
      const freq = 620 * Math.pow(2, Math.min(combo, 14) / 12)
      tone(ctx.currentTime, freq, 0.09, 'square', 0.18, sfxGain)
    },
    jump() {
      if (!ctx || muted) return
      noise(ctx.currentTime, 0.16, 0.22, sfxGain, 500, 1800)
    },
    perfect() {
      if (!ctx || muted) return
      const t = ctx.currentTime
      tone(t, 523, 0.18, 'square', 0.16, sfxGain)
      tone(t + 0.04, 659, 0.2, 'square', 0.14, sfxGain)
      tone(t + 0.08, 784, 0.24, 'sawtooth', 0.1, sfxGain)
    },
    boost() {
      if (!ctx || muted) return
      tone(ctx.currentTime, 180, 0.28, 'sawtooth', 0.12, sfxGain, 720)
    },
    crash() {
      if (!ctx || muted) return
      noise(ctx.currentTime, 0.4, 0.5, sfxGain, 400, 70)
      tone(ctx.currentTime, 140, 0.3, 'sawtooth', 0.2, sfxGain, 50)
    },
    land() {
      if (!ctx || muted) return
      noise(ctx.currentTime, 0.08, 0.12, sfxGain, 300, 120)
    },
  }
}
