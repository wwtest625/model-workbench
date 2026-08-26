import React, { useState } from 'react'
import { Play, Square, FileCode, Container, ScrollText, Copy, RotateCw, X, Power } from 'lucide-react'
import { ModelCard, ModalState } from '../types'
import { CodeEditor } from './CodeEditor'

interface ModelManagerProps {
  models: ModelCard[]
  operatingModel: boolean
  onStartModel: (model: ModelCard) => void
  onStopAll: () => void
}

export const ModelManager: React.FC<ModelManagerProps> = ({
  models,
  operatingModel,
  onStartModel,
  onStopAll
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
      setModal(prev => ({ ...prev, content: data.content, loading: false }))
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
      const data = await res.json()
      if (res.ok) {
        setModal(prev => ({ ...prev, content: newCode }))
        alert(data.message || '保存成功！')
        return true
      } else {
        alert(`保存失败: ${data.error || '未知错误'}`)
        return false
      }
    } catch (e: any) {
      alert(`保存失败: ${e.message}`)
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
    alert('已复制到剪贴板！')
  }

  return (
    <div className="space-y-4">
      {/* 顶部描述与一键停止 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          基于标准模式自动感知与编排管理（支持 <code className="text-indigo-300">start_*.sh</code> 及 <code className="text-indigo-300">docker-compose-models.yml</code>）：
        </p>
        <button
          onClick={onStopAll}
          className="px-3 py-1 bg-rose-950 text-rose-300 border border-rose-800/60 rounded text-xs hover:bg-rose-900 transition flex items-center gap-1"
        >
          <Power className="w-3.5 h-3.5" />
          <span>停止全部推理服务</span>
        </button>
      </div>

      {/* 模型卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {models.map((m) => (
          <div
            key={m.name}
            className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition shadow-sm"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-1.5">
                    <span>{m.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        m.engine === 'vLLM'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                      }`}
                    >
                      {m.engine}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    TP={m.tp} · Port={m.port} {m.pid ? `· PID:${m.pid}` : ''}
                  </p>
                </div>
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    m.status === 'RUNNING'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${m.status === 'RUNNING' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span>{m.status === 'RUNNING' ? '运行中' : '已停止'}</span>
                </span>
              </div>

              {/* 镜像与脚本信息 */}
              <div className="bg-slate-950/60 rounded p-2 text-xs font-mono text-slate-400 space-y-1 mb-3">
                <div className="truncate" title={m.image}>
                  <span className="text-slate-500">镜像:</span> <span className="text-slate-300">{m.image}</span>
                </div>
                <div className="truncate">
                  <span className="text-slate-500">脚本:</span> <span className="text-indigo-400">{m.script}</span>
                </div>
              </div>

              {/* 三大透视按钮 */}
              <div className="grid grid-cols-3 gap-1.5 mb-3 text-[11px]">
                <button
                  onClick={() => openScript(m)}
                  className="py-1 px-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded border border-slate-700/60 flex items-center justify-center gap-1 transition"
                >
                  <FileCode className="w-3 h-3 text-slate-400" /> 脚本源码
                </button>
                <button
                  onClick={() => openCompose(m)}
                  className="py-1 px-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded border border-slate-700/60 flex items-center justify-center gap-1 transition"
                >
                  <Container className="w-3 h-3 text-slate-400" /> Compose
                </button>
                <button
                  onClick={() => openLogs(m)}
                  className="py-1 px-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded border border-slate-700/60 flex items-center justify-center gap-1 transition"
                >
                  <ScrollText className="w-3 h-3 text-slate-400" /> 容器日志
                </button>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
              {m.status !== 'RUNNING' ? (
                <button
                  onClick={() => onStartModel(m)}
                  disabled={operatingModel}
                  className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5 transition shadow-sm"
                >
                  <Play className="w-3 h-3" /> 启动服务
                </button>
              ) : (
                <button
                  onClick={onStopAll}
                  className="flex-1 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-600/40 text-rose-300 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition"
                >
                  <Square className="w-3 h-3" /> 停止服务
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 弹窗 Modal */}
      {modal.show && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* 弹窗头部 */}
            <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <span>{modal.title}</span>
                <span className="text-xs text-indigo-400 font-mono font-normal">({modal.modelName})</span>
              </h3>
              <div className="flex items-center gap-3">
                {modal.type !== 'script' && (
                  <button
                    onClick={handleCopy}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> 复制内容
                  </button>
                )}
                {modal.type === 'logs' && activeModel && (
                  <button
                    onClick={() => fetchLogs(activeModel)}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs flex items-center gap-1"
                  >
                    <RotateCw className={`w-3 h-3 ${modal.loading ? 'animate-spin' : ''}`} /> 刷新日志
                  </button>
                )}
                <button onClick={() => setModal(prev => ({ ...prev, show: false }))} className="text-slate-400 hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 弹窗内容主体 */}
            <div className="flex-1 overflow-hidden p-4 bg-slate-950">
              {modal.type === 'script' && activeModel ? (
                <CodeEditor
                  filename={`/home/workspace/${activeModel.script}`}
                  initialCode={modal.content}
                  onSave={handleSaveScript}
                />
              ) : (
                <div className="p-4 overflow-y-auto font-mono text-xs text-slate-300 bg-black rounded-lg h-full leading-relaxed whitespace-pre-wrap select-text">
                  {modal.content}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
