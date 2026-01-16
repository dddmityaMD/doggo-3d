import { AnimationClip, Group } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type BerryAsset = {
  root: Group
  clips: AnimationClip[]
}

export async function loadBerryModel(url: string): Promise<BerryAsset> {
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync(url)
  return { root: gltf.scene, clips: gltf.animations }
}
