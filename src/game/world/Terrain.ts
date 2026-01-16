import { BufferAttribute, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'
import { createNoise2D } from 'simplex-noise'

import type { Physics } from '../physics/Physics'

export type TerrainConfig = {
  size: number
  width: number
  depth: number
  maxHeight: number
  seed: number
  borderWidth: number
  borderHeight: number
}

export class Terrain {
  readonly config: TerrainConfig
  readonly heights: Float32Array
  readonly mesh: Mesh

  private readonly stepX: number
  private readonly stepZ: number

  constructor(config?: Partial<TerrainConfig>) {
    this.config = {
      size: 513,
      width: 1000,
      depth: 1000,
      maxHeight: 55,
      seed: 1337,
      borderWidth: 120,
      borderHeight: 140,
      ...config,
    }

    const { size, width, depth } = this.config
    this.stepX = width / (size - 1)
    this.stepZ = depth / (size - 1)

    this.heights = new Float32Array(size * size)
    this.generateHeights()

    this.mesh = this.buildMesh()
  }

  addPhysicsCollider(physics: Physics) {
    const { RAPIER, world } = physics

    const geometry = this.mesh.geometry
    const positionAttr = geometry.attributes.position as BufferAttribute
    const positions = new Float32Array(positionAttr.array)

    const indexAttr = geometry.index
    if (!indexAttr) {
      throw new Error('Terrain geometry is missing indices')
    }

    const indices =
      indexAttr.array instanceof Uint32Array
        ? indexAttr.array
        : new Uint32Array(indexAttr.array)

    const colliderDesc = RAPIER.ColliderDesc.trimesh(positions, indices)
    colliderDesc.setFriction(1.0)

    world.createCollider(colliderDesc)
  }

  getHeightAt(x: number, z: number) {
    const { width, depth, size } = this.config

    const localX = x + width / 2
    const localZ = z + depth / 2

    const gx = localX / this.stepX
    const gz = localZ / this.stepZ

    const ix = Math.floor(gx)
    const iz = Math.floor(gz)

    const fx = gx - ix
    const fz = gz - iz

    const x0 = clampInt(ix, 0, size - 1)
    const x1 = clampInt(ix + 1, 0, size - 1)
    const z0 = clampInt(iz, 0, size - 1)
    const z1 = clampInt(iz + 1, 0, size - 1)

    const h00 = this.heights[x0 * size + z0]
    const h10 = this.heights[x1 * size + z0]
    const h01 = this.heights[x0 * size + z1]
    const h11 = this.heights[x1 * size + z1]

    const hx0 = h00 + (h10 - h00) * fx
    const hx1 = h01 + (h11 - h01) * fx
    return hx0 + (hx1 - hx0) * fz
  }

  private generateHeights() {
    const rand = mulberry32(this.config.seed)
    const noise2D = createNoise2D(rand)

    const { size, width, depth, maxHeight, borderWidth, borderHeight } = this.config

    // Coordinates in world-space: [-width/2..width/2], [-depth/2..depth/2]
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const wx = (x / (size - 1) - 0.5) * width
        const wz = (z / (size - 1) - 0.5) * depth

        const h = this.heightFn(noise2D, wx, wz, maxHeight)
        const border = borderMountain(wx, wz, width, depth, borderWidth, borderHeight)

        // Rapier heightfield expects column-major order.
        this.heights[x * size + z] = h + border
      }
    }
  }

  private heightFn(
    noise2D: (x: number, y: number) => number,
    x: number,
    z: number,
    maxHeight: number,
  ) {
    // Multi-octave simplex noise.
    let amplitude = 1
    let frequency = 0.0022

    let n = 0
    let ampSum = 0

    for (let i = 0; i < 5; i++) {
      n += noise2D(x * frequency, z * frequency) * amplitude
      ampSum += amplitude

      amplitude *= 0.5
      frequency *= 2
    }

    n /= ampSum

    // Shape it a bit: flatter plains + sharper peaks.
    const shaped = Math.sign(n) * Math.pow(Math.abs(n), 1.35)
    return shaped * maxHeight
  }

  private buildMesh() {
    const { width, depth, size } = this.config

    const geometry = new PlaneGeometry(width, depth, size - 1, size - 1)
    geometry.rotateX(-Math.PI / 2)

    const position = geometry.attributes.position as BufferAttribute
    for (let i = 0; i < position.count; i++) {
      const x = i % size
      const z = Math.floor(i / size)

      // After rotateX, Y is up.
      const y = this.heights[x * size + z]
      position.setY(i, y)
    }

    position.needsUpdate = true
    geometry.computeVertexNormals()

    const material = new MeshStandardMaterial({
      color: 0x2d6a32,
      roughness: 1.0,
      metalness: 0.0,
    })

    const mesh = new Mesh(geometry, material)
    mesh.receiveShadow = true
    return mesh
  }
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

function borderMountain(
  x: number,
  z: number,
  width: number,
  depth: number,
  borderWidth: number,
  borderHeight: number,
) {
  const halfW = width / 2
  const halfD = depth / 2

  const distToEdge = Math.min(halfW - Math.abs(x), halfD - Math.abs(z))
  if (distToEdge >= borderWidth) return 0

  const t = 1 - distToEdge / borderWidth
  return smoothstep(t) * borderHeight
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
