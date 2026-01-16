import { AnimationClip, Group } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type DogAsset = {
  root: Group
  clips: AnimationClip[]
}

export type DogClipFiles = {
  idle?: string
  run?: string
  walk?: string
  jump?: string
}

export async function loadDogSet(modelUrl: string, clipUrls: DogClipFiles): Promise<DogAsset> {
  const loader = new GLTFLoader()

  const base = await loader.loadAsync(modelUrl)
  const root = base.scene

  const clips: AnimationClip[] = []

  const addClips = (source: typeof base, nameOverride?: string) => {
    if (!source.animations.length) return

    for (const clip of source.animations) {
      const next = clip.clone()
      if (nameOverride) next.name = nameOverride
      clips.push(next)
    }
  }

  const entries = Object.entries(clipUrls) as Array<[keyof DogClipFiles, string]>

  for (const [name, url] of entries) {
    if (!url) continue

    if (url === modelUrl) {
      addClips(base, name)
      continue
    }

    const gltf = await loader.loadAsync(url)
    addClips(gltf, name)
  }

  return { root, clips }
}

export type DogClipMap = {
  idle?: AnimationClip
  walk?: AnimationClip
  run?: AnimationClip
  jump?: AnimationClip
}

export function pickDogClips(clips: AnimationClip[]): DogClipMap {
  const byName = (re: RegExp) => clips.find((c) => re.test(c.name))

  const idle = byName(/^idle$/i) ?? byName(/idle/i) ?? clips[0]
  const walk =
    byName(/^walk$/i) ??
    byName(/walk/i) ??
    byName(/trot/i) ??
    clips[1] ??
    idle
  const run =
    byName(/^run$/i) ??
    byName(/run|jog|gallop/i) ??
    clips[2] ??
    walk
  const jump = byName(/^jump$/i) ?? byName(/jump|hop/i) ?? clips[3]

  return { idle, walk, run, jump }
}
