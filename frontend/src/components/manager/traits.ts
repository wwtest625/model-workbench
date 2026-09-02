import { DockerImageItem } from '../../types'

export interface ImageTraits {
  framework: string
  driver: string
  pythonTorch: string
  modelPatch: string
  aliasCount: number
  aliasRepos: string[]
}

export const parseImageTraits = (fullName: string, allImages: DockerImageItem[], currentImg: DockerImageItem) => {
    const low = fullName.toLowerCase()
    let framework = ''
    if (low.includes('sglang')) framework = 'SGLang'
    else if (low.includes('vllm')) framework = 'vLLM'
    else if (low.includes('evalscope')) framework = 'EvalScope'

    let driver = ''
    const macaMatch = fullName.match(/maca(?:\.ai|\/ai|-)?([0-9.]+)/i)
    if (macaMatch) {
      driver = `MACA ${macaMatch[1]}`
    } else if (low.includes('maca')) {
      driver = 'MACA'
    }
    const dtkMatch = fullName.match(/dtk([0-9.]+)/i)
    if (dtkMatch) {
      driver = `DTK ${dtkMatch[1]}`
    } else if (low.includes('dtk')) {
      driver = 'DTK'
    }

    const parts: string[] = []
    const torchMatch = fullName.match(/torch([0-9.]+)/i)
    const pyMatch = fullName.match(/py([0-9.]+)/i)
    if (torchMatch) parts.push(`Torch ${torchMatch[1]}`)
    if (pyMatch) parts.push(`Py ${pyMatch[1]}`)
    const pythonTorch = parts.join(' · ')

    let modelPatch = ''
    if (low.includes('dsv4') || low.includes('deepseek-v4') || low.includes('deepseek')) modelPatch = 'DeepSeek-V4'
    else if (low.includes('minimax-h3') || low.includes('minimax')) modelPatch = 'MiniMax-H3'
    else if (low.includes('mimo')) modelPatch = 'Mimo'
    else if (low.includes('qwen')) modelPatch = 'Qwen'

    const sameIdImages = allImages.filter((img) => img.image_id === currentImg.image_id)
    const aliasCount = sameIdImages.length
    const aliasRepos = Array.from(new Set(sameIdImages.map((img) => img.repository).filter((r) => r !== currentImg.repository)))

    return {
      framework,
      driver,
      pythonTorch,
      modelPatch,
      aliasCount,
      aliasRepos
    }
  }
