import {
  AnimationClip,
  AnimationMixer,
  AnimationObjectGroup,
  Box3,
  Group,
  Object3D,
  Vector3,
} from 'three'

import type { Terrain } from './Terrain'
import { loadBerryModel } from '../assets/loadBerry'

export type BerriesConfig = {
  seed: number
  totalCount: number
  clusterMin: number
  clusterMax: number
  clusterRadius: number
  minDistanceFromSpawn: number
  pickupRadius: number
}

type BerryInstance = {
  position: Vector3
  collected: boolean
  baseScale: number
  phase: number
  popTime: number
  object: Object3D | null
}

export class Berries {
  readonly group = new Group()

  private cfg: BerriesConfig

  private readonly instances: BerryInstance[] = []

  private template: Group | null = null
  private clips: AnimationClip[] = []
  private templateScale = 1

  private mixer: AnimationMixer | null = null

  private animTime = 0

  private modelLoadPromise: Promise<void> | null = null

  constructor(
    private readonly terrain: Terrain,
    config?: Partial<BerriesConfig>,
  ) {
    this.cfg = {
      seed: 777,
      // More berries and more clusters (more "areas" on the map).
      totalCount: 70,
      clusterMin: 4,
      clusterMax: 6,
      clusterRadius: 14,
      minDistanceFromSpawn: 40,
      pickupRadius: 1.8,
      ...config,
    }

    this.modelLoadPromise = this.ensureModel()
    this.reset()
  }

  private async ensureModel() {
    if (this.template) return

    const url = `${import.meta.env.BASE_URL}assets/berries/Strawberry.glb`
    const { root, clips } = await loadBerryModel(url)

    root.updateMatrixWorld(true)

    // Fit the model roughly to our 1-unit height, then we scale per berry.
    const box = new Box3().setFromObject(root)
    const size = box.getSize(new Vector3())
    if (size.y > 0.0001) {
      this.templateScale = 1.0 / size.y
    }

    // Keep template around (not added directly to scene).
    this.template = root
    this.clips = clips

    this.rebuildObjects()
  }

  reset() {
    this.instances.length = 0
    this.animTime = 0

    const rand = mulberry32(this.cfg.seed + Math.floor(Math.random() * 1_000_000))

    const targetCount = this.cfg.totalCount
    const clusters: { center: Vector3; count: number }[] = []

    let remaining = targetCount
    while (remaining > 0) {
      const count = Math.min(
        remaining,
        this.cfg.clusterMin + Math.floor(rand() * (this.cfg.clusterMax - this.cfg.clusterMin + 1)),
      )
      remaining -= count
      clusters.push({ center: new Vector3(), count })
    }

    for (const cluster of clusters) {
      let tries = 0
      while (tries < 80) {
        tries++

        const x = (rand() - 0.5) * this.terrain.config.width
        const z = (rand() - 0.5) * this.terrain.config.depth

        if (x * x + z * z < this.cfg.minDistanceFromSpawn * this.cfg.minDistanceFromSpawn) continue

        const slope = estimateSlopeRadians(this.terrain, x, z)
        if (slope > (45 * Math.PI) / 180) continue

        const y = this.terrain.getHeightAt(x, z)
        cluster.center.set(x, y, z)
        break
      }

      for (let i = 0; i < cluster.count; i++) {
        let placed = false
        let berryTries = 0

        while (!placed && berryTries < 30) {
          berryTries++

          const angle = rand() * Math.PI * 2
          const r = Math.sqrt(rand()) * this.cfg.clusterRadius

          const x = cluster.center.x + Math.cos(angle) * r
          const z = cluster.center.z + Math.sin(angle) * r

          if (x * x + z * z < this.cfg.minDistanceFromSpawn * this.cfg.minDistanceFromSpawn) continue

          const slope = estimateSlopeRadians(this.terrain, x, z)
          if (slope > (50 * Math.PI) / 180) continue

          const y = this.terrain.getHeightAt(x, z)

          const s = 0.85 + rand() * 0.55

          this.instances.push({
            position: new Vector3(x, y + 0.6, z),
            collected: false,
            baseScale: s,
            phase: rand() * Math.PI * 2,
            popTime: 0,
            object: null,
          })

          placed = true
        }
      }
    }

    // Rebuild if model already loaded.
    this.rebuildObjects()
  }

  private rebuildObjects() {
    if (!this.template) return

    this.group.clear()
    this.mixer = null

    const canAnimate = this.clips.length > 0
    const animGroup = canAnimate ? new AnimationObjectGroup() : null

    for (const inst of this.instances) {
      const obj = this.template.clone(true)
      obj.position.copy(inst.position)

      const s = inst.baseScale * this.templateScale
      obj.scale.setScalar(s)

      obj.traverse((o) => {
        const m = o as any
        if (m.isMesh) {
          m.castShadow = true
          m.receiveShadow = true
        }
      })

      // Hide collected ones.
      obj.visible = !inst.collected

      this.group.add(obj)
      inst.object = obj

      if (animGroup) {
        animGroup.add(obj)
      }
    }

    // Play the GLB's own animation (e.g. rotation), if it has one.
    if (animGroup && this.clips[0]) {
      this.mixer = new AnimationMixer(animGroup)
      this.mixer.clipAction(this.clips[0]).play()
    }
  }

  update(dt: number) {
    this.animTime += dt

    if (this.mixer) {
      this.mixer.update(dt)
    }

    // Pulsing + pop on pickup.
    const pulseSpeed = 2.4
    const pulseAmp = 0.12

    for (const b of this.instances) {
      if (!b.object) continue

      if (b.popTime > 0) {
        b.popTime = Math.max(0, b.popTime - dt)
      }

      if (b.collected && b.popTime === 0) {
        b.object.visible = false
        continue
      }

      b.object.visible = true

      const t = this.animTime
      const pulse = 1 + Math.sin(t * pulseSpeed + b.phase) * pulseAmp

      let scale = b.baseScale * this.templateScale * pulse

      // Pop: quick scale up then vanish.
      if (b.popTime > 0) {
        const total = 0.18
        const p = 1 - b.popTime / total // 0..1

        if (p < 0.45) {
          scale *= 1 + (p / 0.45) * 0.35
        } else {
          const q = (p - 0.45) / 0.55
          scale *= Math.max(0, 1 - q)
        }

        if (b.popTime === 0) {
          scale = 0
        }
      }

      // Keep GLB's internal animation, but also rotate the whole berry a bit.
      b.object.scale.setScalar(scale)
      b.object.rotation.y += dt * 1.35
    }
  }

  /** Returns how many berries were collected this call. */
  collectNear(position: Vector3, radius = this.cfg.pickupRadius) {
    const r2 = radius * radius
    let collected = 0

    for (const b of this.instances) {
      if (b.collected) continue
      if (b.position.distanceToSquared(position) > r2) continue

      b.collected = true
      b.popTime = 0.18
      collected++
    }

    return collected
  }

  getNearestUncollected(from: Vector3) {
    let best: Vector3 | null = null
    let bestD2 = Infinity

    for (const b of this.instances) {
      if (b.collected) continue
      const d2 = b.position.distanceToSquared(from)
      if (d2 < bestD2) {
        bestD2 = d2
        best = b.position
      }
    }

    return best
  }

  async ready() {
    await this.modelLoadPromise
  }

  dispose() {
    this.group.clear()
    this.instances.length = 0
    this.mixer = null
    this.template = null
    this.clips = []
  }
}

function estimateSlopeRadians(terrain: Terrain, x: number, z: number) {
  const e = 2.2
  const hL = terrain.getHeightAt(x - e, z)
  const hR = terrain.getHeightAt(x + e, z)
  const hD = terrain.getHeightAt(x, z - e)
  const hU = terrain.getHeightAt(x, z + e)

  const dx = (hR - hL) / (2 * e)
  const dz = (hU - hD) / (2 * e)

  const tan = Math.sqrt(dx * dx + dz * dz)
  return Math.atan(tan)
}

function mulberry32(seed: number) {
  let a = seed | 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
