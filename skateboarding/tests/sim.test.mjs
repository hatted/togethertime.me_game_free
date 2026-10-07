import assert from 'node:assert/strict'
import { CHUNK_LEN } from '../src/constants.js'
import {
  createGame,
  debugSpawnPattern,
  sampleGround,
  step,
  update,
} from '../src/sim.js'

function hold(down = false) {
  return { left: false, right: false, jump: false, down }
}

function frames(game, n, first = hold(), rest = hold()) {
  const events = []
  for (let i = 0; i < n; i++) events.push(...step(game, i === 0 ? first : rest, 1 / 60))
  return events
}

function place(game, z, x) {
  const ground = sampleGround(game, z, x)
  const player = game.player
  player.z = z
  player.x = x
  player.y = ground.y
  player.vy = 0
  player.grounded = !ground.hole
  player.lane = ground.lane
  return ground
}

function obTravel(entry, ob) {
  return entry.travel - ob.localZ - CHUNK_LEN / 2
}

const fresh = createGame(1)
const z0 = fresh.player.z
frames(fresh, 90)
assert(fresh.player.z < z0 - 5, 'skater moves toward −Z')
assert(fresh.player.alive, 'opening stretch is safe')
assert(fresh.score > 10, 'distance scores points')
assert.equal(fresh.player.lane, 1)

const steer = createGame(2)
step(steer, { left: false, right: true, jump: false, down: false }, 1 / 60)
frames(steer, 30)
assert.equal(steer.player.lane, 2)
assert(steer.player.x > 1, `right lane is +X, got ${steer.player.x}`)

const steerL = createGame(3)
step(steerL, { left: true, right: false, jump: false, down: false }, 1 / 60)
frames(steerL, 30)
assert.equal(steerL.player.lane, 0)
assert(steerL.player.x < -1, `left lane is −X, got ${steerL.player.x}`)

const dropped = createGame(31)
const tap = { left: true, right: false, jump: false, down: false }
update(dropped, tap, 1 / 120)
assert.equal(dropped.player.lane, 1, 'a short frame does not steer yet')
assert.equal(tap.left, true, 'an unconsumed lane tap is kept')
update(dropped, tap, 1 / 120)
assert.equal(dropped.player.lane, 0, 'the kept tap steers on the next step')
assert.equal(tap.left, false)

const slowed = createGame(32)
slowed.hitStop = 0.08
const tapRight = { left: false, right: true, jump: false, down: false }
for (let i = 0; i < 4; i++) update(slowed, tapRight, 1 / 60)
assert.equal(slowed.player.lane, 1, 'hit-stop does not eat the tap')
assert.equal(tapRight.right, true)
for (let i = 0; i < 8 && slowed.player.lane === 1; i++) update(slowed, tapRight, 1 / 60)
assert.equal(slowed.player.lane, 2, 'the tap applies once hit-stop can step')

const mashed = createGame(33)
const queue = { left: false, right: false, jump: false, down: false, pending: 2 }
update(mashed, queue, 1 / 30)
assert.equal(mashed.player.lane, 2, 'two queued taps both change lanes')
assert.equal(queue.pending, 0)

const tuck = createGame(34)
const tuckStart = tuck.player.speed
frames(tuck, 60, hold(true), hold(true))
const midSpeed = tuck.player.speed
assert(midSpeed > tuckStart + 8, `one second of down speeds up (${tuckStart} → ${midSpeed})`)
frames(tuck, 60, hold(true), hold(true))
assert(tuck.player.speed > midSpeed + 8, `holding down longer keeps speeding up (${midSpeed} → ${tuck.player.speed})`)
assert(tuck.player.crouch, 'holding down still ducks')
const peaked = tuck.player.speed
const brake = { left: false, right: false, jump: false, down: false, up: true }
frames(tuck, 30, brake, brake)
assert(tuck.player.speed < peaked - 5, `up arrow slows down (${peaked} → ${tuck.player.speed})`)

const jumper = createGame(4)
const y0 = jumper.player.y
frames(jumper, 20, { left: false, right: false, jump: true, down: false })
assert(jumper.player.y > y0 + 0.4, 'jump leaves the ground')
assert(jumper.player.alive)

const blockGame = createGame(5)
const blockChunks = debugSpawnPattern(blockGame, 'block0')
const block = blockChunks[0].obstacles[0]
assert.equal(block.lane, 0)
place(blockGame, block.z, block.x)
frames(blockGame, 2)
assert.equal(blockGame.player.alive, false, 'a roadblock in your lane crashes you')

const logLive = createGame(6)
const logChunks = debugSpawnPattern(logLive, 'log')
const log = logChunks[0].obstacles[0]
place(logLive, log.z, 0)
logLive.player.y = log.yBase + 1.15
logLive.player.vy = 2
logLive.player.grounded = false
frames(logLive, 3)
assert.equal(logLive.player.alive, true, 'jumping clears a fallen log')

const logDie = createGame(7)
const log2 = debugSpawnPattern(logDie, 'log')[0].obstacles[0]
place(logDie, log2.z, 0)
frames(logDie, 2)
assert.equal(logDie.player.alive, false, 'staying on the ground hits the log')

const holeDie = createGame(8)
const gap = debugSpawnPattern(holeDie, 'gap')[0]
const holeZ = gap.z0 - 10
const holeGround = place(holeDie, holeZ, 0)
assert.equal(holeGround.hole, true)
frames(holeDie, 2)
assert.equal(holeDie.player.alive, false, 'a grounded skater falls into a hole')

const holeLive = createGame(9)
const gap2 = debugSpawnPattern(holeLive, 'gap')[0]
const lip = gap2.z0 - 8
place(holeLive, lip + 2.2, 0)
holeLive.player.speed = 16
holeLive.player.cruise = 16
frames(holeLive, 50, { left: false, right: false, jump: true, down: false })
assert.equal(holeLive.player.alive, true, 'a timed jump clears the hole')
assert(holeLive.player.z < lip - 5, 'the jump carries the skater past the hole')

const duck = createGame(10)
const bar = debugSpawnPattern(duck, 'high')[0].obstacles[0]
place(duck, bar.z, 0)
frames(duck, 3, hold(true), hold(true))
assert.equal(duck.player.alive, true, 'ducking clears the high bar')

const stand = createGame(11)
const bar2 = debugSpawnPattern(stand, 'high')[0].obstacles[0]
place(stand, bar2.z, 0)
frames(stand, 2)
assert.equal(stand.player.alive, false, 'standing hits the high bar')

const slope = createGame(12)
slope.distance = 1600
slope.zone = 'park'
const slopeChunks = debugSpawnPattern(slope, 'slope')
const down = slopeChunks.find((chunk) => chunk.boost)
place(slope, down.z0 - 5, 0)
slope.player.speed = 18
slope.player.cruise = 18
const before = slope.player.cruise
frames(slope, 40)
assert(slope.player.alive, 'riding a slope is safe')
assert(slope.player.cruise >= before * 1.14, `slope should add about 15% speed (${before} → ${slope.player.cruise})`)

const gateLive = createGame(13)
const gateChunk = debugSpawnPattern(gateLive, 'gate')[0]
const gateLip = gateChunk.lips[0]
const gate = gateChunk.obstacles[0]
place(gateLive, gateLip.z + 1.1, 0)
gateLive.player.speed = 22
gateLive.player.cruise = 22
const perfects = frames(gateLive, 1, { left: false, right: false, jump: true, down: false })
assert(perfects.some((e) => e.type === 'perfect'), 'jumping at the lip is a perfect')
assert(gateLive.player.invuln > 0.4, 'perfect grants invulnerability')
assert.equal(gateLive.multiplier, 2)
frames(gateLive, 80)
assert(gateLive.player.z < gate.z - 1, 'invulnerability carries through the gate')
assert.equal(gateLive.player.alive, true, 'a perfect at the gate survives')

const gateDie = createGame(14)
const wall = debugSpawnPattern(gateDie, 'gate')[0].obstacles[0]
place(gateDie, wall.z, 0)
frames(gateDie, 2)
assert.equal(gateDie.player.alive, false, 'missing the gate crashes')

const coined = createGame(15)
const coin = coined.coins.find((c) => !c.taken)
place(coined, coin.z, coin.x)
coined.player.y = coin.y - 0.9
const coinEvents = frames(coined, 2)
assert(coinEvents.some((e) => e.type === 'coin'), 'riding through a coin collects it')
assert(coined.coinsCollected >= 1)

const recorded = createGame(21, { record: true })
assert.equal(recorded.spawnLog[0].pattern, 'straight')
assert.equal(recorded.spawnLog[4].pattern, 'block0')
const firstHazard = recorded.spawnLog
  .flatMap((entry) => entry.obstacles.map((ob) => obTravel(entry, ob)))
  .sort((a, b) => a - b)[0]
assert(firstHazard > 80, `first obstacle should come after a tutorial stretch, at ${firstHazard}m`)

recorded.god = true
for (let i = 0; i < 20000; i++) step(recorded, hold(), 1 / 60)
assert(recorded.player.alive, 'god run stays alive for the audit')
assert(recorded.spawnLog.some((entry) => entry.pattern === 'gap' && entry.zone !== 'suburbs'))
assert(recorded.spawnLog.some((entry) => entry.pattern === 'slope'))
assert(recorded.spawnLog.some((entry) => entry.pattern === 'combo' && entry.zone === 'downtown'))
assert(recorded.spawnLog.some((entry) => entry.pattern === 'gate' && entry.zone === 'downtown'))

for (const entry of recorded.spawnLog) {
  let run = 0
  for (const row of entry.holes) {
    run = row.every(Boolean) ? run + 1 : 0
    assert(run * 4 <= 8.01, `${entry.pattern} hole is longer than a full jump`)
  }
  for (const ob of entry.obstacles) {
    if (!ob.tall || ob.halfX < 3) continue
    const lip = entry.lips.find((item) => item.localZ > ob.localZ && item.localZ - ob.localZ <= item.cover)
    assert(lip, `${entry.pattern} seals the road without a timing lip`)
  }
}

const lanes = []
for (const entry of recorded.spawnLog) {
  for (const ob of entry.obstacles) {
    if (!ob.tall) continue
    const travel = obTravel(entry, ob)
    const covered = ob.halfX > 3 ? [0, 1, 2] : [ob.lane]
    lanes.push({ travel, covered, pattern: entry.pattern, lips: entry.lips, localZ: ob.localZ })
  }
}
lanes.sort((a, b) => a.travel - b.travel)
for (let i = 0; i < lanes.length; i++) {
  const covered = new Set()
  const group = []
  for (let j = i; j < lanes.length && lanes[j].travel - lanes[i].travel < 10; j++) {
    for (const lane of lanes[j].covered) covered.add(lane)
    group.push(lanes[j])
  }
  if (covered.size < 3) continue
  const gated = group.some((item) => item.pattern === 'gate' && item.lips.some((lip) => lip.kind === 'gate'))
  assert(gated, `three lanes blocked within 10m without a gate (${group.map((item) => item.pattern).join(',')})`)
}

console.log('sim tests ok', { distance: Math.floor(recorded.distance), chunks: recorded.spawnLog.length })
