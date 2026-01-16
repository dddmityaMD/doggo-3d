import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three'

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Physics } from '../physics/Physics'
import type { Terrain } from './Terrain'


type ColliderBox = {
  offset: Vector3
  half: Vector3
  yaw: number
}

export class OwnerGoal {
  readonly group = new Group()
  readonly ownerPosition = new Vector3()

  private readonly yardSize = 14
  private readonly houseOffset = new Vector3(2.5, 0, 0)
  private readonly humanOffset = new Vector3(-3, 0, -2.5)

  private readonly colliderDefs: ColliderBox[] = []
  private colliders: any[] = []
  private ownerRoot: Group | null = null
  private ownerMixer: AnimationMixer | null = null

  constructor(
    private readonly terrain: Terrain,
    private readonly physics: Physics,
  ) {
    this.build()
    void this.loadOwnerModel()
    this.reset()
  }

  reset() {
    const { width, depth } = this.terrain.config
    const halfW = width / 2
    const halfD = depth / 2

    const minRadius = Math.min(halfW, halfD) - 160
    const maxRadius = Math.min(halfW, halfD) - 60

    let placed = false
    let tries = 0

    while (!placed && tries < 60) {
      tries++

      const angle = Math.random() * Math.PI * 2
      const radius = minRadius + Math.random() * (maxRadius - minRadius)

      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius

      const slope = estimateSlopeRadians(this.terrain, x, z)
      if (slope > (28 * Math.PI) / 180) continue

      const y = this.terrain.getHeightAt(x, z)
      this.group.position.set(x, y, z)
      this.group.rotation.y = 0

      this.ownerPosition.copy(this.group.position)
      this.ownerPosition.add(this.humanOffset)
      this.ownerPosition.y = this.terrain.getHeightAt(this.ownerPosition.x, this.ownerPosition.z) + 0.9

      if (this.ownerRoot) {
        this.ownerRoot.position.copy(this.humanOffset)
        this.ownerRoot.position.y = this.ownerPosition.y - this.group.position.y
      }

      placed = true
    }

    if (!placed) {
      this.group.position.set(0, this.terrain.getHeightAt(0, 0), 0)
      this.ownerPosition.set(0, this.group.position.y + 0.9, 0)
    }

    this.rebuildColliders()
  }

  private build() {
    const fenceMat = new MeshStandardMaterial({ color: 0x7c5a34, roughness: 0.9 })
    const fencePostGeo = new BoxGeometry(0.3, 1.3, 0.3)
    const fenceRailGeo = new BoxGeometry(this.yardSize, 0.22, 0.18)

    const fenceGroup = new Group()

    for (const corner of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const post = new Mesh(fencePostGeo, fenceMat)
      post.position.set((this.yardSize / 2) * corner[0], 0.65, (this.yardSize / 2) * corner[1])
      post.castShadow = true
      post.receiveShadow = true
      fenceGroup.add(post)
    }

    const railNorth = new Mesh(fenceRailGeo, fenceMat)
    railNorth.position.set(0, 0.6, this.yardSize / 2)
    const railSouth = new Mesh(fenceRailGeo, fenceMat)
    railSouth.position.set(0, 0.6, -this.yardSize / 2)

    const railEast = new Mesh(fenceRailGeo, fenceMat)
    railEast.rotation.y = Math.PI / 2
    railEast.position.set(this.yardSize / 2, 0.6, 0)

    const railWest = new Mesh(fenceRailGeo, fenceMat)
    railWest.rotation.y = Math.PI / 2
    railWest.position.set(-this.yardSize / 2, 0.6, 0)

    for (const rail of [railNorth, railSouth, railEast, railWest]) {
      rail.castShadow = true
      rail.receiveShadow = true
      fenceGroup.add(rail)
    }

    const houseBaseGeo = new BoxGeometry(6.2, 3.4, 5.2)
    const houseBaseMat = new MeshStandardMaterial({ color: 0xc6a071, roughness: 0.85 })
    const houseBase = new Mesh(houseBaseGeo, houseBaseMat)
    houseBase.position.set(this.houseOffset.x, 1.7, this.houseOffset.z)
    houseBase.castShadow = true
    houseBase.receiveShadow = true

    const roofGeo = new ConeGeometry(4.2, 2.8, 4)
    const roofMat = new MeshStandardMaterial({ color: 0x7d2e2e, roughness: 0.85 })
    const roof = new Mesh(roofGeo, roofMat)
    roof.position.set(this.houseOffset.x, 4.1, this.houseOffset.z)
    roof.rotation.y = Math.PI / 4
    roof.castShadow = true

    const chimneyGeo = new BoxGeometry(0.8, 1.4, 0.8)
    const chimneyMat = new MeshStandardMaterial({ color: 0x6e4f3a, roughness: 0.9 })
    const chimney = new Mesh(chimneyGeo, chimneyMat)
    chimney.position.set(this.houseOffset.x + 1.6, 4.2, this.houseOffset.z - 1)
    chimney.castShadow = true

    const doorGeo = new BoxGeometry(1.1, 1.9, 0.2)
    const doorMat = new MeshStandardMaterial({ color: 0x5a3b20, roughness: 0.9 })
    const door = new Mesh(doorGeo, doorMat)
    door.position.set(this.houseOffset.x, 1, this.houseOffset.z + 2.8)
    door.castShadow = true

    const windowGeo = new BoxGeometry(0.9, 0.9, 0.15)
    const windowMat = new MeshStandardMaterial({ color: 0xb9d7f0, roughness: 0.4, metalness: 0.1 })
    const windowLeft = new Mesh(windowGeo, windowMat)
    windowLeft.position.set(this.houseOffset.x - 1.6, 2, this.houseOffset.z + 2.2)
    const windowRight = new Mesh(windowGeo, windowMat)
    windowRight.position.set(this.houseOffset.x + 1.6, 2, this.houseOffset.z + 2.2)

    const porchGeo = new BoxGeometry(2.6, 0.7, 1.9)
    const porchMat = new MeshStandardMaterial({ color: 0x8b6a3e, roughness: 0.9 })
    const porch = new Mesh(porchGeo, porchMat)
    porch.position.set(this.houseOffset.x, 0.35, this.houseOffset.z + 3.2)
    porch.receiveShadow = true

    this.group.add(
      fenceGroup,
      houseBase,
      roof,
      chimney,
      door,
      windowLeft,
      windowRight,
      porch,
    )

    this.colliderDefs.push(
      {
        offset: new Vector3(this.houseOffset.x, 1.7, this.houseOffset.z),
        half: new Vector3(3.1, 1.8, 2.6),
        yaw: 0,
      },
      {
        offset: new Vector3(this.houseOffset.x, 0.35, this.houseOffset.z + 3.2),
        half: new Vector3(1.3, 0.4, 1.0),
        yaw: 0,
      },
      {
        offset: new Vector3(0, 0.6, this.yardSize / 2),
        half: new Vector3(this.yardSize / 2, 0.25, 0.25),
        yaw: 0,
      },
      {
        offset: new Vector3(0, 0.6, -this.yardSize / 2),
        half: new Vector3(this.yardSize / 2, 0.25, 0.25),
        yaw: 0,
      },
      {
        offset: new Vector3(this.yardSize / 2, 0.6, 0),
        half: new Vector3(0.25, 0.25, this.yardSize / 2),
        yaw: 0,
      },
      {
        offset: new Vector3(-this.yardSize / 2, 0.6, 0),
        half: new Vector3(0.25, 0.25, this.yardSize / 2),
        yaw: 0,
      },
    )
  }

  update(dt: number) {
    if (this.ownerMixer) {
      this.ownerMixer.update(dt)
    }
  }

  private async loadOwnerModel() {
    try {
      const loader = new GLTFLoader()
      const url = `${import.meta.env.BASE_URL}assets/owner/Idle.glb`
      const gltf = await loader.loadAsync(url)

      const root = gltf.scene
      root.position.copy(this.humanOffset)
      root.traverse((obj) => {
        const mesh = obj as any
        if (mesh.isMesh) {
          mesh.castShadow = true
          mesh.receiveShadow = true
        }
      })

      // Fit scale roughly to our previous human height.
      const box = new Box3().setFromObject(root)
      const size = box.getSize(new Vector3())
      if (size.y > 0.0001) {
        const scale = (1.7 / size.y) * 3
        root.scale.setScalar(scale)
      }

      const boxAfter = new Box3().setFromObject(root)
      root.position.y += -boxAfter.min.y

      this.ownerRoot = root
      this.ownerMixer = gltf.animations.length ? new AnimationMixer(root) : null
      if (this.ownerMixer && gltf.animations[0]) {
        this.ownerMixer.clipAction(gltf.animations[0]).play()
      }

      this.group.add(root)
    } catch (error) {
      console.warn('Owner model load failed', error)
    }
  }

  private rebuildColliders() {
    const { RAPIER, world } = this.physics

    for (const collider of this.colliders) {
      world.removeCollider(collider, true)
    }
    this.colliders = []

    for (const def of this.colliderDefs) {
      const desc = RAPIER.ColliderDesc.cuboid(def.half.x, def.half.y, def.half.z)
      const pos = new Vector3().copy(this.group.position).add(def.offset)
      desc.setTranslation(pos.x, pos.y, pos.z)
      desc.setRotation({ x: 0, y: Math.sin(def.yaw * 0.5), z: 0, w: Math.cos(def.yaw * 0.5) })
      desc.setFriction(1.0)
      this.colliders.push(world.createCollider(desc))
    }
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

  const tan = Math.sqrt(dx * dx + dz * dz)
  return Math.atan(tan)
}
