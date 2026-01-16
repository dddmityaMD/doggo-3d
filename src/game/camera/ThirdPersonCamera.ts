import { Camera, PerspectiveCamera, Vector3 } from 'three'

import type { Physics } from '../physics/Physics'
import type { Input } from '../input/Input'
import { clamp, damp } from '../utils/math'

export class ThirdPersonCamera {
  readonly camera: PerspectiveCamera

  yaw = 0
  pitch = -0.35

  private distance = 8.5
  private height = 2.4

  private currentPos = new Vector3(0, 5, 10)
  private currentTarget = new Vector3(0, 0, 0)

  constructor(
    private readonly physics: Physics,
    private readonly input: Input,
    opts?: { fov?: number },
  ) {
    this.camera = new PerspectiveCamera(opts?.fov ?? 55, 1, 0.1, 2000)
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  update(dt: number, playerPos: Vector3) {
    const { dx, dy } = this.input.consumeMouseDelta()
    const sensitivity = 0.002

    this.yaw -= dx * sensitivity
    this.pitch -= dy * sensitivity
    this.pitch = clamp(this.pitch, -1.2, 0.25)

    const target = new Vector3(playerPos.x, playerPos.y + this.height, playerPos.z)

    const behind = new Vector3(0, 0, 1)
    behind.applyAxisAngle(new Vector3(0, 1, 0), this.yaw)

    const pitchVec = new Vector3(behind.x, 0, behind.z)
    pitchVec.normalize()

    const desired = new Vector3()
    desired.copy(target)
    desired.addScaledVector(pitchVec, this.distance)
    desired.y += Math.sin(this.pitch) * this.distance + this.height * 0.2

    // Camera collision: raycast from target to desired.
    const dir = new Vector3().subVectors(desired, target)
    const len = dir.length()
    if (len > 1e-4) {
      dir.multiplyScalar(1 / len)

      const ray = new this.physics.RAPIER.Ray(
        { x: target.x, y: target.y, z: target.z },
        { x: dir.x, y: dir.y, z: dir.z },
      )

      const hit = this.physics.world.castRay(ray, len, true)
      if (hit) {
        // Pull camera forward a bit to avoid clipping.
        const safe = Math.max(0.4, hit.timeOfImpact - 0.2)
        desired.copy(target).addScaledVector(dir, safe)
      }
    }

    // Smooth follow.
    const followLambda = 14
    this.currentPos.x = damp(this.currentPos.x, desired.x, followLambda, dt)
    this.currentPos.y = damp(this.currentPos.y, desired.y, followLambda, dt)
    this.currentPos.z = damp(this.currentPos.z, desired.z, followLambda, dt)

    const targetLambda = 16
    this.currentTarget.x = damp(this.currentTarget.x, target.x, targetLambda, dt)
    this.currentTarget.y = damp(this.currentTarget.y, target.y, targetLambda, dt)
    this.currentTarget.z = damp(this.currentTarget.z, target.z, targetLambda, dt)

    this.camera.position.copy(this.currentPos)
    this.camera.lookAt(this.currentTarget)
  }

  asCamera(): Camera {
    return this.camera
  }
}
