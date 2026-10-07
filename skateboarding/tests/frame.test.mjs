import assert from 'node:assert/strict'
import * as THREE from 'three'
import { placeCamera } from '../src/camera.js'
import { LANE_X, laneDeltaForCode } from '../src/constants.js'
import { buildChunkGeometries } from '../src/geo.js'
import { createSkater } from '../src/skater.js'

function basis(camera) {
  camera.updateMatrixWorld(true)
  const fwd = new THREE.Vector3()
  camera.getWorldDirection(fwd)
  fwd.y = 0
  fwd.normalize()
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0))
  const pinned = new THREE.Vector3(-fwd.z, 0, fwd.x)
  return { fwd, right, pinned }
}

const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.1, 400)
placeCamera(camera, { x: 0, y: 0, z: -30, speed: 16 }, { portrait: false, slope: 0 }, null, 0)
const b = basis(camera)
assert(b.fwd.z < -0.95, `camera forward should be −Z, got ${b.fwd.toArray()}`)
assert(b.right.x > 0.95, `camera right should be +X, got ${b.right.toArray()}`)
assert(b.right.distanceTo(b.pinned) < 1e-4, 'right should match (−fwd.z, 0, fwd.x)')
assert(camera.position.z > -30, 'camera sits behind the skater')

placeCamera(camera, { x: 1.4, y: 0.4, z: -80, speed: 33 }, { portrait: false, slope: 0.4 }, null, 0)
const fast = basis(camera)
assert(fast.fwd.z < -0.9, 'fast camera still looks −Z')
assert(fast.right.x > 0.9, 'fast camera right still +X')
assert(camera.fov > 70, `desktop speed should widen FOV, got ${camera.fov}`)

const deskFov = camera.fov
placeCamera(camera, { x: 0, y: 0, z: 0, speed: 33 }, { portrait: true, slope: 0 }, null, 0)
assert(camera.fov < deskFov, 'portrait FOV stays tighter than the wide desktop rig')

assert.equal(laneDeltaForCode('KeyD'), 1)
assert.equal(laneDeltaForCode('ArrowRight'), 1)
assert.equal(laneDeltaForCode('KeyA'), -1)
assert.equal(laneDeltaForCode('ArrowLeft'), -1)
assert(LANE_X[2] > LANE_X[1] && LANE_X[1] > LANE_X[0], 'lane index +1 is +X')

const skater = createSkater()
skater.updateWorldMatrix(true, true)
const nose = new THREE.Vector3()
const tail = new THREE.Vector3()
skater.getObjectByName('nose').getWorldPosition(nose)
skater.getObjectByName('tail').getWorldPosition(tail)
const modelFront = nose.clone().sub(tail).setY(0).normalize()
const parentForward = new THREE.Vector3(0, 0, -1).applyQuaternion(skater.quaternion)
assert(modelFront.dot(parentForward) > 0.9, `skater front ${modelFront.toArray()} should match parent −Z`)
assert(nose.z < tail.z, 'nose is the −Z end of the board')

const holes = Array.from({ length: 6 }, () => [false, false, false])
const geos = buildChunkGeometries([0, 0, 0, 0, 0, 0, 0], holes)
const normals = geos.road.getAttribute('normal')
assert(normals.getY(0) > 0.5, `road top normal should face +Y, got ${normals.getY(0)}`)

const sloped = buildChunkGeometries([0, 0.4, 0.8, 1.2, 0.8, 0.3, 0], holes)
const sn = sloped.road.getAttribute('normal')
assert(sn.getY(0) > 0.2, 'sloped road top still faces upward')

console.log('frame tests ok')
