export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function damp(current: number, target: number, lambda: number, dt: number) {
  const t = 1 - Math.exp(-lambda * dt)
  return lerp(current, target, t)
}

export function wrapAngleRadians(angle: number) {
  const twoPi = Math.PI * 2
  return ((angle % twoPi) + twoPi) % twoPi
}
