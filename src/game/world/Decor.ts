import { Box3, Group, InstancedMesh, Object3D, Vector3 } from 'three'

import { loadDecorModel } from '../assets/loadDecor'

import type { Physics } from '../physics/Physics'
import type { Terrain } from './Terrain'

export type DecorConfig = {
  treeCount: number
  denseTreeCount: number
  rockCount: number
  seed: number
  denseTarget?: Vector3
}

type MeshPart = {
  mesh: Object3D
  geometry: any
  material: any
}

type MeshParts = {
  meshes: MeshPart[]
  bounds: Box3
  size: Vector3
}

export class Decor {
  readonly group = new Group()

  private readonly cfg: DecorConfig

  private treeBaseOffsetY = 0
  private treeHeight = 4.4
  private treeScaleMultiplier = 5

  private rockBaseOffsetY = 0
  private rockHeight = 2.4
  private rockRadiusBase = 1.2

  private readyPromise: Promise<void>

  constructor(
    private readonly terrain: Terrain,
    private readonly physics: Physics,
    config?: Partial<DecorConfig>,
  ) {
    this.cfg = {
      treeCount: 900,
      denseTreeCount: 240,
      rockCount: 220,
      seed: 2026,
      ...config,
    }

    this.readyPromise = this.init()
  }

  async ready() {
    await this.readyPromise
  }

  private async init() {
    const [treeAsset, rockAsset] = await Promise.all([
      loadDecorModel(`${import.meta.env.BASE_URL}assets/decor/Tree.glb`),
      loadDecorModel(`${import.meta.env.BASE_URL}assets/decor/Rock.glb`),
    ])

    const treeParts = collectMeshParts(treeAsset.root)
    const rockParts = collectMeshParts(rockAsset.root)

    this.treeBaseOffsetY = -treeParts.bounds.min.y
    this.treeHeight = Math.max(0.01, treeParts.size.y)

    this.rockBaseOffsetY = -rockParts.bounds.min.y
    this.rockHeight = Math.max(0.01, rockParts.size.y)
    this.rockRadiusBase = Math.max(rockParts.size.x, rockParts.size.y, rockParts.size.z) * 0.5

    const treeMeshes = treeParts.meshes.map((part) => {
      const mesh = new InstancedMesh(part.geometry, part.material, this.cfg.treeCount)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.group.add(mesh)
      return mesh
    })

    const rockMeshes = rockParts.meshes.map((part) => {
      const mesh = new InstancedMesh(part.geometry, part.material, this.cfg.rockCount)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.group.add(mesh)
      return mesh
    })

    const baseTreeCount = this.placeTrees(treeMeshes)
    this.placeDenseTrees(treeMeshes, baseTreeCount)
    this.placeRocks(rockMeshes)
  }

  private placeTrees(meshes: InstancedMesh[]) {
    const cfg = this.cfg
    const rand = mulberry32(cfg.seed)

    const dummy = new Object3D()

    let placed = 0
    let attempts = 0

    while (placed < cfg.treeCount && attempts < cfg.treeCount * 25) {
      attempts++

      const x = (rand() - 0.5) * this.terrain.config.width
      const z = (rand() - 0.5) * this.terrain.config.depth

      // Avoid spawn area.
      if (x * x + z * z < 30 * 30) continue

      const y = this.terrain.getHeightAt(x, z)
      const slope = estimateSlopeRadians(this.terrain, x, z)
      if (slope > (55 * Math.PI) / 180) continue

      const heightScale = (0.75 + rand() * 0.6) * this.treeScaleMultiplier
      const yaw = rand() * Math.PI * 2

      // Ground the model: compensate for GLB pivot so box.min.y touches terrain.
      const groundedY = y + this.treeBaseOffsetY * heightScale

      dummy.position.set(x, groundedY, z)
      dummy.rotation.set(0, yaw, 0)
      dummy.scale.setScalar(heightScale)
      dummy.updateMatrix()

      for (const mesh of meshes) {
        mesh.setMatrixAt(placed, dummy.matrix)
      }

      // Physics: approximate trunk with a cylinder.
      const trunkHalfHeight = (this.treeHeight * heightScale) * 0.5
      const colliderDesc = this.physics.RAPIER.ColliderDesc.cylinder(trunkHalfHeight, 0.55)
      colliderDesc.setTranslation(x, y + trunkHalfHeight, z)
      colliderDesc.setFriction(1.0)
      this.physics.world.createCollider(colliderDesc)

      placed++
    }

    for (const mesh of meshes) {
      mesh.count = placed
      mesh.instanceMatrix.needsUpdate = true
    }

    return placed
  }

  private placeDenseTrees(meshes: InstancedMesh[], startIndex: number) {
    const cfg = this.cfg
    const rand = mulberry32(cfg.seed + 133)

    const dummy = new Object3D()

    const halfW = this.terrain.config.width / 2
    const halfD = this.terrain.config.depth / 2
    const bandMin = 0.45
    const bandMax = 0.6
    const clusterCount = 2
    const clusterRadius = 110

    const clusterCenters: Vector3[] = []

    const targetCenter = cfg.denseTarget
    if (targetCenter) {
      clusterCenters.push(new Vector3(targetCenter.x, 0, targetCenter.z))
    }

    for (let i = clusterCenters.length; i < clusterCount; i++) {
      const signX = rand() > 0.5 ? 1 : -1
      const signZ = rand() > 0.5 ? 1 : -1
      const cx = signX * (bandMin + rand() * (bandMax - bandMin)) * halfW
      const cz = signZ * (bandMin + rand() * (bandMax - bandMin)) * halfD
      clusterCenters.push(new Vector3(cx, 0, cz))
    }

    let placed = 0
    let attempts = 0

    while (placed < cfg.denseTreeCount && attempts < cfg.denseTreeCount * 45) {
      attempts++

      const center = clusterCenters[Math.floor(rand() * clusterCenters.length)]
      const angle = rand() * Math.PI * 2
      const radius = Math.sqrt(rand()) * clusterRadius

      const x = center.x + Math.cos(angle) * radius
      const z = center.z + Math.sin(angle) * radius

      // Avoid spawn area.
      if (x * x + z * z < 45 * 45) continue

      const y = this.terrain.getHeightAt(x, z)
      const slope = estimateSlopeRadians(this.terrain, x, z)
      if (slope > (35 * Math.PI) / 180) continue

      const heightScale = (0.9 + rand() * 0.7) * this.treeScaleMultiplier
      const yaw = rand() * Math.PI * 2

      const groundedY = y + this.treeBaseOffsetY * heightScale

      dummy.position.set(x, groundedY, z)
      dummy.rotation.set(0, yaw, 0)
      dummy.scale.setScalar(heightScale)
      dummy.updateMatrix()

      const index = startIndex + placed
      for (const mesh of meshes) {
        mesh.setMatrixAt(index, dummy.matrix)
      }

      const trunkHalfHeight = (this.treeHeight * heightScale) * 0.5
      const colliderDesc = this.physics.RAPIER.ColliderDesc.cylinder(trunkHalfHeight, 0.65)
      colliderDesc.setTranslation(x, y + trunkHalfHeight, z)
      colliderDesc.setFriction(1.0)
      this.physics.world.createCollider(colliderDesc)

      placed++
    }

    const totalPlaced = startIndex + placed
    for (const mesh of meshes) {
      mesh.count = totalPlaced
      mesh.instanceMatrix.needsUpdate = true
    }
  }

  private placeRocks(meshes: InstancedMesh[]) {
    const cfg = this.cfg
    const rand = mulberry32(cfg.seed + 99)

    const dummy = new Object3D()

    let placed = 0
    let attempts = 0

    while (placed < cfg.rockCount && attempts < cfg.rockCount * 35) {
      attempts++

      const x = (rand() - 0.5) * this.terrain.config.width
      const z = (rand() - 0.5) * this.terrain.config.depth
      if (x * x + z * z < 25 * 25) continue

      const y = this.terrain.getHeightAt(x, z)
      const slope = estimateSlopeRadians(this.terrain, x, z)
      if (slope > (65 * Math.PI) / 180) continue

      const s = 0.6 + rand() * 1.2
      const yaw = rand() * Math.PI * 2

      const groundedY = y + this.rockBaseOffsetY * s

      dummy.position.set(x, groundedY, z)
      dummy.rotation.set(0, yaw, 0)
      dummy.scale.set(s * 1.2, s * 0.9, s * 1.1)
      dummy.updateMatrix()

      for (const mesh of meshes) {
        mesh.setMatrixAt(placed, dummy.matrix)
      }

      const radius = Math.max(0.2, this.rockRadiusBase * s)
      const centerY = y + (this.rockHeight * s) * 0.5
      const colliderDesc = this.physics.RAPIER.ColliderDesc.ball(radius)
      colliderDesc.setTranslation(x, centerY, z)
      colliderDesc.setFriction(1.0)
      this.physics.world.createCollider(colliderDesc)

      placed++
    }

    for (const mesh of meshes) {
      mesh.count = placed
      mesh.instanceMatrix.needsUpdate = true
    }
  }
}

function collectMeshParts(root: Group): MeshParts {
  root.updateMatrixWorld(true)

  const meshes: MeshPart[] = []
  const bounds = new Box3()
  let hasBounds = false

  root.traverse((obj) => {
    const m = obj as any
    if (!m.isMesh || !m.geometry || !m.material) return

    meshes.push({ mesh: m as Object3D, geometry: m.geometry, material: m.material })

    const box = new Box3().setFromObject(m)
    if (!hasBounds) {
      bounds.copy(box)
      hasBounds = true
    } else {
      bounds.union(box)
    }
  })

  if (!meshes.length) {
    throw new Error('Decor glb contains no meshes')
  }

  if (!hasBounds) {
    bounds.set(new Vector3(0, 0, 0), new Vector3(0, 0, 0))
  }

  const size = bounds.getSize(new Vector3())
  return { meshes, bounds, size }
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
