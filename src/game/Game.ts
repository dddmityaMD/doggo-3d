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
import * as THREE from 'three'

import { Input } from './input/Input'
import { Physics } from './physics/Physics'
import { Terrain } from './world/Terrain'
import { Decor } from './world/Decor'
import { OwnerGoal } from './world/OwnerGoal'
import { OwnerArrow } from './ui/OwnerArrow'
import { Player } from './player/Player'
import { ThirdPersonCamera } from './camera/ThirdPersonCamera'
import { loadDogSet } from './assets/loadDog'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

export type GameOptions = {
  root: HTMLElement
  canvas: HTMLCanvasElement
  statusEl: HTMLElement
  noticeEl: HTMLElement
  confirmEl: HTMLElement
  confirmYes: HTMLButtonElement
  confirmNo: HTMLButtonElement
}

export class Game {
  private readonly root: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private readonly statusEl: HTMLElement
  private readonly noticeEl: HTMLElement
  private readonly confirmEl: HTMLElement
  private readonly confirmYes: HTMLButtonElement
  private readonly confirmNo: HTMLButtonElement

  private renderer!: WebGLRenderer
  private scene!: Scene
  private clock = new Clock()

  private input!: Input
  private physics!: Physics

  private terrain!: Terrain
  private decor!: Decor
  private ownerGoal!: OwnerGoal

  private player!: Player
  private cameraCtrl!: ThirdPersonCamera

  private currentDog: { root: THREE.Group; clips: THREE.AnimationClip[] } | null = null
  private currentDogTemplate: THREE.Group | null = null
  private uiArrow!: OwnerArrow
  private winAudio: HTMLAudioElement | null = null
  private bgAudio: HTMLAudioElement | null = null

  private celebrating = false
  private celebrateTimer = 0
  private awaitingRestart = false

  private running = false

  constructor(opts: GameOptions) {
    this.root = opts.root
    this.canvas = opts.canvas
    this.statusEl = opts.statusEl
    this.noticeEl = opts.noticeEl
    this.confirmEl = opts.confirmEl
    this.confirmYes = opts.confirmYes
    this.confirmNo = opts.confirmNo
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
    this.renderer.toneMappingExposure = 1.08

    this.scene = new Scene()
    this.scene.background = new Color(0x88a9d8)
    this.scene.fog = new Fog(0x88a9d8, 120, 1100)

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

    this.ownerGoal = new OwnerGoal(this.terrain, this.physics)
    this.scene.add(this.ownerGoal.group)

    this.uiArrow = new OwnerArrow(this.root)

    this.winAudio = new Audio(`${import.meta.env.BASE_URL}assets/sounds/win.mp3`)
    this.winAudio.volume = 0.6

    this.bgAudio = new Audio(`${import.meta.env.BASE_URL}assets/sounds/background.mp3`)
    this.bgAudio.loop = true
    this.bgAudio.volume = 0.35

    const spawnY = this.terrain.getHeightAt(0, 0) + 6
    this.player = new Player(this.physics, this.input, {
      spawn: new Vector3(0, spawnY, 0),
    })
    if (this.currentDogTemplate) {
      const model = cloneSkeleton(this.currentDogTemplate) as THREE.Group
      this.player.setModel(model, this.currentDog?.clips ?? [])
    }

    this.scene.add(this.player.group)

    this.cameraCtrl = new ThirdPersonCamera(this.physics, this.input)

    this.resize()
    window.addEventListener('resize', this.resize)

    await this.tryLoadDogModel()

    this.confirmYes.addEventListener('click', () => this.confirmRestart(true))
    this.confirmNo.addEventListener('click', () => this.confirmRestart(false))
    this.canvas.addEventListener('click', this.tryPlayBackground)

    this.setStatus('Кликни по сцене (мышь), чтобы играть')
    this.setNotice('')
    this.setConfirm(false)
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

    const allowMove = !this.celebrating
    this.player.applyInput(dt, this.cameraCtrl.yaw, allowMove)

    this.physics.step(dt)

    this.player.sync(dt, allowMove)
    this.ownerGoal.update(dt)

    this.cameraCtrl.update(dt, this.player.group.position)

    this.renderer.render(this.scene, this.cameraCtrl.camera)

    if (!this.celebrating) {
      this.checkOwnerFound()
    } else if (!this.awaitingRestart) {
      this.celebrateTimer -= dt
      if (this.celebrateTimer <= 0) {
        this.awaitingRestart = true
        this.player.stopCelebration()
        this.setConfirm(true)
        if (document.pointerLockElement) {
          document.exitPointerLock()
        }
      }
    }

    this.updateGoalArrow()

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
    sun.shadow.mapSize.set(4096, 4096)
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
      const asset = (name: string) => `assets/dog/${name}`

      const dog = await loadDogSet(asset('Idle.glb'), {
        idle: asset('Idle.glb'),
        run: asset('Run.glb'),
        walk: asset('Walk.glb'),
        jump: asset('Jump.glb'),
        gallopJump: asset('GallopJump.glb'),
      })
      this.currentDog = dog
      this.currentDogTemplate = cloneSkeleton(dog.root) as THREE.Group
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

  private setNotice(text: string) {
    this.noticeEl.textContent = text
    this.noticeEl.classList.toggle('hidden', !text)
  }

  private setConfirm(show: boolean) {
    this.confirmEl.classList.toggle('hidden', !show)
  }

  private checkOwnerFound() {
    const dogPos = this.player.group.position
    const ownerPos = this.ownerGoal.ownerPosition

    if (dogPos.distanceTo(ownerPos) < 2.4) {
      this.celebrating = true
      this.celebrateTimer = 4.2
      this.player.startCelebration(this.celebrateTimer)
      this.pauseBackground()
      this.playWinSound()
      this.setNotice('Вы нашли хозяина!')
    }
  }

  private confirmRestart(shouldContinue: boolean) {
    if (!this.awaitingRestart) return

    if (shouldContinue) {
      this.setConfirm(false)
      this.resetLevel()
      this.resumeBackground()
    } else {
      this.setConfirm(false)
      this.awaitingRestart = false
      this.celebrating = false
      this.setNotice('')
      this.resumeBackground()
    }

    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
  }

  private updateGoalArrow() {
    const ownerPos = this.ownerGoal.ownerPosition
    const playerPos = this.player.group.position

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.group.quaternion)
    const headingFromNorth = Math.atan2(forward.x, -forward.z)

    const distance = ownerPos.distanceTo(playerPos)
    this.uiArrow.update(ownerPos, playerPos, headingFromNorth, distance)
  }


  private resetLevel() {
    this.celebrating = false
    this.awaitingRestart = false
    this.player.stopCelebration()
    this.setNotice('')

    this.ownerGoal.reset()

    const spawnY = this.terrain.getHeightAt(0, 0) + 6
    const oldPlayer = this.player

    this.player = new Player(this.physics, this.input, {
      spawn: new Vector3(0, spawnY, 0),
    })

    if (this.currentDogTemplate) {
      const model = cloneSkeleton(this.currentDogTemplate) as THREE.Group
      this.player.setModel(model, this.currentDog?.clips ?? [])
    }

    this.scene.add(this.player.group)
    this.scene.remove(oldPlayer.group)
    oldPlayer.dispose()

    this.cameraCtrl?.update(0, this.player.group.position)
  }

  private playWinSound() {
    if (!this.winAudio) return
    this.winAudio.currentTime = 0
    void this.winAudio.play()
  }

  private tryPlayBackground = () => {
    if (!this.bgAudio) return
    if (!this.bgAudio.paused) return

    void this.bgAudio.play().catch(() => {})
  }

  private pauseBackground() {
    if (!this.bgAudio) return
    this.bgAudio.pause()
  }

  private resumeBackground() {
    if (!this.bgAudio) return
    void this.bgAudio.play().catch(() => {})
  }
}
