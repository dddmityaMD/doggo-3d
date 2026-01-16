import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PCFSoftShadowMap,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'

import { Input } from './input/Input'
import { Physics } from './physics/Physics'
import { Terrain } from './world/Terrain'
import { Decor } from './world/Decor'
import { Player } from './player/Player'
import { ThirdPersonCamera } from './camera/ThirdPersonCamera'
import { loadDogSet } from './assets/loadDog'

export type GameOptions = {
  canvas: HTMLCanvasElement
  statusEl: HTMLElement
}

export class Game {
  private readonly canvas: HTMLCanvasElement
  private readonly statusEl: HTMLElement

  private renderer!: WebGLRenderer
  private scene!: Scene
  private clock = new Clock()

  private input!: Input
  private physics!: Physics

  private terrain!: Terrain
  private decor!: Decor

  private player!: Player
  private cameraCtrl!: ThirdPersonCamera

  private running = false

  constructor(opts: GameOptions) {
    this.canvas = opts.canvas
    this.statusEl = opts.statusEl
  }

  async init() {
    this.setStatus('Инициализация…')

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    })

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFSoftShadowMap
    this.renderer.toneMapping = ACESFilmicToneMapping

    this.scene = new Scene()
    this.scene.background = new Color(0x88a9d8)
    this.scene.fog = new Fog(0x88a9d8, 80, 900)

    this.input = new Input(this.canvas)

    this.physics = await Physics.create()

    this.addLights()

    this.terrain = new Terrain({
      seed: 42,
      maxHeight: 55,
      borderHeight: 165,
    })
    this.scene.add(this.terrain.mesh)
    this.terrain.addPhysicsCollider(this.physics)

    // Safety floor (helps debug if something goes wrong with the terrain collider).
    this.addSafetyFloor()

    this.addWorldWalls()

    this.decor = new Decor(this.terrain, this.physics)
    this.scene.add(this.decor.group)

    const spawnY = this.terrain.getHeightAt(0, 0) + 6
    this.player = new Player(this.physics, this.input, {
      spawn: new Vector3(0, spawnY, 0),
    })
    this.scene.add(this.player.group)

    this.cameraCtrl = new ThirdPersonCamera(this.physics, this.input)

    this.resize()
    window.addEventListener('resize', this.resize)

    await this.tryLoadDogModel()

    this.setStatus('Кликни по сцене (мышь), чтобы играть')
  }

  start() {
    if (this.running) return
    this.running = true
    this.clock.start()
    requestAnimationFrame(this.tick)
  }

  stop() {
    this.running = false
  }

  private tick = () => {
    if (!this.running) return

    const dt = this.clock.getDelta()

    this.player.applyInput(dt, this.cameraCtrl.yaw)

    this.physics.step(dt)

    this.player.sync(dt)

    this.cameraCtrl.update(dt, this.player.group.position)

    this.renderer.render(this.scene, this.cameraCtrl.camera)

    this.input.endFrame()

    requestAnimationFrame(this.tick)
  }

  private resize = () => {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight

    this.renderer.setSize(width, height, false)
    this.cameraCtrl?.setAspect(width / height)
  }

  private addLights() {
    const hemi = new HemisphereLight(0xcfe8ff, 0x274020, 0.85)
    this.scene.add(hemi)

    const sun = new DirectionalLight(0xffffff, 1.15)
    sun.position.set(60, 130, 40)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 500
    sun.shadow.camera.left = -160
    sun.shadow.camera.right = 160
    sun.shadow.camera.top = 160
    sun.shadow.camera.bottom = -160

    this.scene.add(sun)
  }

  private addSafetyFloor() {
    const { RAPIER, world } = this.physics

    const w = this.terrain.config.width
    const d = this.terrain.config.depth

    world.createCollider(
      // NOTE: cuboid takes half-extents.
      RAPIER.ColliderDesc.cuboid(w, 40, d)
        .setTranslation(0, -260, 0)
        .setFriction(1.0),
    )
  }

  private addWorldWalls() {
    const { RAPIER, world } = this.physics

    const w = this.terrain.config.width
    const d = this.terrain.config.depth

    const thickness = 5
    const height = 80

    const halfW = w / 2
    const halfD = d / 2

    // +X
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(thickness, height, halfD + thickness)
        .setTranslation(halfW + thickness, height, 0)
        .setFriction(1.0),
    )

    // -X
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(thickness, height, halfD + thickness)
        .setTranslation(-halfW - thickness, height, 0)
        .setFriction(1.0),
    )

    // +Z
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfW + thickness, height, thickness)
        .setTranslation(0, height, halfD + thickness)
        .setFriction(1.0),
    )

    // -Z
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfW + thickness, height, thickness)
        .setTranslation(0, height, -halfD - thickness)
        .setFriction(1.0),
    )
  }

  private async tryLoadDogModel() {
    this.setStatus('Загрузка собаки (Mixamo glb)…')

    try {
      const asset = (name: string) => `${import.meta.env.BASE_URL}assets/dog/${name}`

      const dog = await loadDogSet(asset('Idle.glb'), {
        idle: asset('Idle.glb'),
        run: asset('Run.glb'),
        walk: asset('Walk.glb'),
        jump: asset('Jump.glb'),
        gallopJump: asset('GallopJump.glb'),
      })
      this.player.setModel(dog.root, dog.clips)
      this.setStatus('')
    } catch (e) {
      // Keep placeholder.
      this.setStatus('Не найдены /assets/dog/*.glb — используется placeholder')
      console.warn(e)
    }
  }

  private setStatus(text: string) {
    this.statusEl.textContent = text
    this.statusEl.style.display = text ? 'block' : 'none'
  }
}
