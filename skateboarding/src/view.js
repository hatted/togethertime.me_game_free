import * as THREE from 'three'
import { placeCamera } from './camera.js'
import { chunkGeoKey, buildChunkGeometries, buildYardGeometry } from './geo.js'
import { sampleGround } from './sim.js'
import { createSkater, updateSkater } from './skater.js'

const THEME = {
  suburbs: {
    skyTop: 0x7ec8ff,
    skyHorizon: 0xffe1b0,
    fog: 0xd7efff,
    asphalt: 0x6e788a,
    curb: 0xff4d8d,
    yard: 0x74c85c,
    hemiSky: 0xfff3d2,
    hemiGround: 0x6b9a48,
    sun: 0xfff7e6,
    ambient: 0.72,
    sunIntensity: 1.35,
    fogNear: 38,
    fogFar: 150,
  },
  park: {
    skyTop: 0x3ec0ff,
    skyHorizon: 0xc6f6c4,
    fog: 0xc9f3e6,
    asphalt: 0x6c7569,
    curb: 0x2ad4b6,
    yard: 0x3eae5c,
    hemiSky: 0xe9fff4,
    hemiGround: 0x2f8a4a,
    sun: 0xfff2cc,
    ambient: 0.68,
    sunIntensity: 1.25,
    fogNear: 34,
    fogFar: 136,
  },
  downtown: {
    skyTop: 0x160818,
    skyHorizon: 0xff3a78,
    fog: 0x2a1028,
    asphalt: 0x5c6170,
    curb: 0xff2d95,
    yard: 0x3c3648,
    hemiSky: 0xff6aa8,
    hemiGround: 0x140810,
    sun: 0xa9c0ff,
    ambient: 0.55,
    sunIntensity: 0.95,
    fogNear: 22,
    fogFar: 108,
  },
}

const MAX_COINS = 180
const MAX_PARTS = 72

function toon(color, gradient, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...extra })
}

function basic(color, extra = {}) {
  return new THREE.MeshBasicMaterial({ color, ...extra })
}

function gradientTex() {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 1
  const g = canvas.getContext('2d')
  ;['#2a2a32', '#6e6e7c', '#c8c8d4', '#ffffff'].forEach((color, i) => {
    g.fillStyle = color
    g.fillRect(i, 0, 1, 1)
  })
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function stripeTex() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 8
  const g = canvas.getContext('2d')
  for (let x = 0; x < 64; x += 8) {
    g.fillStyle = (x / 8) % 2 ? '#ff9a1a' : '#1a120c'
    g.fillRect(x, 0, 8, 8)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.wrapS = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function windowTex() {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 64
  const g = canvas.getContext('2d')
  g.fillStyle = '#221c2c'
  g.fillRect(0, 0, 32, 64)
  for (let y = 3; y < 64; y += 7) {
    for (let x = 2; x < 32; x += 6) {
      g.fillStyle = Math.random() > 0.42 ? '#ffe7a0' : '#3a4560'
      g.fillRect(x, y, 3, 4)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function shadowTex() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const g = canvas.getContext('2d')
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32)
  grd.addColorStop(0, 'rgba(0,0,0,0.5)')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(canvas)
  return tex
}

function smoothstep(v, a, b) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function themeAt(distance) {
  if (distance < 960) return ['suburbs', 'suburbs', 0]
  if (distance < 1040) return ['suburbs', 'park', (distance - 960) / 80]
  if (distance < 2960) return ['park', 'park', 0]
  if (distance < 3040) return ['park', 'downtown', (distance - 2960) / 80]
  return ['downtown', 'downtown', 0]
}

function mixHex(out, a, b, t) {
  out.copy(a).lerp(b, t)
  return out
}

export function createView(canvas, { reduceMotion = false } = {}) {
  const gradient = gradientTex()
  const stripes = stripeTex()
  const windows = windowTex()
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.setClearColor(0x87c8f8, 1)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(THEME.suburbs.fog, 38, 150)
  const camera = new THREE.PerspectiveCamera(64, 1, 0.15, 520)
  const viewport = { portrait: false, slope: 0 }

  const hemi = new THREE.HemisphereLight(THEME.suburbs.hemiSky, THEME.suburbs.hemiGround, 0.72)
  const sun = new THREE.DirectionalLight(THEME.suburbs.sun, 1.35)
  sun.position.set(-6, 18, 12)
  scene.add(sun.target)
  const fill = new THREE.DirectionalLight(0xffd0ea, 0.28)
  fill.position.set(4, 6, -10)
  scene.add(hemi, sun, fill)

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 20, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(THEME.suburbs.skyTop) },
        bottom: { value: new THREE.Color(THEME.suburbs.skyHorizon) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 top;
        uniform vec3 bottom;
        void main() {
          float h = normalize(vPos).y;
          float t = smoothstep(-0.12, 0.55, h);
          gl_FragColor = vec4(mix(bottom, top, t), 1.0);
        }
      `,
    }),
  )
  scene.add(sky)

  const asphalt = {}
  const curb = {}
  const yardMat = {}
  for (const name of Object.keys(THEME)) {
    asphalt[name] = toon(THEME[name].asphalt, gradient)
    curb[name] = basic(THEME[name].curb)
    yardMat[name] = toon(THEME[name].yard, gradient)
  }
  const pitMat = basic(0x12080e, { side: THREE.DoubleSide })
  const markMat = basic(0xffffff, {
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const yardGeo = buildYardGeometry()
  const geoCache = new Map()
  const chunkViews = []

  function bundleFor(chunk) {
    const key = chunkGeoKey(chunk.edgeY, chunk.holes)
    let bundle = geoCache.get(key)
    if (!bundle) {
      bundle = buildChunkGeometries(chunk.edgeY, chunk.holes)
      geoCache.set(key, bundle)
    }
    return { key, bundle }
  }

  function makeChunkView() {
    const root = new THREE.Group()
    const road = new THREE.Mesh(new THREE.BufferGeometry(), asphalt.suburbs)
    const pit = new THREE.Mesh(new THREE.BufferGeometry(), pitMat)
    const mark = new THREE.Mesh(new THREE.BufferGeometry(), markMat)
    const curbMesh = new THREE.Mesh(new THREE.BufferGeometry(), curb.suburbs)
    const yard = new THREE.Mesh(yardGeo, yardMat.suburbs)
    root.add(yard, road, pit, curbMesh, mark)
    scene.add(root)
    return { root, road, pit, mark, curb: curbMesh, yard, key: '' }
  }

  const stripeMat = new THREE.MeshToonMaterial({ map: stripes, gradientMap: gradient })
  const wood = toon(0x8a5a32, gradient)
  const woodDark = toon(0x5c3b22, gradient)
  const leaf = toon(0x3ecf62, gradient)
  const leafDark = toon(0x1f9a45, gradient)
  const trunk = toon(0x6b4428, gradient)
  const rockMat = toon(0x8d8a96, gradient)
  const wall = toon(0xf2efe6, gradient)
  const roofMat = toon(0xff5b7a, gradient)
  const doorMat = toon(0x3a2a28, gradient)
  const towerMat = toon(0x2a3148, gradient)
  const windowMat = new THREE.MeshBasicMaterial({ map: windows })
  const lampPole = toon(0x2c3138, gradient)
  const bulbMat = basic(0xfff1b0)
  const signColors = [0xff2d95, 0x2de2e6, 0xb6ff3c, 0xffe14a].map((color) => basic(color))

  function house() {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.35, 1.5), wall)
    body.position.y = 0.68
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.75, 4), roofMat)
    roof.position.y = 1.7
    roof.rotation.y = Math.PI / 4
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.62, 0.08), doorMat)
    door.position.set(0, 0.32, 0.76)
    g.add(body, roof, door)
    return g
  }
  function tree() {
    const g = new THREE.Group()
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.7, 6), trunk)
    stem.position.y = 0.35
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.72, 7, 5), leaf)
    top.position.y = 1.15
    g.add(stem, top)
    return g
  }
  function pine() {
    const g = new THREE.Group()
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.5, 5), trunk)
    stem.position.y = 0.25
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.9, 6), leafDark)
    a.position.y = 0.85
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.7, 6), leaf)
    b.position.y = 1.4
    g.add(stem, a, b)
    return g
  }
  function rock() {
    const g = new THREE.Group()
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), rockMat)
    m.position.y = 0.32
    m.scale.set(1.2, 0.7, 1)
    g.add(m)
    return g
  }
  function bush() {
    const g = new THREE.Group()
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.42, 6, 5), leaf)
    m.position.y = 0.32
    g.add(m)
    return g
  }
  function tower() {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 1.5), towerMat)
    body.position.y = 1.2
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 2.2), windowMat)
    face.position.set(0, 1.2, 0.76)
    const face2 = face.clone()
    face2.position.set(0.76, 1.2, 0)
    face2.rotation.y = Math.PI / 2
    g.add(body, face, face2)
    return g
  }
  function sign() {
    const g = new THREE.Group()
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 5), lampPole)
    pole.position.y = 0.8
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.1), signColors[0])
    board.position.y = 1.7
    board.name = 'signboard'
    g.add(pole, board)
    return g
  }
  function lamp() {
    const g = new THREE.Group()
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.1, 5), lampPole)
    pole.position.y = 1.05
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), bulbMat)
    bulb.position.y = 2.15
    g.add(pole, bulb)
    return g
  }
  const propTemplates = { house: house(), tree: tree(), pine: pine(), rock: rock(), bush: bush(), tower: tower(), sign: sign(), lamp: lamp() }
  const propBins = {}

  function barrier(w, h, d) {
    const g = new THREE.Group()
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stripeMat)
    box.position.y = h / 2
    g.add(box)
    return g
  }
  function makeCar() {
    const g = new THREE.Group()
    const paint = basic(0x2de2e6)
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.48, 2.0), paint)
    body.position.y = 0.48
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.0), toon(0xd7f7ff, gradient))
    cabin.position.set(0, 0.88, -0.05)
    g.add(body, cabin)
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 8), basic(0x1a1a1a))
    wheel.rotation.z = Math.PI / 2
    for (const z of [-0.62, 0.62]) {
      for (const x of [-0.72, 0.72]) {
        const w = wheel.clone()
        w.position.set(x, 0.18, z)
        g.add(w)
      }
    }
    g.userData.paint = paint
    return g
  }
  function makeLog() {
    const g = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 7.2, 7), wood)
    mesh.rotation.z = Math.PI / 2
    mesh.position.y = 0.28
    const endMat = woodDark
    const endGeo = new THREE.CircleGeometry(0.3, 7)
    const e1 = new THREE.Mesh(endGeo, endMat)
    e1.rotation.y = Math.PI / 2
    e1.position.set(3.6, 0.28, 0)
    const e2 = e1.clone()
    e2.position.x = -3.6
    e2.rotation.y = -Math.PI / 2
    g.add(mesh, e1, e2)
    return g
  }
  function makeBar() {
    const g = new THREE.Group()
    const postGeo = new THREE.BoxGeometry(0.12, 1.58, 0.12)
    const left = new THREE.Mesh(postGeo, basic(0xffe14a))
    left.position.set(-3.45, 0.79, 0)
    const right = left.clone()
    right.position.x = 3.45
    const beam = new THREE.Mesh(new THREE.BoxGeometry(7.3, 0.16, 0.28), basic(0xff4d6a))
    beam.position.y = 1.28
    g.add(left, right, beam)
    return g
  }
  function makeGate() {
    const g = new THREE.Group()
    const panel = new THREE.Mesh(new THREE.BoxGeometry(8.2, 2.05, 0.28), stripeMat)
    panel.position.y = 1.05
    const top = new THREE.Mesh(new THREE.BoxGeometry(8.3, 0.16, 0.36), basic(0x1a120c))
    top.position.y = 2.12
    g.add(panel, top)
    return g
  }
  const obstacleTemplates = {
    block: () => barrier(1.8, 1.8, 0.84),
    car: () => makeCar(),
    log: () => makeLog(),
    bar: () => makeBar(),
    gate: () => makeGate(),
  }
  const obstacleBins = {}
  const carPaints = [0x2de2e6, 0xff3d8a, 0xffe14a, 0xb388ff, 0xff7a18]

  const lipMat = basic(0x39f3ff, { transparent: true, opacity: 0.95, depthWrite: false })
  const lipGeo = new THREE.BoxGeometry(1, 0.07, 0.85)
  const lipBins = []

  const coinGeo = new THREE.TorusGeometry(0.26, 0.07, 5, 8)
  const coinMat = basic(0xffd24a)
  const coinsMesh = new THREE.InstancedMesh(coinGeo, coinMat, MAX_COINS)
  coinsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  coinsMesh.frustumCulled = false
  coinsMesh.count = 0
  scene.add(coinsMesh)
  const dummy = new THREE.Object3D()

  const skater = createSkater(gradient)
  scene.add(skater)
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 1.3),
    new THREE.MeshBasicMaterial({
      map: shadowTex(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  )
  shadow.rotation.x = -Math.PI / 2
  scene.add(shadow)

  const speeds = new THREE.Group()
  const speedMat = basic(0xffffff, {
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    side: THREE.DoubleSide,
  })
  const speedLines = []
  for (let i = 0; i < 18; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 1), speedMat)
    const side = i % 2 === 0 ? -1 : 1
    line.position.set(side * (3.1 + (i % 5) * 0.34), ((i % 7) - 3) * 0.38, -4 - (i % 6))
    speeds.add(line)
    speedLines.push(line)
  }
  camera.add(speeds)
  scene.add(camera)

  const clouds = new THREE.Group()
  const cloudMat = basic(0xffffff, { transparent: true, opacity: 0.92 })
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(2.2 + (i % 3) * 0.6, 6, 5), cloudMat)
    c.position.set((i - 2.5) * 14, 16 + (i % 3) * 2, -20 - i * 18)
    c.scale.y = 0.45
    clouds.add(c)
  }
  scene.add(clouds)
  const moon = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 10), basic(0xfff2c8))
  moon.material.fog = false
  moon.visible = false
  scene.add(moon)

  const partPositions = new Float32Array(MAX_PARTS * 3)
  const partColors = new Float32Array(MAX_PARTS * 3)
  const partGeo = new THREE.BufferGeometry()
  partGeo.setAttribute('position', new THREE.BufferAttribute(partPositions, 3))
  partGeo.setAttribute('color', new THREE.BufferAttribute(partColors, 3))
  const partMesh = new THREE.Points(
    partGeo,
    new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }),
  )
  scene.add(partMesh)
  const particles = []

  const debugMat = basic(0xff2d95, { wireframe: true })
  const debugPlayer = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), basic(0x39f3ff, { wireframe: true }))
  debugPlayer.visible = false
  scene.add(debugPlayer)
  const debugBins = []
  let debug = new URLSearchParams(location.search).has('debug')

  const scratchA = new THREE.Color()
  const scratchB = new THREE.Color()
  const shake = new THREE.Vector3()

  function burst(x, y, z, color, count, power) {
    const c = new THREE.Color(color)
    for (let i = 0; i < count; i++) {
      if (particles.length > MAX_PARTS - 1) particles.shift()
      particles.push({
        x, y, z,
        vx: (Math.random() - 0.5) * power,
        vy: Math.random() * power,
        vz: (Math.random() - 0.5) * power,
        life: 0.35 + Math.random() * 0.3,
        max: 0.65,
        r: c.r, g: c.g, b: c.b,
      })
    }
  }

  function acquire(bins, key, build) {
    const bin = bins[key] || (bins[key] = [])
    let mesh = null
    for (let i = 0; i < bin.length; i++) {
      if (!bin[i].userData.on) {
        mesh = bin[i]
        break
      }
    }
    if (!mesh) {
      mesh = build()
      scene.add(mesh)
      bin.push(mesh)
    }
    mesh.userData.on = true
    mesh.visible = true
    return mesh
  }

  function hideBins(bins) {
    for (const key of Object.keys(bins)) {
      const bin = bins[key]
      for (let i = 0; i < bin.length; i++) {
        bin[i].userData.on = false
        bin[i].visible = false
      }
    }
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    viewport.portrait = h > w && w < 980
    const dpr = Math.min(window.devicePixelRatio || 1, viewport.portrait ? 1.5 : 1.75)
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    camera.aspect = Math.max(0.3, w / Math.max(1, h))
    camera.updateProjectionMatrix()
  }

  function render(game, dt, time, mode) {
    const player = game.player
    const posed = mode === 'title'
      ? { ...player, speed: 2.4, lean: Math.sin(time * 0.8) * 0.06, flip: 0, invuln: 0, alive: true, crouch: false, grounded: true }
      : player
    updateSkater(skater, posed, dt, time)

    const here = sampleGround(game, player.z, player.x)
    const ahead = sampleGround(game, player.z - 1.2, player.x)
    viewport.slope = here.y - ahead.y
    const amount = reduceMotion ? 0 : game.shake
    shake.set((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount * 0.6, (Math.random() - 0.5) * amount * 0.4)
    const subject = mode === 'title' ? posed : player
    const rig = placeCamera(camera, subject, viewport, amount > 0.01 ? shake : null, reduceMotion ? 0 : player.lean * 0.07)

    const [nameA, nameB, blend] = themeAt(game.distance)
    const A = THEME[nameA]
    const B = THEME[nameB]
    mixHex(sky.material.uniforms.top.value, scratchA.setHex(A.skyTop), scratchB.setHex(B.skyTop), blend)
    mixHex(sky.material.uniforms.bottom.value, scratchA.setHex(A.skyHorizon), scratchB.setHex(B.skyHorizon), blend)
    mixHex(scene.fog.color, scratchA.setHex(A.fog), scratchB.setHex(B.fog), blend)
    scene.fog.near = A.fogNear + (B.fogNear - A.fogNear) * blend
    scene.fog.far = A.fogFar + (B.fogFar - A.fogFar) * blend
    mixHex(hemi.color, scratchA.setHex(A.hemiSky), scratchB.setHex(B.hemiSky), blend)
    mixHex(hemi.groundColor, scratchA.setHex(A.hemiGround), scratchB.setHex(B.hemiGround), blend)
    hemi.intensity = A.ambient + (B.ambient - A.ambient) * blend
    mixHex(sun.color, scratchA.setHex(A.sun), scratchB.setHex(B.sun), blend)
    sun.intensity = A.sunIntensity + (B.sunIntensity - A.sunIntensity) * blend
    sky.position.copy(camera.position)
    clouds.position.set(player.x, 0, player.z)
    clouds.visible = nameB !== 'downtown' || blend < 0.85
    moon.visible = nameB === 'downtown' && blend > 0.4
    moon.position.set(player.x + 30, 28, player.z - 80)

    while (chunkViews.length < game.chunks.length) chunkViews.push(makeChunkView())
    for (let i = 0; i < game.chunks.length; i++) {
      const chunk = game.chunks[i]
      const view = chunkViews[i]
      const { key, bundle } = bundleFor(chunk)
      if (view.key !== key) {
        view.road.geometry = bundle.road
        view.pit.geometry = bundle.pit
        view.mark.geometry = bundle.mark
        view.curb.geometry = bundle.curb
        view.key = key
      }
      view.root.position.z = chunk.z0
      view.root.visible = true
      view.road.material = asphalt[chunk.zone]
      view.curb.material = curb[chunk.zone]
      view.yard.material = yardMat[chunk.zone]
    }
    for (let i = game.chunks.length; i < chunkViews.length; i++) chunkViews[i].root.visible = false

    hideBins(obstacleBins)
    const obstacles = game.obstacles
    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i]
      const mesh = acquire(obstacleBins, ob.kind, obstacleTemplates[ob.kind])
      mesh.position.set(ob.x, ob.yBase + ob.y0, ob.z)
      if (ob.kind === 'car' && !mesh.userData.painted) {
        mesh.userData.paint.color.setHex(carPaints[mesh.id % carPaints.length])
        mesh.userData.painted = true
      }
      if (ob.kind === 'block') {
        mesh.scale.set(ob.halfX / 0.9, ob.y1 / 1.8, ob.halfZ / 0.42)
      } else {
        mesh.scale.set(1, 1, 1)
      }
    }

    hideBins(propBins)
    const props = game.props
    for (let i = 0; i < props.length; i++) {
      const prop = props[i]
      const mesh = acquire(propBins, prop.kind, () => propTemplates[prop.kind].clone(true))
      if (prop.kind === 'tower') mesh.scale.set(1, prop.scale, 1)
      else mesh.scale.setScalar(prop.scale)
      mesh.position.set(prop.x, prop.y, prop.z)
      mesh.rotation.y = prop.rot
      if (prop.kind === 'sign' && !mesh.userData.tinted) {
        mesh.traverse((obj) => {
          if (obj.name === 'signboard') obj.material = signColors[Math.floor(Math.random() * signColors.length)]
        })
        mesh.userData.tinted = true
      }
    }

    for (let i = 0; i < lipBins.length; i++) lipBins[i].visible = false
    const lips = game.lips
    for (let i = 0; i < lips.length; i++) {
      let band = lipBins[i]
      if (!band) {
        band = new THREE.Mesh(lipGeo, lipMat)
        scene.add(band)
        lipBins.push(band)
      }
      const y = sampleGround(game, lips[i].z, 0).y
      band.visible = true
      band.position.set(lips[i].x, y + 0.08, lips[i].z)
      band.scale.set(lips[i].halfX * 2, 1, 1)
    }
    lipMat.opacity = 0.55 + Math.sin(time * 7) * 0.35

    const list = game.coins
    const n = Math.min(MAX_COINS, list.length)
    coinsMesh.count = n
    for (let i = 0; i < n; i++) {
      const coin = list[i]
      // Coins already behind the skater pass through the chase camera and fill the lens.
      if (coin.taken || coin.z > player.z + 0.35) dummy.scale.setScalar(0.001)
      else dummy.scale.setScalar(1)
      dummy.position.set(coin.x, coin.y + Math.sin(time * 4 + i) * 0.08, coin.z)
      dummy.rotation.set(0, time * 2.2 + i, 0)
      dummy.updateMatrix()
      coinsMesh.setMatrixAt(i, dummy.matrix)
    }
    if (n > 0) coinsMesh.instanceMatrix.needsUpdate = true

    const groundY = here.hole ? player.y : here.y
    shadow.visible = !here.hole && player.alive
    shadow.position.set(player.x, groundY + 0.06, player.z)
    const lift = Math.max(0, player.y - groundY)
    const s = 1 / (1 + lift * 0.45)
    shadow.scale.setScalar(s)
    shadow.material.opacity = Math.max(0, 0.85 - lift * 0.35)

    speedMat.opacity = rig.speedT * (viewport.portrait ? 0.28 : 0.4)
    const streak = (10 + player.speed * 0.45) * dt
    for (let i = 0; i < speedLines.length; i++) {
      const line = speedLines[i]
      line.position.z += streak
      if (line.position.z > 1.2) {
        const side = line.position.x < 0 ? -1 : 1
        line.position.set(side * (3 + Math.random() * 1.7), (Math.random() - 0.35) * 2.4, -7 - Math.random() * 8)
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life -= dt
      p.vy -= 8 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      if (p.life <= 0) particles.splice(i, 1)
    }
    for (let i = 0; i < MAX_PARTS; i++) {
      const p = particles[i]
      const o = i * 3
      if (!p) {
        partPositions[o + 1] = -999
        continue
      }
      partPositions[o] = p.x
      partPositions[o + 1] = p.y
      partPositions[o + 2] = p.z
      const fade = Math.max(0, p.life / p.max)
      partColors[o] = p.r * fade
      partColors[o + 1] = p.g * fade
      partColors[o + 2] = p.b * fade
    }
    partGeo.attributes.position.needsUpdate = true
    partGeo.attributes.color.needsUpdate = true

    if (debug) {
      debugPlayer.visible = true
      const h = player.crouch && player.grounded ? 0.82 : 1.62
      debugPlayer.scale.set(0.68, h, 0.64)
      debugPlayer.position.set(player.x, player.y + h / 2, player.z)
      while (debugBins.length < obstacles.length) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), debugMat)
        scene.add(mesh)
        debugBins.push(mesh)
      }
      for (let i = 0; i < debugBins.length; i++) {
        const mesh = debugBins[i]
        const ob = obstacles[i]
        mesh.visible = !!ob
        if (!ob) continue
        mesh.scale.set((ob.halfX + 0.34) * 2, ob.y1 - ob.y0, (ob.halfZ + 0.32) * 2)
        mesh.position.set(ob.x, ob.yBase + (ob.y0 + ob.y1) / 2, ob.z)
      }
    } else if (debugPlayer.visible) {
      debugPlayer.visible = false
      for (const mesh of debugBins) mesh.visible = false
    }

    renderer.render(scene, camera)
  }

  resize()
  window.addEventListener('resize', resize)

  return {
    render,
    resize,
    camera,
    skater,
    burst(color, count, power) {
      burst(skater.position.x, skater.position.y + 1, skater.position.z, color, count, power)
    },
    setDebug(on) {
      debug = on
    },
    toggleDebug() {
      debug = !debug
      return debug
    },
  }
}
