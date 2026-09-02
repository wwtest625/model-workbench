// 模型名严格规范化：小写 + 去除分隔符，用于跨源模糊匹配
export const normalizeStrict = (s: string) => {
  if (!s) return ''
  return s.toLowerCase().trim().replace(/[-_.]/g, '')
}

// 从模型名/量化方式推断量化标签
export const getQuantTag = (name: string, quantMethod?: string) => {
  if (quantMethod && quantMethod !== 'none') return quantMethod.toUpperCase()
  const n = name.toUpperCase()
  if (n.includes('W8A8')) return 'W8A8'
  if (n.includes('FP8')) return 'FP8'
  if (n.includes('W4A8') || n.includes('INT4')) return 'INT4'
  if (n.includes('INT8') || n.includes('W8A16')) return 'INT8'
  if (n.includes('AWQ')) return 'AWQ'
  if (n.includes('GPTQ')) return 'GPTQ'
  return null
}

// 字节数友好显示
export const formatSize = (bytes: number) => {
  if (!bytes) return '未知大小'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}
