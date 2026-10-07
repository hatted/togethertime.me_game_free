import * as THREE from 'three'
import { CHUNK_LEN, ROWS, ROW_LEN } from './constants.js'

const ROAD_X0 = -5
const ROAD_X1 = 5
const LANE_EDGES = [-3.3, -1.1, 1.1, 3.3]

function blank() {
  return { pos: [], nrm: [], idx: [], col: null }
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function normalize(n) {
  const l = Math.hypot(n[0], n[1], n[2]) || 1
  return [n[0] / l, n[1] / l, n[2] / l]
}

/** Verts are CCW seen from the side that should be visible. */
function addQuad(data, a, b, c, d, color) {
  const n = normalize(cross(sub(b, a), sub(c, a)))
  const base = data.pos.length / 3
  const verts = [a, b, c, d]
  for (let i = 0; i < 4; i++) {
    const v = verts[i]
    data.pos.push(v[0], v[1], v[2])
    data.nrm.push(n[0], n[1], n[2])
    if (color) data.col.push(color[0], color[1], color[2])
  }
  data.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

function addSlab(data, x0, x1, zA, zB, yA, yB, thick = 0.4) {
  const yA2 = yA - thick
  const yB2 = yB - thick
  // Top, visible from +Y. Proven winding: (x0,zA) (x1,zA) (x1,zB) (x0,zB).
  addQuad(data, [x0, yA, zA], [x1, yA, zA], [x1, yB, zB], [x0, yB, zB])
  addQuad(data, [x0, yA2, zA], [x0, yB2, zB], [x1, yB2, zB], [x1, yA2, zA])
  addQuad(data, [x1, yA, zA], [x1, yA2, zA], [x1, yB2, zB], [x1, yB, zB])
  addQuad(data, [x0, yA, zA], [x0, yB, zB], [x0, yB2, zB], [x0, yA2, zA])
  addQuad(data, [x0, yA, zA], [x0, yA2, zA], [x1, yA2, zA], [x1, yA, zA])
  addQuad(data, [x0, yB, zB], [x1, yB, zB], [x1, yB2, zB], [x0, yB2, zB])
}

function addPillar(data, x, z, yTop) {
  if (yTop < 0.35) return
  const w = 0.18
  addSlab(data, x - w, x + w, z + w, z - w, yTop, yTop, yTop)
}

function toGeometry(data, vertexColors = false) {
  const g = new THREE.BufferGeometry()
  if (data.pos.length === 0) return g
  g.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(data.nrm, 3))
  if (vertexColors && data.col) {
    g.setAttribute('color', new THREE.Float32BufferAttribute(data.col, 3))
  }
  g.setIndex(data.idx)
  return g
}

/**
 * Local space: entrance at z = 0, exit at z = -CHUNK_LEN.
 * edgeY has ROWS+1 samples from entrance to exit.
 * holes[row][lane] removes that lane slab.
 */
export function buildChunkGeometries(edgeY, holes) {
  const road = blank()
  const pit = blank()
  const mark = { pos: [], nrm: [], idx: [], col: [] }
  const curb = blank()

  for (let r = 0; r < ROWS; r++) {
    const zA = -r * ROW_LEN
    const zB = -(r + 1) * ROW_LEN
    const yA = edgeY[r]
    const yB = edgeY[r + 1]
    const rowHoles = holes[r]
    const allHole = rowHoles.every(Boolean)

    if (allHole) {
      addQuad(pit, [-5, -1.45, zA], [5, -1.45, zA], [5, -1.45, zB], [-5, -1.45, zB])
      addQuad(pit, [-5, yA, zA], [-5, -1.45, zA], [-5, -1.45, zB], [-5, yB, zB])
      addQuad(pit, [5, yA, zA], [5, yB, zB], [5, -1.45, zB], [5, -1.45, zA])
      addQuad(pit, [-5, yA, zA], [5, yA, zA], [5, -1.45, zA], [-5, -1.45, zA])
      addQuad(pit, [-5, yB, zB], [-5, -1.45, zB], [5, -1.45, zB], [5, yB, zB])
    } else {
      for (let lane = 0; lane < 3; lane++) {
        const x0 = LANE_EDGES[lane]
        const x1 = LANE_EDGES[lane + 1]
        if (rowHoles[lane]) {
          addQuad(pit, [x0, -1.45, zA], [x1, -1.45, zA], [x1, -1.45, zB], [x0, -1.45, zB])
          addQuad(pit, [x0, yA, zA], [x0, -1.45, zA], [x0, -1.45, zB], [x0, yB, zB])
          addQuad(pit, [x1, yA, zA], [x1, yB, zB], [x1, -1.45, zB], [x1, -1.45, zA])
          addQuad(pit, [x0, yA, zA], [x1, yB, zB], [x1, -1.45, zB], [x0, -1.45, zA])
          addQuad(pit, [x0, yB, zB], [x0, -1.45, zB], [x1, -1.45, zB], [x1, yB, zB])
        } else {
          addSlab(road, x0, x1, zA, zB, yA, yB)
        }
      }
      addSlab(road, ROAD_X0, LANE_EDGES[0], zA, zB, yA, yB)
      addSlab(road, LANE_EDGES[3], ROAD_X1, zA, zB, yA, yB)
      addPillar(road, ROAD_X0 + 0.2, (zA + zB) / 2, Math.min(yA, yB) - 0.4)
      addPillar(road, ROAD_X1 - 0.2, (zA + zB) / 2, Math.min(yA, yB) - 0.4)

      const raiseA = yA + 0.16
      const raiseB = yB + 0.16
      addSlab(curb, 5.0, 5.28, zA, zB, raiseA, raiseB, 0.22)
      addSlab(curb, -5.28, -5.0, zA, zB, raiseA, raiseB, 0.22)

      const yellow = [1, 0.82, 0.15]
      addQuad(mark, [-3.36, yA + 0.03, zA], [-3.24, yA + 0.03, zA], [-3.24, yB + 0.03, zB], [-3.36, yB + 0.03, zB], yellow)
      addQuad(mark, [3.24, yA + 0.03, zA], [3.36, yA + 0.03, zA], [3.36, yB + 0.03, zB], [3.24, yB + 0.03, zB], yellow)

      const white = [0.95, 0.95, 0.9]
      const dashA = zA - 0.7
      const dashB = zA - 2.5
      const span = zA - zB || 1
      const yDash = (z) => yA + (yB - yA) * ((zA - z) / span) + 0.03
      const yDA = yDash(dashA)
      const yDB = yDash(dashB)
      if (!rowHoles[0] && !rowHoles[1]) {
        addQuad(mark, [-1.16, yDA, dashA], [-1.04, yDA, dashA], [-1.04, yDB, dashB], [-1.16, yDB, dashB], white)
      }
      if (!rowHoles[1] && !rowHoles[2]) {
        addQuad(mark, [1.04, yDA, dashA], [1.16, yDA, dashA], [1.16, yDB, dashB], [1.04, yDB, dashB], white)
      }
    }
  }

  return {
    road: toGeometry(road),
    pit: toGeometry(pit),
    mark: toGeometry(mark, true),
    curb: toGeometry(curb),
  }
}

export function buildYardGeometry() {
  const data = blank()
  addSlab(data, -16, -5.15, 0, -CHUNK_LEN, 0, 0, 0.25)
  addSlab(data, 5.15, 16, 0, -CHUNK_LEN, 0, 0, 0.25)
  return toGeometry(data)
}

export function chunkGeoKey(edgeY, holes) {
  const y = edgeY.map((v) => v.toFixed(2)).join(',')
  const h = holes.map((row) => row.map((b) => (b ? '1' : '0')).join('')).join('')
  return `${y}|${h}`
}
