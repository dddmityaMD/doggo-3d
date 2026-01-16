import {
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from 'three'

import type { Physics } from '../physics/Physics'
import type { Terrain } from './Terrain'

export type DecorConfig = {
  treeCount: number
  rockCount: number
  seed: number
}

export class Decor {
  readonly group = new Group()

  constructor(
    private readonly terrain: Terrain,
    private readonly physics: Physics,
    config?: Partial<DecorConfig>,
  ) {
    const cfg: DecorConfig = {
      treeCount: 900,
      rockCount: 220,
      seed: 2026,
      ...config,
    }

    this.addTrees(cfg)
    this.addRocks(cfg)
  }

  private addTrees(cfg: DecorConfig) {
    const trunkGeo = new CylinderGeometry(0.35, 0.5, 4.2, 6)
    const trunkMat = new MeshStandardMaterial({ color: 0x5a3b20, roughness: 1 })

    const canopyGeo = new SphereGeometry(2.2, 8, 8)
    const canopyMat = new MeshStandardMaterial({ color: 0x1f6b2a, roughness: 1 })

    const trunks = new InstancedMesh(trunkGeo, trunkMat, cfg.treeCount)
    const canopies = new InstancedMesh(canopyGeo, canopyMat, cfg.treeCount)

    trunks.castShadow = true
    trunks.receiveShadow = true
    canopies.castShadow = true

    const rand = mulberry32(cfg.seed)
    const dummy = new Object3D()

    let placed = 0
    let attempts = 0

    while (placed < cfg.treeCount && attempts < cfg.treeCount * 20) {
      attempts++

      const x = (rand() - 0.5) * this.terrain.config.width
      const z = (rand() - 0.5) * this.terrain.config.depth

      // Avoid spawn area.
      if (x * x + z * z < 30 * 30) continue

      const y = this.terrain.getHeightAt(x, z)
      const slope = estimateSlopeRadians(this.terrain, x, z)
      if (slope > (55 * Math.PI) / 180) continue

      const heightScale = 0.75 + rand() * 0.6
      const yaw = rand() * Math.PI * 2

      dummy.position.set(x, y + 2.1 * heightScale, z)
      dummy.rotation.set(0, yaw, 0)
      dummy.scale.setScalar(heightScale)
      dummy.updateMatrix()
      trunks.setMatrixAt(placed, dummy.matrix)

      dummy.position.set(x, y + 4.6 * heightScale, z)
      dummy.scale.setScalar(heightScale)
      dummy.updateMatrix()
      canopies.setMatrixAt(placed, dummy.matrix)

      // Physics: cylinder around trunk.
      const colliderDesc = this.physics.RAPIER.ColliderDesc.cylinder(2.2 * heightScale, 0.55)
      colliderDesc.setTranslation(x, y + 2.2 * heightScale, z)
      colliderDesc.setFriction(1.0)
      this.physics.world.createCollider(colliderDesc)

      placed++
    }

    trunks.count = placed
    canopies.count = placed

    this.group.add(trunks, canopies)
  }

  private addRocks(cfg: DecorConfig) {
    const rockGeo = new SphereGeometry(1.6, 7, 7)
    const rockMat = new MeshStandardMaterial({ color: new Color(0x777777), roughness: 1 })

    const rocks = new InstancedMesh(rockGeo, rockMat, cfg.rockCount)
    rocks.castShadow = true
    rocks.receiveShadow = true

    const rand = mulberry32(cfg.seed + 99)
    const dummy = new Object3D()

    let placed = 0
    let attempts = 0

    while (placed < cfg.rockCount && attempts < cfg.rockCount * 30) {
      attempts++

      const x = (rand() - 0.5) * this.terrain.config.width
      const z = (rand() - 0.5) * this.terrain.config.depth
      if (x * x + z * z < 25 * 25) continue

      const y = this.terrain.getHeightAt(x, z)
      const slope = estimateSlopeRadians(this.terrain, x, z)
      if (slope > (65 * Math.PI) / 180) continue

      const s = 0.6 + rand() * 1.2
      const yaw = rand() * Math.PI * 2

      dummy.position.set(x, y + 0.8 * s, z)
      dummy.rotation.set(0, yaw, 0)
      dummy.scale.set(s * 1.2, s * 0.9, s * 1.1)
      dummy.updateMatrix()
      rocks.setMatrixAt(placed, dummy.matrix)

      const colliderDesc = this.physics.RAPIER.ColliderDesc.ball(1.2 * s)
      colliderDesc.setTranslation(x, y + 0.8 * s, z)
      colliderDesc.setFriction(1.0)
      this.physics.world.createCollider(colliderDesc)

      placed++
    }

    rocks.count = placed
    this.group.add(rocks)
  }
}

function estimateSlopeRadians(terrain: Terrain, x: number, z: number) {
  const e = 2.0
  const hL = terrain.getHeightAt(x - e, z)
  const hR = terrain.getHeightAt(x + e, z)
  const hD = terrain.getHeightAt(x, z - e)
  const hU = terrain.getHeightAt(x, z + e)

  const dx = (hR - hL) / (2 * e)
  const dz = (hU - hD) / (2 * e)

  // Gradient magnitude approximates tan(slope).
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
