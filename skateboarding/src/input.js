import { laneDeltaForCode } from './constants.js'

export function createInput(canvas, buttons) {
  const input = {
    left: false,
    right: false,
    jump: false,
    down: false,
    up: false,
    pause: false,
    mute: false,
    // Queued lane taps. A press that arrives between sim steps must survive
    // until one runs, or it never changes lanes.
    pending: 0,
  }

  function queueSteer(dir) {
    input.pending = Math.max(-2, Math.min(2, input.pending + dir))
    input.left = input.pending < 0
    input.right = input.pending > 0
  }
  let keyDown = false
  let buttonDown = false
  let swipeUntil = 0

  function refreshDown() {
    input.down = keyDown || buttonDown || performance.now() < swipeUntil
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return
    const delta = laneDeltaForCode(event.code)
    if (delta) queueSteer(delta)
    if (event.code === 'Space' || event.code === 'KeyW') input.jump = true
    if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      keyDown = true
      refreshDown()
    }
    if (event.code === 'ArrowUp') input.up = true
    if (event.code === 'Escape') input.pause = true
    if (event.code === 'KeyM') input.mute = true
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault()
    }
  })

  window.addEventListener('keyup', (event) => {
    if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      keyDown = false
      refreshDown()
    }
    if (event.code === 'ArrowUp') input.up = false
  })

  let start = null
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    start = { x: event.clientX, y: event.clientY, id: event.pointerId }
  })
  canvas.addEventListener('pointerup', (event) => {
    if (!start || event.pointerId !== start.id) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    start = null
    if (Math.hypot(dx, dy) < 30) return
    if (Math.abs(dx) > Math.abs(dy)) {
      queueSteer(dx > 0 ? 1 : -1)
    } else if (dy < 0) input.jump = true
    else {
      swipeUntil = performance.now() + 850
      refreshDown()
    }
  })
  canvas.addEventListener('pointercancel', () => {
    start = null
  })

  const press = (element, onDown, onUp) => {
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onDown()
    })
    const release = (event) => {
      event.preventDefault()
      onUp()
    }
    element.addEventListener('pointerup', release)
    element.addEventListener('pointerleave', release)
    element.addEventListener('pointercancel', release)
  }
  press(buttons.left, () => queueSteer(-1), () => {})
  press(buttons.right, () => queueSteer(1), () => {})
  press(buttons.jump, () => { input.jump = true }, () => {})
  press(buttons.down, () => { buttonDown = true; refreshDown() }, () => { buttonDown = false; refreshDown() })

  input.refreshDown = refreshDown
  return input
}
