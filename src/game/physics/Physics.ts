import RAPIER, { type World } from '@dimforge/rapier3d-compat'

export class Physics {
  static async create() {
    await RAPIER.init()
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    return new Physics(world)
  }

  readonly RAPIER = RAPIER
  readonly world: World

  readonly fixedTimeStep = 1 / 60
  private accumulator = 0

  private constructor(world: World) {
    this.world = world
  }

  step(dt: number) {
    const maxFrame = 0.25
    this.accumulator += Math.min(dt, maxFrame)

    while (this.accumulator >= this.fixedTimeStep) {
      this.world.timestep = this.fixedTimeStep
      this.world.step()
      this.accumulator -= this.fixedTimeStep
    }
  }
}
