import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)
const desired = new THREE.Vector3()
const look = new THREE.Vector3()

function smoothstep(v, a, b) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Portrait sits tighter and narrower. Desktop opens the FOV as speed climbs. */
export function cameraRig(player, portrait) {
  const speedT = smoothstep(player.speed || 0, 12, 36)
  const dist = (portrait ? 6.15 : 8.35) + speedT * (portrait ? 1.05 : 2.45)
  const height = (portrait ? 3.05 : 3.7) + speedT * 0.62
  const lookAhead = portrait ? 5.1 : 7.1
  const fov = (portrait ? 50 : 64) + speedT * (portrait ? 8 : 16)
  return { dist, height, lookAhead, fov, speedT }
}

/**
 * Track forward is world −Z, so the camera lives on +Z and looks toward −Z.
 * With fwd = (0,0,−1), fwd × up = (1,0,0) = screen right = +X = lane 2.
 * This is the only place that basis is built.
 */
export function placeCamera(camera, player, viewport, shake, roll) {
  const rig = cameraRig(player, !!viewport.portrait)
  const slope = viewport.slope || 0
  desired.set(player.x * 0.62, player.y + rig.height, player.z + rig.dist)
  if (shake) desired.add(shake)
  look.set(player.x * 0.12, player.y + 1.15 - slope * 6, player.z - rig.lookAhead)
  camera.position.copy(desired)
  camera.up.copy(UP)
  camera.lookAt(look)
  if (roll) camera.rotateZ(roll)
  if (Math.abs(camera.fov - rig.fov) > 0.01) {
    camera.fov = rig.fov
    camera.updateProjectionMatrix()
  }
  return rig
}
