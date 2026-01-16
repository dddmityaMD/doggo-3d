import { Vector3 } from 'three'

export class OwnerArrow {
  private readonly compass: HTMLDivElement
  private readonly ownerNeedle: HTMLDivElement
  private readonly berryNeedle: HTMLDivElement
  private readonly berryLabel: HTMLDivElement

  constructor(private readonly root: HTMLElement) {
    this.compass = document.createElement('div')
    this.compass.id = 'owner-compass'

    this.ownerNeedle = document.createElement('div')
    this.ownerNeedle.id = 'owner-compass-needle'

    const tip = document.createElement('div')
    tip.id = 'owner-compass-tip'
    this.ownerNeedle.appendChild(tip)

    this.berryNeedle = document.createElement('div')
    this.berryNeedle.id = 'berry-compass-needle'

    const berryTip = document.createElement('div')
    berryTip.id = 'berry-compass-tip'
    this.berryNeedle.appendChild(berryTip)

    this.berryLabel = document.createElement('div')
    this.berryLabel.id = 'berry-compass-label'

    this.compass.appendChild(this.ownerNeedle)
    this.compass.appendChild(this.berryNeedle)
    this.compass.appendChild(this.berryLabel)
    this.root.appendChild(this.compass)
  }

  update(
    owner: Vector3,
    player: Vector3,
    headingFromNorth: number,
    ownerDistance: number,
    nearestBerry: Vector3 | null,
    showBerry: boolean,
  ) {
    if (!Number.isFinite(ownerDistance)) return

    const ownerAngle = angleToTarget(owner, player, headingFromNorth)
    this.ownerNeedle.style.transform = `translate(-50%, -50%) rotate(${ownerAngle}deg)`

    if (showBerry && nearestBerry) {
      const berryAngle = angleToTarget(nearestBerry, player, headingFromNorth)
      this.berryNeedle.style.transform = `translate(-50%, -50%) rotate(${berryAngle}deg)`
      this.berryNeedle.classList.add('active', 'blinking')

      const berryDistance = nearestBerry.distanceTo(player)
      this.berryLabel.textContent = `🍓 ${Math.round(berryDistance)}m`
      this.berryLabel.classList.add('active')
    } else {
      this.berryNeedle.classList.remove('active', 'blinking')
      this.berryLabel.classList.remove('active')
    }

    this.compass.style.opacity = ownerDistance < 14 ? '0' : '1'
  }
}

function angleToTarget(target: Vector3, player: Vector3, headingFromNorth: number) {
  const dx = target.x - player.x
  const dz = target.z - player.z

  // World compass: north = -Z, east = +X.
  const angle = Math.atan2(dx, -dz)
  const relative = angle - headingFromNorth + Math.PI
  const normalized = Math.atan2(Math.sin(relative), Math.cos(relative))
  return (normalized * 180) / Math.PI
}
