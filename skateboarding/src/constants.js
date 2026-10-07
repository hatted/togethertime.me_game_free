/** Travel is world −Z. Lane 0 is −X, which is screen-left with the camera behind the skater. */
export const LANE_X = Object.freeze([-2.2, 0, 2.2])
export const CHUNK_LEN = 24
export const ROWS = 6
export const ROW_LEN = CHUNK_LEN / ROWS
export const LOOKAHEAD = 210
export const BEHIND = 30
export const FIXED_DT = 1 / 60
export const COIN_R = 1.15
export const PLAYER_R = 0.34

export const JUMP_V = 9.35
export const GRAVITY = 32
export const FAST_G = 56
export const STAND_H = 1.62
export const CROUCH_H = 0.82
/** Holding down adds this many m/s each second. Up arrow sheds speed. */
export const DOWN_ACCEL = 10
export const UP_BRAKE = 16
export const SPEED_MIN = 8
export const SPEED_MAX = 72

export const ZONE_LABEL = {
  suburbs: 'THE SUBURBS',
  park: 'THE PARK',
  downtown: 'DOWNTOWN GRIDLOCK',
}

export function zoneAt(distance) {
  if (distance < 1000) return 'suburbs'
  if (distance < 3000) return 'park'
  return 'downtown'
}

export function baseCruise(distance) {
  if (distance < 1000) return 13 + 3 * (distance / 1000)
  if (distance < 3000) return 16 + 5 * ((distance - 1000) / 2000)
  return 21 + 7 * Math.min(1, (distance - 3000) / 3000)
}

export function cruiseCap(zone) {
  if (zone === 'suburbs') return 18
  if (zone === 'park') return 30
  return 36
}

/** Right-hand lane index delta. +1 moves toward +X (screen right). */
export function laneDeltaForCode(code) {
  if (code === 'KeyA' || code === 'ArrowLeft') return -1
  if (code === 'KeyD' || code === 'ArrowRight') return 1
  return 0
}
