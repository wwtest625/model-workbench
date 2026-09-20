/**
 * 跨浏览器/跨协议剪贴板工具
 * 支持安全上下文 (HTTPS/localhost 下的 navigator.clipboard)
 * 以及非安全上下文 (HTTP 内网 IP 下降级到 execCommand)
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false

  // 1. 尝试现代 API (navigator.clipboard)
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (e) {
      console.warn('navigator.clipboard.writeText 抛出异常，尝试降级:', e)
    }
  }

  // 2. 降级方案：创建隐藏 textarea 执行 execCommand('copy')
  try {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.top = '0'
    textArea.style.left = '0'
    textArea.style.width = '2em'
    textArea.style.height = '2em'
    textArea.style.padding = '0'
    textArea.style.border = 'none'
    textArea.style.outline = 'none'
    textArea.style.boxShadow = 'none'
    textArea.style.background = 'transparent'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textArea)
    return successful
  } catch (err) {
    console.error('execCommand 复制失败:', err)
    return false
  }
}
