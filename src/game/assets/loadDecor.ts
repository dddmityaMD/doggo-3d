import { Group } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type DecorAsset = {
  root: Group
}

export async function loadDecorModel(url: string): Promise<DecorAsset> {
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync(url)
  return { root: gltf.scene }
}
