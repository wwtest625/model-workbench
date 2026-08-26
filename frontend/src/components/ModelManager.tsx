import React, { useState } from 'react'
import { Play, Square, FileCode, Container, ScrollText, Copy, RotateCw, X, Power, Maximize2, Minimize2 } from 'lucide-react'
import { ModelCard, ModalState } from '../types'
import { CodeEditor } from './CodeEditor'
import { LogTerminal } from './LogTerminal'

interface ModelManagerProps {
  models: ModelCard[]
  operatingModel: boolean
  onStartModel: (model: ModelCard) => void
  onStopModel: (model: ModelCard) => void
  onStopAll: () => void
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void
}

export const ModelManager: React.FC<ModelManagerProps> = ({
  models,
  operatingModel,
  onStartModel,
  onStopModel,
  onStopAll,
  showToast
}) => {
  const [modal, setModal] = useState<ModalState>({
    show: false,
    type: 'script',
    title: '',
    modelName: '',
    content: '',
    loading: false
  })
  const [activeModel, setActiveModel] = useState<ModelCard | null>(null)

  const runningCount = models.filter((m) => m.status === 'RUNNING').length

  const openScript = async (m: ModelCard) => {
    setActiveModel(m)
    setModal({
      show: true,
      type: 'script',
      title: `启动脚本源码 (/home/workspace/${m.script})`,
      modelName: m.name,
      content: '正在读取远程脚本源码...',
      loading: true
    })
    try {
      const res = await fetch(`/api/v1/models/script?name=${encodeURIComponent(m.script)}`)
      const data = await res.json()
      setModal(prev => ({ ...prev, content: data.content || '(空文件)', loading: false }))
    } catch (e: any) {
      setModal(prev => ({ ...prev, content: `读取失败: ${e.message}`, loading: false }))
    }
  }

  const handleSaveScript = async (newCode: string): Promise<boolean> => {
    if (!activeModel) return false
    try {
      const res = await fetch('/api/v1/models/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: activeModel.script,
          content: newCode
        })
      })
      if (res.ok) {
        setModal(prev => ({ ...prev, content: newCode }))
        if (showToast) showToast(`脚本 ${activeModel.script} 保存成功`, 'success')
        return true
      } else {
        if (showToast) showToast('脚本保存失败', 'error')
        return false
      }
    } catch (e: any) {
      if (showToast) showToast(`保存失败: ${e.message}`, 'error')
      return false
    }
  }

  const openCompose = async (m: ModelCard) => {
    setActiveModel(m)
    setModal({
      show: true,
      type: 'command',
      title: `容器 Compose 编排语句 (/home/workspace/docker-compose-models.yml)`,
      modelName: m.name,
      content: '正在读取 docker-compose-models.yml 中的容器定义...',
      loading: true
    })
    try {
      const serviceName = m.service_name || m.container_name || m.name
      const res = await fetch(`/api/v1/models/command?service=${encodeURIComponent(serviceName)}&name=${encodeURIComponent(m.name)}`)
      const data = await res.json()
      setModal(prev => ({ ...prev, content: data.compose_yaml || '(未找到匹配的 Compose 片段)', loading: false }))
    } catch (e: any) {
      setModal(prev => ({ ...prev, content: `读取失败: ${e.message}`, loading: false }))
    }
  }

  const openLogs = async (m: ModelCard) => {
    setActiveModel(m)
    setModal({
      show: true,
      type: 'logs',
      title: `容器实时日志 (docker logs ${m.container_name || ''} / 最近 250 行)`,
      modelName: m.name,
      content: '正在拉取容器日志...',
      loading: true
    })
    await fetchLogs(m)
  }

  const fetchLogs = async (m: ModelCard) => {
    try {
      const res = await fetch(`/api/v1/models/logs?name=${encodeURIComponent(m.name)}`)
      const data = await res.json()
      setModal(prev => ({ ...prev, content: data.logs || '(暂无日志)', loading: false }))
    } catch (e: any) {
      setModal(prev => ({ ...prev, content: `拉取日志失败: ${e.message}`, loading: false }))
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(modal.content)
    if (showToast) showToast('已复制到剪贴板', 'success')
  }

  const [isLogsMaximized, setIsLogsMaximized] = useState(false)
  const [logsHeight, setLogsHeight] = useState(380)
  const [isDragging, setIsDragging] = useState(false)

  const handleStartResize = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const startY = e.clientY
    const startH = logsHeight

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY
      const nextH = Math.min(Math.max(startH + delta, 160), window.innerHeight - 70)
      setLogsHeight(nextH)
      window.dispatchEvent(new Event('resize'))
    }

    const onMouseUp = () => {
      setIsDragging(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.dispatchEvent(new Event('resize'))
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div className="space-y-4">
      {/* 顶部描述与全局一键停止 */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-slate-400">
            已配置服务: <span className="text-slate-200 font-bold font-mono">{models.length}</span>
          </span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400">
            运行中: <span className={`font-bold font-mono ${runningCount > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>{runningCount}</span>
          </span>
        </div>

        {/* 全局停止所有容器按钮 */}
        <button
          onClick={onStopAll}
          disabled={runningCount === 0}
          className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 disabled:opacity-40 disabled:hover:bg-rose-950/80 text-rose-300 border border-rose-800/60 rounded-lg text-xs transition flex items-center gap-1.5 font-medium cursor-pointer disabled:cursor-not-allowed"
          title="停止当前主机上所有运行中的大模型容器"
        >
          <Power className="w-3.5 h-3.5 text-rose-400" />
          <span>停止所有容器</span>
        </button>
      </div>

      {/* 模型卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {models.map((m) => (
          <div
            key={m.name}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between hover:border-slate-700 transition shadow-sm"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-semibold text-slate-100 text-base flex items-center gap-2">
                    <span>{m.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-mono ${
                        m.engine === 'vLLM'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                      }`}
                    >
                      {m.engine}
                    </span>
                  </h3>
                  <p className="text-sm text-slate-400 font-mono mt-1">
                    TP={m.tp} · Port={m.port} {m.pid ? `· PID:${m.pid}` : ''}
                  </p>
                </div>
                <span
                  className={`text-xs font-mono px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                    m.status === 'RUNNING'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${m.status === 'RUNNING' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span>{m.status === 'RUNNING' ? '运行中' : '已停止'}</span>
                </span>
              </div>

              {/* 镜像与脚本信息 (Repo 与 Tag 独立换行展示) */}
              {(() => {
                const imgStr = m.image || ''
                const lastColon = imgStr.lastIndexOf(':')
                const hasTag = lastColon !== -1 && !imgStr.substring(lastColon).includes('/')
                const repo = hasTag ? imgStr.substring(0, lastColon) : imgStr
                const tag = hasTag ? imgStr.substring(lastColon + 1) : 'latest'

                return (
                  <div className="bg-slate-950/60 rounded p-2.5 text-xs font-mono text-slate-400 space-y-1.5 mb-3.5 border border-slate-900">
                    <div className="space-y-1">
                      <div className="flex items-start gap-1">
                        <span className="text-slate-500 shrink-0">Repo:</span>
                        <span className="text-slate-300 font-medium break-all leading-tight" title={repo}>
                          {repo}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 shrink-0">Tag:</span>
                        <span className="text-indigo-300 font-semibold px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 break-all">
                          {tag}
                        </span>
                      </div>
                    </div>
                    <div className="pt-1.5 border-t border-slate-900 flex items-center gap-1 truncate">
                      <span className="text-slate-500 shrink-0">脚本:</span>
                      <span className="text-slate-300 font-medium truncate">{m.script}</span>
                    </div>
                  </div>
                )
              })()}

              {/* 三大透视按钮 */}
              <div className="grid grid-cols-3 gap-2 mb-3.5 text-xs">
                <button
                  onClick={() => openScript(m)}
                  className="py-1.5 px-2.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded border border-slate-700/60 flex items-center justify-center gap-1.5 transition font-medium"
                >
                  <FileCode className="w-3.5 h-3.5 text-slate-400" /> 脚本源码
                </button>
                <button
                  onClick={() => openCompose(m)}
                  className="py-1.5 px-2.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded border border-slate-700/60 flex items-center justify-center gap-1.5 transition font-medium"
                >
                  <Container className="w-3.5 h-3.5 text-slate-400" /> Compose
                </button>
                <button
                  onClick={() => openLogs(m)}
                  className="py-1.5 px-2.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded border border-slate-700/60 flex items-center justify-center gap-1.5 transition font-medium"
                >
                  <ScrollText className="w-3.5 h-3.5 text-slate-400" /> 容器日志
                </button>
              </div>
            </div>

            {/* 操作按钮 (单容器独立启停) */}
            <div className="flex items-center gap-2 pt-2.5 border-t border-slate-800/80">
              {m.status !== 'RUNNING' ? (
                <button
                  onClick={() => onStartModel(m)}
                  disabled={operatingModel}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded text-sm font-medium flex items-center justify-center gap-2 transition shadow-sm"
                >
                  <Play className="w-3.5 h-3.5" /> 启动服务
                </button>
              ) : (
                <button
                  onClick={() => onStopModel(m)}
                  className="flex-1 py-2 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-600/40 text-rose-300 rounded text-sm font-medium flex items-center justify-center gap-2 transition"
                >
                  <Square className="w-3.5 h-3.5" /> 停止服务
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 底部浮动抽屉：容器实时日志 (支持鼠标自由拉伸高度，不遮挡顶部 GPU 拓扑) */}
      {modal.show && modal.type === 'logs' && (
        <div
          style={isLogsMaximized ? { height: '88vh' } : { height: `${logsHeight}px` }}
          className={`fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t-2 border-indigo-500/80 shadow-[0_-12px_45px_rgba(0,0,0,0.85)] flex flex-col transition-[height] ${
            isDragging ? 'duration-0 select-none' : 'duration-150'
          }`}
        >
          {/* 顶部可拖拽拉伸把手条 */}
          {!isLogsMaximized && (
            <div
              onMouseDown={handleStartResize}
              className="w-full h-2.5 cursor-row-resize hover:bg-indigo-500/30 flex items-center justify-center transition-colors group select-none -mt-1 relative z-50"
              title="按住鼠标上下拖拽，自由调整日志窗口高度"
            >
              <div className="w-12 h-1 bg-slate-600 group-hover:bg-indigo-400 rounded-full transition-colors" />
            </div>
          )}

          {/* 抽屉头部 */}
          <div className="px-5 py-2 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <ScrollText className="w-4 h-4 text-indigo-400" />
              <h3 className="font-semibold text-sm text-slate-100 flex items-center gap-2 font-mono">
                <span>容器实时日志</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                  {modal.modelName}
                </span>
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setIsLogsMaximized(!isLogsMaximized)
                  setTimeout(() => window.dispatchEvent(new Event('resize')), 200)
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                title={isLogsMaximized ? '还原高度' : '最大化窗口'}
              >
                {isLogsMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setModal((prev) => ({ ...prev, show: false }))}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                title="关闭日志抽屉"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 抽屉内容主体 (LogTerminal) */}
          <div className="flex-1 overflow-hidden bg-slate-950">
            <LogTerminal
              modelName={modal.modelName}
              initialLogs={modal.content}
              isOpen={modal.show}
            />
          </div>
        </div>
      )}

      {/* 居中弹窗 Modal：用于脚本源码编辑与 Compose 预览 */}
      {modal.show && modal.type !== 'logs' && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* 弹窗头部 */}
            <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <span>{modal.title}</span>
                <span className="text-xs text-indigo-400 font-mono font-normal">({modal.modelName})</span>
              </h3>
              <div className="flex items-center gap-3">
                {modal.type === 'command' && (
                  <button
                    onClick={handleCopy}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> 复制内容
                  </button>
                )}
                <button onClick={() => setModal((prev) => ({ ...prev, show: false }))} className="text-slate-400 hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 弹窗内容主体 */}
            <div className="flex-1 overflow-hidden bg-slate-950">
              {modal.type === 'script' && activeModel ? (
                <div className="p-4 h-full">
                  <CodeEditor
                    filename={`/home/workspace/${activeModel.script}`}
                    initialCode={modal.content}
                    onSave={handleSaveScript}
                  />
                </div>
              ) : (
                <div className="p-4 h-full">
                  <div className="p-4 overflow-y-auto font-mono text-xs text-slate-300 bg-black rounded-lg h-full leading-relaxed whitespace-pre-wrap select-text">
                    {modal.content}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
