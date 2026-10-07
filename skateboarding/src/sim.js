import { makeRng } from './rng.js'
import {
  BEHIND,
  CHUNK_LEN,
  COIN_R,
  CROUCH_H,
  DOWN_ACCEL,
  FAST_G,
  SPEED_MAX,
  SPEED_MIN,
  UP_BRAKE,
  FIXED_DT,
  GRAVITY,
  JUMP_V,
  LANE_X,
  LOOKAHEAD,
  PLAYER_R,
  ROW_LEN,
  ROWS,
  STAND_H,
  baseCruise,
  cruiseCap,
  zoneAt,
} from './constants.js'

const SCRIPT = [
  'straight',
  'arc',
  'straight',
  'straight',
  'block0',
  'straight',
  'block2',
  'straight',
  'log',
  'straight',
  'block_two',
  'straight',
]

const POOLS = {
  suburbs: [
    ['straight', 3],
    ['arc', 1],
    ['block', 4],
    ['block_two', 2],
    ['log', 3],
  ],
  park: [
    ['straight', 2],
    ['block', 2],
    ['block_two', 2],
    ['log', 2],
    ['gap', 3],
    ['gap_long', 2],
    ['slope', 3],
    ['high', 2],
    ['car', 2],
  ],
  downtown: [
    ['straight', 2],
    ['block_two', 2],
    ['car', 2],
    ['gap', 2],
    ['gap_long', 2],
    ['slope', 2],
    ['combo', 3],
    ['gate', 2],
    ['high', 1],
  ],
}

const BLOCKING = new Set([
  'block',
  'block0',
  'block1',
  'block2',
  'block_two',
  'log',
  'gap',
  'gap_long',
  'high',
  'car',
  'combo',
  'gate',
])

const DEFAULTS = {
  block: { halfX: 0.9, halfZ: 0.42, y0: 0, y1: 1.8, tall: true },
  car: { halfX: 0.85, halfZ: 1.05, y0: 0, y1: 1.55, tall: true },
  log: { halfX: 0.9, halfZ: 0.55, y0: 0, y1: 0.5, tall: false },
  bar: { halfX: 0.9, halfZ: 0.3, y0: 1.02, y1: 1.58, tall: false },
  gate: { halfX: 4.1, halfZ: 0.42, y0: 0, y1: 2.15, tall: true },
}

const UP_EDGE = [0, 0.35, 0.8, 1.2, 1.5, 1.6, 1.6]
const DOWN_EDGE = [1.6, 1.25, 0.8, 0.4, 0.12, 0, 0]

function emptyInput() {
  return { left: false, right: false, jump: false, down: false }
}

function flatEdges() {
  return [0, 0, 0, 0, 0, 0, 0]
}

function noHoles() {
  return Array.from({ length: ROWS }, () => [false, false, false])
}

function chunkBase(pattern, kind) {
  return {
    pattern,
    kind,
    edgeY: flatEdges(),
    holes: noHoles(),
    obstacles: [],
    coins: [],
    lips: [],
    boost: false,
  }
}

function coinLine(lane, zStart, count, gap, lift) {
  const out = []
  for (let i = 0; i < count; i++) {
    out.push({ lane, localZ: zStart - i * gap, lift })
  }
  return out
}

function makePattern(name, rng) {
  switch (name) {
    case 'straight': {
      const c = chunkBase('straight', 'flat')
      c.coins = coinLine(1, -3, 6, 3, 1)
      return [c]
    }
    case 'arc': {
      const c = chunkBase('arc', 'flat')
      for (let i = 0; i < 8; i++) {
        const t = i / 7
        c.coins.push({
          localX: LANE_X[0] + (LANE_X[2] - LANE_X[0]) * t,
          localZ: -3 - t * 16,
          lift: 1 + Math.sin(t * Math.PI) * 0.85,
        })
      }
      return [c]
    }
    case 'block':
    case 'block0':
    case 'block1':
    case 'block2': {
      const lane = name === 'block' ? rng.int(3) : Number(name.slice(-1))
      const c = chunkBase(name, 'flat')
      c.obstacles.push({ kind: 'block', lane, localZ: -14 })
      c.coins = coinLine((lane + 1) % 3, -3, 5, 3.2, 1)
      return [c]
    }
    case 'block_two': {
      const open = rng.int(3)
      const c = chunkBase('block_two', 'flat')
      for (let lane = 0; lane < 3; lane++) {
        if (lane !== open) c.obstacles.push({ kind: 'block', lane, localZ: -14 })
      }
      c.coins = coinLine(open, -3, 5, 3.2, 1)
      return [c]
    }
    case 'log': {
      const c = chunkBase('log', 'flat')
      c.obstacles.push({ kind: 'log', lane: null, localZ: -14, halfX: 3.6, halfZ: 0.55, y0: 0, y1: 0.5 })
      c.lips.push({ localZ: -13.45, halfX: 4.2, window: 2.5, cover: 2.4, kind: 'log' })
      for (let i = 0; i < 5; i++) {
        const t = i / 4
        c.coins.push({ lane: 1, localZ: -10 - t * 8, lift: 1.15 + Math.sin(t * Math.PI) * 1.25 })
      }
      return [c]
    }
    case 'gap':
    case 'gap_long': {
      const long = name === 'gap_long'
      const c = chunkBase(name, 'gap')
      const rows = long ? [2, 3] : [2]
      for (const r of rows) c.holes[r] = [true, true, true]
      const start = -rows[0] * ROW_LEN
      const length = rows.length * ROW_LEN
      c.lips.push({ localZ: start, halfX: 4.2, window: 2.7, cover: length + 1, kind: 'gap' })
      for (let i = 0; i < 5; i++) {
        const t = i / 4
        c.coins.push({
          lane: 1,
          localZ: start + 0.6 - t * (length + 1.2),
          lift: 1.25 + Math.sin(t * Math.PI) * 1.35,
        })
      }
      return [c]
    }
    case 'high': {
      const c = chunkBase('high', 'flat')
      c.obstacles.push({ kind: 'bar', lane: null, localZ: -14, halfX: 3.7, halfZ: 0.3, y0: 1.02, y1: 1.58 })
      c.coins = [...coinLine(1, -3, 2, 3, 1), ...coinLine(1, -18, 2, 2.5, 1)]
      return [c]
    }
    case 'car': {
      const lane = rng.int(3)
      const c = chunkBase('car', 'flat')
      c.obstacles.push({ kind: 'car', lane, localZ: -14 })
      c.coins = coinLine((lane + 1) % 3, -3, 5, 3.2, 1)
      return [c]
    }
    case 'slope':
      return slopeParts('slope')
    case 'combo': {
      const parts = slopeParts('combo')
      const open = rng.int(3)
      const hazard = chunkBase('combo', 'flat')
      for (let lane = 0; lane < 3; lane++) {
        if (lane !== open) hazard.obstacles.push({ kind: 'block', lane, localZ: -14 })
      }
      hazard.coins = coinLine(open, -3, 5, 3.2, 1)
      parts.push(hazard)
      return parts
    }
    case 'gate': {
      const c = chunkBase('gate', 'gate')
      c.edgeY = [0, 0.42, 1.0, 0.22, 0, 0, 0]
      c.obstacles.push({
        kind: 'gate',
        lane: null,
        localZ: -14.5,
        halfX: 4.1,
        halfZ: 0.42,
        y0: 0,
        y1: 2.15,
        tall: true,
      })
      c.lips.push({ localZ: -8, halfX: 5, window: 5.4, cover: 8.2, kind: 'gate' })
      for (let i = 0; i < 5; i++) c.coins.push({ lane: 1, localZ: -2 - i * 1.35, lift: 1.05 })
      return [c]
    }
    default:
      return makePattern('straight', rng)
  }
}

function slopeParts(pattern) {
  const up = chunkBase(pattern, 'slope')
  up.edgeY = UP_EDGE.slice()
  const down = chunkBase(pattern, 'slope')
  down.edgeY = DOWN_EDGE.slice()
  down.boost = true
  down.lips.push({ localZ: 0, halfX: 5, window: 2.8, cover: 3.2, kind: 'crest' })
  down.coins = coinLine(1, -2, 6, 3.2, 1.05)
  return [up, down]
}

function weighted(rng, items) {
  let sum = 0
  for (const item of items) sum += item[1]
  let r = rng.float(0, sum)
  for (const item of items) {
    r -= item[1]
    if (r <= 0) return item[0]
  }
  return items[items.length - 1][0]
}

function choosePattern(game, travel) {
  if (game.scriptIndex < SCRIPT.length) return SCRIPT[game.scriptIndex++]

  const zone = zoneAt(Math.max(0, travel))
  if (zone !== 'suburbs' && !game.seen.gap && travel > 1080) return 'gap'
  if (!game.seen.slope && travel > 1400) return 'slope'
  if (zone === 'downtown' && !game.seen.combo && travel > 3120) return 'combo'
  if (zone === 'downtown' && !game.seen.gate && travel > 3450) return 'gate'
  if (game.lastPattern === 'gate') return 'straight'

  let name = weighted(game.rng, POOLS[zone])
  if (name === 'block_two' && travel < 420) name = 'block'
  if ((name === 'gap' || name === 'gap_long') && travel < 1000) name = 'block'
  if (name === 'gap_long' && travel < 1900) name = 'gap'
  if (name === game.lastPattern && name !== 'straight') name = 'straight'

  const need = 12 + Math.max(game.player.cruise, baseCruise(Math.max(0, travel))) * 0.5
  if (BLOCKING.has(name) && travel - game.hazardTravel < need) name = 'straight'
  return name
}

export function heightOnChunk(chunk, z) {
  let dist = chunk.z0 - z
  if (dist < 0) dist = 0
  if (dist > CHUNK_LEN) dist = CHUNK_LEN
  const f = Math.min(ROWS - 0.0001, dist / ROW_LEN)
  const i = Math.floor(f)
  const u = f - i
  return chunk.edgeY[i] * (1 - u) + chunk.edgeY[i + 1] * u
}

function rowIndex(chunk, z) {
  const dist = Math.min(CHUNK_LEN - 1e-4, Math.max(0, chunk.z0 - z))
  return Math.floor(dist / ROW_LEN)
}

function nearestLane(x) {
  let best = 1
  let bestD = Infinity
  for (let i = 0; i < 3; i++) {
    const d = Math.abs(x - LANE_X[i])
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

export function sampleGround(game, z, x) {
  const chunks = game.chunks
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]
    if (z <= c.z0 && z > c.z1) {
      const row = rowIndex(c, z)
      const lane = nearestLane(x)
      return {
        y: heightOnChunk(c, z),
        hole: c.holes[row][lane],
        lane,
        chunk: c,
        row,
      }
    }
  }
  return { y: 0, hole: false, lane: nearestLane(x), chunk: null, row: 0 }
}

function markSeen(game, pattern) {
  game.seen[pattern] = true
  if (pattern === 'gap_long') game.seen.gap = true
  if (pattern === 'block0' || pattern === 'block1' || pattern === 'block2' || pattern === 'block_two' || pattern === 'car') {
    game.seen.block = true
  }
  if (pattern === 'combo') {
    game.seen.slope = true
    game.seen.block = true
  }
  if (pattern === 'gate') game.seen.block = true
}

function dropChunk(list, id) {
  let w = 0
  for (let i = 0; i < list.length; i++) {
    if (list[i].chunkId !== id) list[w++] = list[i]
  }
  list.length = w
}

function addProps(game, chunk) {
  const kinds = {
    suburbs: ['house', 'tree', 'tree', 'lamp'],
    park: ['pine', 'pine', 'rock', 'bush'],
    downtown: ['tower', 'tower', 'sign', 'lamp'],
  }
  const pool = kinds[chunk.zone]
  const n = chunk.zone === 'park' ? 3 : 2
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const localZ = -1.5 - (i + 0.15) * (CHUNK_LEN / n)
      const kind = pool[Math.floor(game.rng.next() * pool.length)]
      const prop = {
        kind,
        x: side * game.rng.float(6.6, 12.4),
        y: 0,
        z: chunk.z0 + localZ,
        rot: game.rng.float(0, Math.PI * 2),
        scale: kind === 'tower' ? game.rng.float(1.15, 2.05) : game.rng.float(0.85, 1.25),
        chunkId: chunk.id,
        zone: chunk.zone,
      }
      chunk.props.push(prop)
      game.props.push(prop)
    }
  }
}

function commit(game, part) {
  const z0 = game.zTip
  const delta = game.roadY - part.edgeY[0]
  const edgeY = Math.abs(delta) > 1e-4 ? part.edgeY.map((y) => y + delta) : part.edgeY
  const z1 = z0 - CHUNK_LEN
  const chunk = {
    id: game.nextId++,
    pattern: part.pattern,
    kind: part.kind,
    boost: part.boost,
    boosted: false,
    zone: zoneAt(Math.max(0, game.zShift - (z0 + z1) / 2)),
    travel: game.zShift - (z0 + z1) / 2,
    z0,
    z1,
    edgeY,
    holes: part.holes,
    obstacles: [],
    coins: [],
    lips: [],
    props: [],
  }

  for (const src of part.obstacles) {
    const def = DEFAULTS[src.kind]
    const localZ = src.localZ
    const ob = {
      ...def,
      ...src,
      chunkId: chunk.id,
      x: src.lane == null ? 0 : LANE_X[src.lane],
      z: z0 + localZ,
      alive: true,
      cleared: false,
    }
    ob.yBase = heightOnChunk(chunk, ob.z)
    chunk.obstacles.push(ob)
    game.obstacles.push(ob)
  }

  for (const src of part.lips) {
    const lip = { ...src, chunkId: chunk.id, x: 0, z: z0 + src.localZ }
    chunk.lips.push(lip)
    game.lips.push(lip)
  }

  for (const src of part.coins) {
    const z = z0 + src.localZ
    // The first chunks also cover the road behind the start. Coins back there
    // sit in the camera and can never be reached.
    if (z > game.player.z - 8) continue
    const coin = {
      x: src.localX != null ? src.localX : LANE_X[src.lane ?? 1],
      y: heightOnChunk(chunk, z) + (src.lift ?? 1),
      z,
      taken: false,
      chunkId: chunk.id,
    }
    chunk.coins.push(coin)
    game.coins.push(coin)
  }

  addProps(game, chunk)
  game.chunks.push(chunk)
  game.zTip = z1
  game.roadY = edgeY[edgeY.length - 1]
  markSeen(game, part.pattern)

  if (game.record) {
    game.spawnLog.push({
      pattern: chunk.pattern,
      zone: chunk.zone,
      travel: chunk.travel,
      holes: chunk.holes.map((row) => row.slice()),
      obstacles: chunk.obstacles.map((ob) => ({
        kind: ob.kind,
        lane: ob.lane,
        localZ: ob.z - z0,
        halfX: ob.halfX,
        halfZ: ob.halfZ,
        tall: ob.tall,
      })),
      lips: chunk.lips.map((lip) => ({
        localZ: lip.z - z0,
        halfX: lip.halfX,
        window: lip.window,
        cover: lip.cover,
        kind: lip.kind,
      })),
    })
  }
  return chunk
}

function spawnNext(game) {
  const travel = game.zShift - game.zTip
  const name = choosePattern(game, travel)
  const parts = makePattern(name, game.rng)
  const chunks = parts.map((part) => commit(game, part))
  if (BLOCKING.has(name)) game.hazardTravel = chunks[chunks.length - 1].travel
  game.lastPattern = name
  return chunks
}

function recycle(game) {
  const limit = game.player.z + BEHIND
  while (game.chunks.length && game.chunks[0].z1 > limit) {
    const old = game.chunks.shift()
    dropChunk(game.obstacles, old.id)
    dropChunk(game.coins, old.id)
    dropChunk(game.lips, old.id)
    dropChunk(game.props, old.id)
  }
}

function ensureTrack(game, limitPerFrame) {
  recycle(game)
  let n = 0
  while (game.zTip > game.player.z - LOOKAHEAD && n < limitPerFrame) {
    spawnNext(game)
    n++
  }
}

function recenter(game) {
  if (game.player.z > -700) return
  const s = 700
  game.player.z += s
  game.zTip += s
  game.zShift += s
  for (const chunk of game.chunks) {
    chunk.z0 += s
    chunk.z1 += s
  }
  const lists = [game.obstacles, game.coins, game.lips, game.props]
  for (const list of lists) {
    for (const item of list) item.z += s
  }
}

function createPlayer() {
  return {
    x: 0,
    y: 0,
    z: 0,
    vy: 0,
    lane: 1,
    speed: 13,
    cruise: 13,
    grounded: true,
    crouch: false,
    coyote: 0.12,
    jumpBuffer: 0,
    invuln: 0,
    flip: 0,
    alive: true,
    lean: 0,
    slopeTime: 0,
  }
}

export function createGame(seed = 1, opts = {}) {
  const game = {
    rng: makeRng(seed),
    seed,
    status: 'playing',
    god: false,
    record: !!opts.record,
    spawnLog: [],
    time: 0,
    distance: 0,
    score: 0,
    coinsCollected: 0,
    perfects: 0,
    combo: 0,
    comboTime: 0,
    multiplier: 1,
    multiplierTime: 0,
    zone: 'suburbs',
    hitStop: 0,
    shake: 0,
    chunks: [],
    obstacles: [],
    coins: [],
    lips: [],
    props: [],
    nextId: 1,
    zTip: 12,
    zShift: 0,
    roadY: 0,
    scriptIndex: 0,
    lastPattern: '',
    hazardTravel: -999,
    seen: { gap: false, slope: false, combo: false, gate: false, high: false, log: false, block: false },
    hinted: { lane: false, jump: false, duck: false, slope: false, gate: false },
    player: createPlayer(),
  }
  while (game.zTip > -LOOKAHEAD) spawnNext(game)
  return game
}

function findLip(game, player) {
  let best = null
  let bestAhead = Infinity
  const lips = game.lips
  for (let i = 0; i < lips.length; i++) {
    const lip = lips[i]
    const ahead = player.z - lip.z
    if (ahead < -0.35 || ahead > lip.window) continue
    if (Math.abs(player.x - lip.x) > lip.halfX) continue
    if (ahead < bestAhead) {
      best = lip
      bestAhead = ahead
    }
  }
  return best ? { lip: best, ahead: bestAhead } : null
}

function crash(game, events, reason) {
  if (game.god || !game.player.alive) return
  const player = game.player
  player.alive = false
  player.speed *= 0.2
  player.vy = 5.5
  game.status = 'over'
  game.shake = 0.85
  events.push({
    type: 'crash',
    reason,
    score: Math.floor(game.score),
    distance: Math.floor(game.distance),
    coins: game.coinsCollected,
    perfects: game.perfects,
  })
}

function tryJump(game, events) {
  const player = game.player
  if (player.jumpBuffer <= 0) return
  if (!player.grounded && player.coyote <= 0) return
  player.jumpBuffer = 0
  player.vy = JUMP_V
  player.grounded = false
  player.coyote = 0
  events.push({ type: 'jump' })

  const found = findLip(game, player)
  if (!found) return
  const { lip, ahead } = found
  const label = ahead < lip.window * 0.45 ? 'PERFECT' : 'SICK'
  const need = lip.window + lip.cover
  player.invuln = Math.max(0.42, need / Math.max(8, player.speed) + 0.12)
  player.flip = 0.48
  game.score += 200 * game.multiplier
  game.multiplier = 2
  game.multiplierTime = 5
  game.perfects += 1
  game.hitStop = 0.08
  game.shake = Math.max(game.shake, 0.38)
  events.push({ type: 'perfect', label })
}

function downhill(chunk, z) {
  const here = heightOnChunk(chunk, z)
  const ahead = heightOnChunk(chunk, z - 0.8)
  return ahead < here - 0.012
}

function maybeHints(game, events) {
  const pz = game.player.z
  const hinted = game.hinted
  if (!hinted.lane || !hinted.jump || !hinted.duck || !hinted.gate) {
    const obstacles = game.obstacles
    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i]
      const ahead = pz - ob.z
      if (ahead < 0 || ahead > 46) continue
      if (!hinted.lane && (ob.kind === 'block' || ob.kind === 'car')) {
        hinted.lane = true
        events.push({ type: 'hint', text: '←  →   SWITCH LANES' })
      } else if (!hinted.jump && ob.kind === 'log') {
        hinted.jump = true
        events.push({ type: 'hint', text: 'SPACE   JUMP' })
      } else if (!hinted.duck && ob.kind === 'bar') {
        hinted.duck = true
        events.push({ type: 'hint', text: '↓   DUCK / FAST-FALL' })
      } else if (!hinted.gate && ob.kind === 'gate') {
        hinted.gate = true
        events.push({ type: 'hint', text: 'JUMP THE GLOWING LIP' })
      }
    }
  }
  if (!hinted.slope) {
    const chunks = game.chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      if (!chunk.boost) continue
      const ahead = pz - chunk.z0
      if (ahead > -2 && ahead < 34) {
        hinted.slope = true
        events.push({ type: 'hint', text: 'RIDE THE DOWNHILL' })
        break
      }
    }
  }
}

export function step(game, input, dt) {
  const events = []
  if (game.status !== 'playing') return events
  const player = game.player
  game.time += dt
  game.shake = Math.max(0, game.shake - dt * 1.8)
  recenter(game)

  if (input.left) player.lane = Math.max(0, player.lane - 1)
  if (input.right) player.lane = Math.min(2, player.lane + 1)
  if (input.jump) player.jumpBuffer = 0.14
  else player.jumpBuffer = Math.max(0, player.jumpBuffer - dt)

  const targetX = LANE_X[player.lane]
  player.x += (targetX - player.x) * (1 - Math.exp(-16 * dt))
  const targetLean = Math.max(-0.42, Math.min(0.42, (targetX - player.x) * -0.55))
  player.lean += (targetLean - player.lean) * (1 - Math.exp(-10 * dt))

  player.z -= player.speed * dt
  const gained = player.speed * dt
  game.distance += gained
  game.score += gained * game.multiplier

  let gravity = GRAVITY
  if (!player.grounded && input.down) gravity += FAST_G
  player.vy -= gravity * dt
  if (player.vy < -36) player.vy = -36
  player.y += player.vy * dt

  const ground = sampleGround(game, player.z, player.x)
  if (ground.hole && game.god) {
    player.y = ground.y
    player.vy = 0
    player.grounded = true
  } else if (ground.hole) {
    player.grounded = false
    if (player.invuln <= 0 && player.vy <= 0 && player.y <= ground.y + 0.08) crash(game, events, 'hole')
  } else if (player.vy <= 0.5 && player.y <= ground.y + 0.35 && player.y >= ground.y - 0.35) {
    const hardLand = !player.grounded && player.vy < -9
    player.y = ground.y
    player.vy = 0
    player.grounded = true
    player.coyote = 0.12
    if (hardLand) {
      game.shake = Math.max(game.shake, 0.22)
      events.push({ type: 'land' })
    }
  } else {
    player.grounded = false
  }

  if (player.grounded) player.coyote = 0.12
  tryJump(game, events)
  if (!player.grounded) player.coyote = Math.max(0, player.coyote - dt)
  player.crouch = !!(input.down && player.grounded)

  const chunk = ground.chunk
  if (player.grounded && chunk && chunk.boost && downhill(chunk, player.z)) {
    player.slopeTime += dt
    if (!chunk.boosted && player.slopeTime > 0.12) {
      chunk.boosted = true
      const cap = cruiseCap(game.zone)
      const next = Math.min(cap, player.cruise * 1.15)
      if (next > player.cruise + 0.04) {
        const from = player.cruise
        player.cruise = next
        player.speed = Math.max(player.speed, next)
        events.push({ type: 'boost', from, to: next })
      } else {
        chunk.boosted = true
      }
    }
  } else if (!chunk || !chunk.boost) {
    player.slopeTime = 0
  }

  const cruiseFloor = Math.min(cruiseCap(game.zone), baseCruise(game.distance))
  if (player.cruise < cruiseFloor) player.cruise = cruiseFloor
  if (player.alive && input.down) {
    player.speed = Math.min(SPEED_MAX, player.speed + DOWN_ACCEL * dt)
  } else if (player.alive && input.up) {
    player.speed = Math.max(SPEED_MIN, player.speed - UP_BRAKE * dt)
  } else if (player.grounded && player.speed < player.cruise) {
    player.speed += (player.cruise - player.speed) * (1 - Math.exp(-0.65 * dt))
  }

  if (player.alive && player.invuln <= 0) {
    const height = player.crouch ? CROUCH_H : STAND_H
    const feet = player.y
    const head = player.y + height
    const obstacles = game.obstacles
    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i]
      if (!ob.alive || ob.cleared) continue
      if (Math.abs(player.z - ob.z) > ob.halfZ + 0.32) continue
      if (Math.abs(player.x - ob.x) > ob.halfX + PLAYER_R) continue
      const bot = ob.yBase + ob.y0
      const top = ob.yBase + ob.y1
      if (head < bot || feet > top) continue
      if (game.god) {
        ob.cleared = true
        continue
      }
      crash(game, events, ob.kind)
      break
    }
  } else if (player.invuln > 0) {
    const obstacles = game.obstacles
    const height = STAND_H
    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i]
      if (ob.cleared) continue
      if (Math.abs(player.z - ob.z) > ob.halfZ + 0.32) continue
      if (Math.abs(player.x - ob.x) > ob.halfX + PLAYER_R) continue
      const bot = ob.yBase + ob.y0
      const top = ob.yBase + ob.y1
      if (player.y + height < bot || player.y > top) continue
      ob.cleared = true
    }
  }

  if (player.alive) {
    const coins = game.coins
    const cy = player.y + 0.9
    for (let i = 0; i < coins.length; i++) {
      const coin = coins[i]
      if (coin.taken) continue
      const dx = player.x - coin.x
      const dy = cy - coin.y
      const dz = player.z - coin.z
      if (dx * dx + dy * dy + dz * dz > COIN_R * COIN_R) continue
      coin.taken = true
      game.coinsCollected += 1
      game.combo = game.comboTime > 0 ? game.combo + 1 : 1
      game.comboTime = 1.15
      const pts = 10 * game.multiplier
      game.score += pts
      events.push({ type: 'coin', combo: game.combo, pts })
    }
  }

  if (player.flip > 0) player.flip = Math.max(0, player.flip - dt)
  if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt)
  if (game.multiplierTime > 0) {
    game.multiplierTime -= dt
    if (game.multiplierTime <= 0) {
      game.multiplierTime = 0
      game.multiplier = 1
    }
  }
  if (game.comboTime > 0) {
    game.comboTime -= dt
    if (game.comboTime <= 0) game.combo = 0
  }

  const zone = zoneAt(game.distance)
  if (zone !== game.zone) {
    game.zone = zone
    events.push({ type: 'zone', zone })
  }

  if (player.y < -3 && player.alive) crash(game, events, 'fall')
  if (game.god && player.y < -1) {
    player.y = 0
    player.vy = 0
    player.grounded = true
  }

  if (player.alive) maybeHints(game, events)
  ensureTrack(game, 3)
  return events
}

function consumeSteer(input) {
  if (typeof input.pending === 'number') {
    if (!input.pending) {
      input.left = false
      input.right = false
      return 0
    }
    const dir = Math.sign(input.pending)
    input.pending -= dir
    input.left = input.pending < 0
    input.right = input.pending > 0
    return dir
  }
  if (input.left === input.right) {
    input.left = false
    input.right = false
    return 0
  }
  const dir = input.left ? -1 : 1
  input.left = false
  input.right = false
  return dir
}

export function update(game, input, dt) {
  if (game.status !== 'playing') return []
  let simDt = dt
  if (game.hitStop > 0) {
    game.hitStop -= dt
    if (game.hitStop < 0) game.hitStop = 0
    simDt = dt * 0.05
  }
  game.acc = (game.acc || 0) + simDt
  const events = []
  let n = 0
  let jump = !!input.jump
  // A short frame, or the slow-motion after a perfect, may not reach a sim
  // step. Leave the tap queued until a step actually consumes it.
  while (game.acc >= FIXED_DT && n < 5) {
    const dir = consumeSteer(input)
    events.push(...step(game, {
      left: dir < 0,
      right: dir > 0,
      jump,
      down: !!input.down,
      up: !!input.up,
    }, FIXED_DT))
    jump = false
    input.jump = false
    game.acc -= FIXED_DT
    n++
  }
  if (n === 5) game.acc = 0
  return events
}

export function debugSpawnPattern(game, name) {
  const parts = makePattern(name, game.rng)
  const chunks = parts.map((part) => commit(game, part))
  if (BLOCKING.has(name)) game.hazardTravel = chunks[chunks.length - 1].travel
  game.lastPattern = name
  return chunks
}

export { emptyInput, BLOCKING }
