import { Vector3 } from 'three'

export class OwnerArrow {
  private readonly compass: HTMLDivElement
  private readonly needle: HTMLDivElement

  constructor(private readonly root: HTMLElement) {
    this.compass = document.createElement('div')
    this.compass.id = 'owner-compass'

    this.needle = document.createElement('div')
    this.needle.id = 'owner-compass-needle'

    const tip = document.createElement('div')
    tip.id = 'owner-compass-tip'
    this.needle.appendChild(tip)

    this.compass.appendChild(this.needle)
    this.root.appendChild(this.compass)
  }

  update(owner: Vector3, player: Vector3, headingFromNorth: number, distance: number) {
    if (!Number.isFinite(distance)) return

    const dx = owner.x - player.x
    const dz = owner.z - player.z

    // World compass: north = -Z, east = +X.
    const angleToOwner = Math.atan2(dx, -dz)
    const relative = angleToOwner - headingFromNorth + Math.PI
    const normalized = Math.atan2(Math.sin(relative), Math.cos(relative))
    const deg = (normalized * 180) / Math.PI

    this.needle.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`
    this.compass.style.opacity = distance < 14 ? '0' : '1'
  }
}
