import * as THREE from 'three'

function mat(color, gradient, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradient || null, ...extra })
}

/** Built facing local −Z, which is world forward when the root yaw stays 0. */
export function createSkater(gradient) {
  const root = new THREE.Group()
  root.name = 'skater'

  const nose = new THREE.Object3D()
  nose.name = 'nose'
  nose.position.set(0, 0.22, -0.5)
  const tail = new THREE.Object3D()
  tail.name = 'tail'
  tail.position.set(0, 0.22, 0.46)
  root.add(nose, tail)

  const visual = new THREE.Group()
  visual.name = 'visual'
  visual.scale.setScalar(1.32)
  root.add(visual)

  const deck = mat(0x22262e, gradient)
  const grip = mat(0xff3b86, gradient)
  const belly = mat(0x2de2e6, gradient, { emissive: 0x146e72, emissiveIntensity: 0.35 })
  const metal = mat(0xb9c0c8, gradient)
  const wheelMat = mat(0x1a1a1a, gradient)
  const hub = mat(0xffe14a, gradient, { emissive: 0x806010, emissiveIntensity: 0.2 })
  const pants = mat(0x242a38, gradient)
  const shoe = mat(0xf4f4f4, gradient)
  const shoeAccent = mat(0x37e2c5, gradient, { emissive: 0x0d5c52, emissiveIntensity: 0.25 })
  const hoodie = mat(0xff3d8a, gradient, { emissive: 0x4a1030, emissiveIntensity: 0.18 })
  const skin = mat(0xf0c2a0, gradient)
  const hair = mat(0x1c1420, gradient)
  const shade = mat(0x141820, gradient)

  const board = new THREE.Group()
  board.name = 'board'
  visual.add(board)

  const deckMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.78), deck)
  deckMesh.position.set(0, 0.12, -0.02)
  const noseKick = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.2), grip)
  noseKick.position.set(0, 0.145, -0.4)
  noseKick.rotation.x = 0.42
  const tailKick = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.16), grip)
  tailKick.position.set(0, 0.14, 0.36)
  tailKick.rotation.x = -0.32
  const underside = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.7), belly)
  underside.position.set(0, 0.092, -0.02)
  board.add(deckMesh, noseKick, tailKick, underside)

  const wheelGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.04, 8)
  const hubGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.046, 6)
  const wheels = []
  for (const z of [-0.24, 0.2]) {
    const truck = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.06), metal)
    truck.position.set(0, 0.085, z)
    board.add(truck)
    for (const x of [-0.1, 0.1]) {
      const pivot = new THREE.Group()
      pivot.position.set(x, 0.05, z)
      const wheel = new THREE.Mesh(wheelGeo, wheelMat)
      wheel.rotation.z = Math.PI / 2
      const cap = new THREE.Mesh(hubGeo, hub)
      cap.rotation.z = Math.PI / 2
      pivot.add(wheel, cap)
      board.add(pivot)
      wheels.push(pivot)
    }
  }

  const body = new THREE.Group()
  body.name = 'body'
  visual.add(body)

  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.16), pants)
  hip.position.set(0, 0.46, -0.02)
  const legGeo = new THREE.BoxGeometry(0.09, 0.24, 0.1)
  const legL = new THREE.Mesh(legGeo, pants)
  const legR = new THREE.Mesh(legGeo, pants)
  legL.position.set(-0.07, 0.3, 0.02)
  legR.position.set(0.07, 0.3, -0.06)
  const shoeGeo = new THREE.BoxGeometry(0.1, 0.06, 0.18)
  const shoeL = new THREE.Mesh(shoeGeo, shoe)
  const shoeR = new THREE.Mesh(shoeGeo, shoeAccent)
  shoeL.position.set(-0.07, 0.16, 0.04)
  shoeR.position.set(0.07, 0.16, -0.08)
  body.add(hip, legL, legR, shoeL, shoeR)

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 0.18), hoodie)
  torso.position.set(0, 0.72, -0.03)
  torso.rotation.x = -0.12
  const logo = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.02), belly)
  logo.position.set(0, 0.74, 0.07)
  body.add(torso, logo)

  const armGeo = new THREE.BoxGeometry(0.08, 0.28, 0.08)
  const armL = new THREE.Mesh(armGeo, hoodie)
  const armR = new THREE.Mesh(armGeo, hoodie)
  armL.position.set(-0.22, 0.7, -0.02)
  armR.position.set(0.22, 0.7, -0.02)
  armL.rotation.z = 0.5
  armR.rotation.z = -0.55
  armL.rotation.x = -0.4
  armR.rotation.x = -0.2
  const handGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07)
  const handL = new THREE.Mesh(handGeo, skin)
  const handR = new THREE.Mesh(handGeo, skin)
  handL.position.set(-0.3, 0.58, -0.1)
  handR.position.set(0.31, 0.56, -0.08)
  body.add(armL, armR, handL, handR)

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), skin)
  head.position.set(0, 1.02, -0.04)
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.22), hair)
  cap.position.set(0, 1.14, -0.02)
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.12), hair)
  brim.position.set(0, 1.1, 0.12)
  const eyeGeo = new THREE.BoxGeometry(0.045, 0.045, 0.03)
  const eyeL = new THREE.Mesh(eyeGeo, shade)
  const eyeR = new THREE.Mesh(eyeGeo, shade)
  eyeL.position.set(-0.05, 1.03, -0.14)
  eyeR.position.set(0.05, 1.03, -0.14)
  body.add(head, cap, brim, eyeL, eyeR)

  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x140810, side: THREE.BackSide })
  const meshes = []
  visual.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj)
  })
  for (const obj of meshes) {
    const shell = new THREE.Mesh(obj.geometry, outlineMat)
    shell.position.copy(obj.position)
    shell.rotation.copy(obj.rotation)
    shell.scale.copy(obj.scale).multiplyScalar(1.045)
    shell.userData.outline = true
    obj.parent.add(shell)
  }

  root.userData.parts = { visual, board, body, wheels, torso }
  return root
}

export function updateSkater(root, player, dt, time) {
  const { visual, board, body, wheels } = root.userData.parts
  root.position.set(player.x, player.y, player.z)

  if (!player.alive) {
    visual.rotation.x += dt * 8
    visual.rotation.z += dt * 5.2
    return
  }

  visual.rotation.z = player.lean || 0
  const bob = player.grounded ? Math.sin(time * (7 + player.speed * 0.22)) * 0.028 : 0
  const crouch = player.crouch ? -0.22 : 0
  const tuck = player.grounded ? 0 : -0.12
  body.position.y = bob + crouch
  body.rotation.x = tuck + (player.flip > 0 ? -0.35 : 0)
  visual.rotation.x = player.grounded ? 0 : -0.08

  const spin = player.speed * dt / 0.048
  for (let i = 0; i < wheels.length; i++) wheels[i].rotation.x += spin

  if (player.flip > 0) {
    const p = 1 - player.flip / 0.48
    board.rotation.z = p * Math.PI * 2
    board.position.y = Math.sin(p * Math.PI) * 0.12
  } else {
    board.rotation.z = 0
    board.rotation.x = player.grounded ? 0 : -0.18
    board.position.y = 0
  }

  const blink = player.invuln > 0 && Math.sin(time * 46) > 0
  body.traverse((obj) => {
    if (obj.isMesh && obj.material && obj.material.emissive && !obj.userData.outline) {
      if (!obj.userData.baseEmissive) obj.userData.baseEmissive = obj.material.emissive.getHex()
      obj.material.emissive.setHex(blink ? 0xffffff : obj.userData.baseEmissive)
    }
  })
}
