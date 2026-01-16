import { AnimationMixer, Box3, CapsuleGeometry, Group, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three'

import type { Physics } from '../physics/Physics'
import type { Input } from '../input/Input'
import { pickDogClips, type DogClipMap } from '../assets/loadDog'
import { clamp } from '../utils/math'

export type PlayerConfig = {
  spawn: Vector3
  radius: number
  halfHeight: number
  maxSpeed: number
  acceleration: number
  jumpSpeed: number
  maxSlopeClimbRadians: number
  slideSlopeRadians: number
  slideStrength: number
  starvingSpeedMultiplier: number
  coyoteTime: number
  jumpBufferTime: number
}

export class Player {
  readonly group = new Group()

  private readonly body: any
  private readonly collider: any

  private grounded = false
  private groundNormal = new Vector3(0, 1, 0)
  private desiredVel = new Vector3()

  private coyoteTimer = 0
  private jumpBufferTimer = 0

  private mixer: AnimationMixer | null = null
  private clips: DogClipMap = {}
  private activeActionName: 'idle' | 'walk' | 'run' | 'jump' | 'gallopJump' | null = null

  private jumpAnimTime = 0
  private jumpWasRunning = false
  private celebrating = false
  private celebrationTime = 0
  private celebrationHopTimer = 0
  private celebrationDuration = 0

  private readonly cfg: PlayerConfig
  private starving = false

  dispose() {
    const { world } = this.physics
    world.removeCollider(this.collider, true)
    world.removeRigidBody(this.body)
  }

  constructor(
    private readonly physics: Physics,
    private readonly input: Input,
    config?: Partial<PlayerConfig>,
  ) {
    const cfg: PlayerConfig = {
      spawn: new Vector3(0, 20, 0),
      radius: 0.45,
      halfHeight: 0.55,
      maxSpeed: 12.75,
      acceleration: 45,
      jumpSpeed: 7.2,
      maxSlopeClimbRadians: (40 * Math.PI) / 180,
      slideSlopeRadians: (48 * Math.PI) / 180,
      slideStrength: 12,
      starvingSpeedMultiplier: 0.28,
      coyoteTime: 0.12,
      jumpBufferTime: 0.12,
      ...config,
    }

    this.cfg = cfg

    const { RAPIER, world } = physics

    const rbDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(cfg.spawn.x, cfg.spawn.y, cfg.spawn.z)
      .lockRotations()
      .setLinearDamping(0.4)
      .setCcdEnabled(true)
      .setSoftCcdPrediction(2.0)

    this.body = world.createRigidBody(rbDesc)

    const colDesc = RAPIER.ColliderDesc.capsule(cfg.halfHeight, cfg.radius)
    colDesc.setFriction(1.0)
    colDesc.setRestitution(0.0)

    this.collider = world.createCollider(colDesc, this.body)

    // Visual placeholder (replaced by glTF once loaded).
    const placeholder = new Mesh(
      new CapsuleGeometry(cfg.radius, cfg.halfHeight * 2, 8, 16),
      new MeshStandardMaterial({ color: 0xd7c8a8, roughness: 1 }),
    )

    placeholder.castShadow = true
    placeholder.receiveShadow = true

    this.group.add(placeholder)
  }

  get position() {
    const t = this.body.translation()
    return new Vector3(t.x, t.y, t.z)
  }

  getHorizontalSpeed() {
    const v = this.body.linvel()
    return Math.sqrt(v.x * v.x + v.z * v.z)
  }

  getConfiguredMaxSpeed() {
    return this.cfg.maxSpeed
  }

  setStarving(starving: boolean) {
    this.starving = starving
  }

  get yaw() {
    const rot = this.group.quaternion
    const forward = new Vector3(0, 0, -1).applyQuaternion(rot)
    return Math.atan2(forward.x, forward.z)
  }

  setModel(root: Group, animations: any[]) {
    this.group.clear()

    root.traverse((obj: Object3D) => {
      const mesh = obj as any
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true

        if (mesh.geometry?.isBufferGeometry) {
          mesh.geometry.computeVertexNormals()
        }

        const material = mesh.material as any
        if (material && material.flatShading) {
          material.flatShading = false
          material.needsUpdate = true
        }
      }
    })

    this.autoScaleAndGround(root)
    this.group.add(root)

    if (animations.length > 0) {
      this.mixer = new AnimationMixer(root)
      this.clips = pickDogClips(animations)
    }
  }

  private autoScaleAndGround(root: Group) {
    root.updateMatrixWorld(true)

    const box = new Box3().setFromObject(root)
    const size = box.getSize(new Vector3())

    const targetHeight = this.cfg.halfHeight * 2 + this.cfg.radius * 2

    if (size.y > 0.0001) {
      const scale = targetHeight / size.y
      root.scale.setScalar(scale)
      root.updateMatrixWorld(true)
    }

    const groundedBox = new Box3().setFromObject(root)
    const desiredMinY = -(this.cfg.halfHeight + this.cfg.radius)
    const offsetY = desiredMinY - groundedBox.min.y

    root.position.y += offsetY
  }

  applyInput(dt: number, cameraYaw: number, allowMove = true) {
    const cfg = this.cfg

    const state = this.input.getState()

    // Ground check.
    this.updateGroundInfo(cfg)

    // Jump buffer + coyote time for reliability on rough terrain.
    if (this.grounded) {
      this.coyoteTimer = cfg.coyoteTime
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt)
    }

    if (state.jumpPressed) {
      this.jumpBufferTimer = cfg.jumpBufferTime
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt)
    }

    // Movement direction relative to camera yaw.
    const move = allowMove ? new Vector3(state.right, 0, -state.forward) : new Vector3(0, 0, 0)
    if (move.lengthSq() > 1e-6) move.normalize()

    const yaw = cameraYaw
    move.applyAxisAngle(new Vector3(0, 1, 0), yaw)

    let targetSpeed = state.runHeld ? cfg.maxSpeed * 0.55 : cfg.maxSpeed
    if (this.starving) targetSpeed *= cfg.starvingSpeedMultiplier

    const desiredVel = new Vector3(move.x * targetSpeed, 0, move.z * targetSpeed)

    // Handle steep slopes: remove uphill component and add slide.
    if (this.grounded) {
      const slope = Math.acos(clamp(this.groundNormal.y, -1, 1))

      if (slope > cfg.maxSlopeClimbRadians) {
        const slideDir = computeSlideDirection(this.groundNormal)
        const slideXZ = new Vector3(slideDir.x, 0, slideDir.z)
        if (slideXZ.lengthSq() > 1e-6) slideXZ.normalize()

        const desiredXZ = new Vector3(desiredVel.x, 0, desiredVel.z)
        const uphillDot = desiredXZ.dot(slideXZ) * -1

        // If trying to move uphill, remove that component.
        if (uphillDot > 0) {
          desiredXZ.addScaledVector(slideXZ, desiredXZ.dot(slideXZ))
          desiredVel.x = desiredXZ.x
          desiredVel.z = desiredXZ.z
        }

        // Slide starts a bit later than climb limit for nicer feel.
        if (slope >= cfg.slideSlopeRadians) {
          const slideAmount = (slope - cfg.slideSlopeRadians) / (Math.PI / 2 - cfg.slideSlopeRadians)
          desiredVel.addScaledVector(slideXZ, cfg.slideStrength * clamp(slideAmount, 0, 1))
        }
      }
    }

    const current = this.body.linvel()

    // Smooth horizontal acceleration.
    const vel = new Vector3(current.x, current.y, current.z)
    const accel = cfg.acceleration

    vel.x = approach(vel.x, desiredVel.x, accel * dt)
    vel.z = approach(vel.z, desiredVel.z, accel * dt)

    // Jump.
    const canJump = this.coyoteTimer > 0
    const wantsJump = this.jumpBufferTimer > 0

    if (canJump && wantsJump) {
      vel.y = cfg.jumpSpeed
      this.grounded = false
      this.coyoteTimer = 0
      this.jumpBufferTimer = 0
      this.jumpAnimTime = 0.45
      this.jumpWasRunning = !state.runHeld
    } else if (this.celebrating && this.grounded && this.celebrationHopTimer <= 0) {
      vel.y = cfg.jumpSpeed * 0.85
      this.grounded = false
      this.jumpAnimTime = 0.4
      this.jumpWasRunning = false
      const progress = this.celebrationDuration > 0
        ? 1 - this.celebrationTime / this.celebrationDuration
        : 1
      this.celebrationHopTimer = 0.45 + progress * 0.35
    }

    this.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true)
    this.desiredVel.copy(desiredVel)
  }

  sync(dt: number, allowRotate = true) {
    const t = this.body.translation()
    this.group.position.set(t.x, t.y, t.z)

    const moveSpeed = Math.sqrt(this.desiredVel.x * this.desiredVel.x + this.desiredVel.z * this.desiredVel.z)
    if (allowRotate && moveSpeed > 0.2) {
      const targetYaw = Math.atan2(this.desiredVel.x, this.desiredVel.z)
      const targetQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), targetYaw)
      this.group.quaternion.slerp(targetQ, 1 - Math.exp(-12 * dt))
    }

    const runActive = !this.input.getState().runHeld
    this.updateAnimation(dt, moveSpeed, runActive)

    if (this.jumpAnimTime > 0) {
      this.jumpAnimTime = Math.max(0, this.jumpAnimTime - dt)
    }

    if (this.jumpAnimTime === 0) {
      this.jumpWasRunning = false
    }

    if (this.celebrating) {
      this.celebrationTime = Math.max(0, this.celebrationTime - dt)
      this.celebrationHopTimer = Math.max(0, this.celebrationHopTimer - dt)
      if (this.celebrationTime === 0) {
        this.celebrating = false
      }
    }
  }

  private updateGroundInfo(cfg: PlayerConfig) {
    const pos = this.body.translation()

    const rayOrigin = { x: pos.x, y: pos.y, z: pos.z }
    const rayDir = { x: 0, y: -1, z: 0 }

    const ray = new this.physics.RAPIER.Ray(rayOrigin, rayDir)

    const maxToi = cfg.halfHeight + cfg.radius + 0.25
    const hit = this.physics.world.castRayAndGetNormal(ray, maxToi, true, undefined, undefined, this.collider)

    if (!hit) {
      this.grounded = false
      this.groundNormal.set(0, 1, 0)
      return
    }

    this.grounded = hit.timeOfImpact <= cfg.halfHeight + cfg.radius + 0.05
    this.groundNormal.set(hit.normal.x, hit.normal.y, hit.normal.z).normalize()
  }

  startCelebration(duration = 3.2) {
    this.celebrating = true
    this.celebrationTime = duration
    this.celebrationDuration = duration
    this.celebrationHopTimer = 0
  }

  stopCelebration() {
    this.celebrating = false
    this.celebrationTime = 0
    this.celebrationHopTimer = 0
    this.celebrationDuration = 0
  }

  private updateAnimation(dt: number, speedXZ: number, runActive: boolean) {
    if (!this.mixer || !this.clips.idle) return

    let next: 'idle' | 'walk' | 'run' | 'jump' | 'gallopJump'
    if (this.jumpAnimTime > 0 && !this.grounded) {
      if (this.jumpWasRunning && this.clips.gallopJump) {
        next = 'gallopJump'
      } else {
        next = 'jump'
      }
    } else if (speedXZ > 0.25) {
      next = runActive ? 'run' : 'walk'
    } else {
      next = 'idle'
    }

    if (this.celebrating && this.grounded) {
      next = 'jump'
    }



    if (this.activeActionName !== next) {
      const action = (clipName: keyof DogClipMap) => {
        const clip = this.clips[clipName]
        return clip ? this.mixer!.clipAction(clip) : null
      }

      const nextAction = action(next)
      if (nextAction) {
        if (next === 'jump' || next === 'gallopJump') {
          nextAction.setLoop(LoopOnce, 1)
          nextAction.clampWhenFinished = true
          nextAction.reset()
        } else {
          nextAction.setLoop(LoopRepeat, Infinity)
          nextAction.reset()
        }

        nextAction.play()

        if (this.activeActionName) {
          const prevAction = action(this.activeActionName)
          if (prevAction) prevAction.crossFadeTo(nextAction, 0.25, false)
        }

        this.activeActionName = next
      }
    }

    this.mixer.update(dt)
  }
}

function approach(current: number, target: number, maxDelta: number) {
  const delta = target - current
  if (Math.abs(delta) <= maxDelta) return target
  return current + Math.sign(delta) * maxDelta
}

function computeSlideDirection(normal: Vector3) {
  // Project gravity direction onto the slope plane.
  const gravity = new Vector3(0, -1, 0)
  const dot = gravity.dot(normal)
  const projected = gravity.clone().sub(normal.clone().multiplyScalar(dot))
  const len = projected.length()
  if (len < 1e-5) return new Vector3(0, 0, 0)
  return projected.multiplyScalar(1 / len)
}

