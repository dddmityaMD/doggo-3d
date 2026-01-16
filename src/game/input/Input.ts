export type InputState = {
  forward: number
  right: number
  runHeld: boolean
  jumpPressed: boolean
  jumpHeld: boolean
}

export class Input {
  private keysDown = new Set<string>()
  private jumpPressedThisFrame = false

  private mouseDeltaX = 0
  private mouseDeltaY = 0

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)

    window.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)

    this.element.addEventListener('click', () => {
      if (!this.isPointerLocked()) this.element.requestPointerLock()
    })
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
  }

  isPointerLocked() {
    return document.pointerLockElement === this.element
  }

  consumeMouseDelta() {
    const dx = this.mouseDeltaX
    const dy = this.mouseDeltaY
    this.mouseDeltaX = 0
    this.mouseDeltaY = 0
    return { dx, dy }
  }

  endFrame() {
    this.jumpPressedThisFrame = false
  }

  getState(): InputState {
    const forward = (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) +
      (this.isDown('KeyS') || this.isDown('ArrowDown') ? -1 : 0)

    const right = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) +
      (this.isDown('KeyA') || this.isDown('ArrowLeft') ? -1 : 0)

    return {
      forward,
      right,
      runHeld: this.isDown('ShiftLeft') || this.isDown('ShiftRight'),
      jumpPressed: this.jumpPressedThisFrame,
      jumpHeld: this.isDown('Space'),
    }
  }

  private isDown(code: string) {
    return this.keysDown.has(code)
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.isPointerLocked()) return

    if (e.code === 'Space' && !this.keysDown.has('Space')) {
      this.jumpPressedThisFrame = true
    }

    this.keysDown.add(e.code)
  }

  private onKeyUp = (e: KeyboardEvent) => {
    if (!this.isPointerLocked()) return

    this.keysDown.delete(e.code)
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isPointerLocked()) return

    this.mouseDeltaX += e.movementX
    this.mouseDeltaY += e.movementY
  }

  private onPointerLockChange = () => {
    // Intentionally empty (but handy hook for debugging later).
  }
}
