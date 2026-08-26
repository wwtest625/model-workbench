import React, { useState } from 'react'
import {
  Play,
  Square,
  FileCode,
  Container,
  ScrollText,
  Copy,
  RotateCw,
  X,
  Power,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronRight,
  Search,
  SlidersHorizontal,
  ChevronLeft
} from 'lucide-react'
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

  // 记录每个卡片的展开/折叠状态 (默认运行中的可折叠，点击标题切换)
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({})
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const toggleExpand = (modelName: string) => {
    setExpandedModels((prev) => ({
      ...prev,
      [modelName]: !prev[modelName]
    }))
  }

  const runningModels = models.filter((m) => m.status === 'RUNNING')
  const standbyModels = models.filter((m) => m.status !== 'RUNNING')
  const filteredStandby = standbyModels.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.engine.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.script || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

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
      setModal((prev) => ({ ...prev, content: data.content || '(空文件)', loading: false }))
    } catch (e: any) {
      setModal((prev) => ({ ...prev, content: `读取失败: ${e.message}`, loading: false }))
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
        setModal((prev) => ({ ...prev, content: newCode }))
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
      setModal((prev) => ({ ...prev, content: data.compose_yaml || '(未找到匹配的 Compose 片段)', loading: false }))
    } catch (e: any) {
      setModal((prev) => ({ ...prev, content: `读取失败: ${e.message}`, loading: false }))
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
      setModal((prev) => ({ ...prev, content: data.logs || '(暂无日志)', loading: false }))
    } catch (e: any) {
      setModal((prev) => ({ ...prev, content: `拉取日志失败: ${e.message}`, loading: false }))
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
      {/* 顶部控制栏与统计 */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-slate-400">
            运行中服务: <span className={`font-bold font-mono text-sm ${runningModels.length > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>{runningModels.length}</span>
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400">
            待机收纳坞: <span className="text-slate-300 font-bold font-mono text-sm">{standbyModels.length}</span>
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-500 font-mono">
            总计 {models.length} 个模型配置
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* 切换右侧待机坞显示 */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition ${
              sidebarOpen
                ? 'bg-indigo-600/10 text-indigo-300 border-indigo-500/30 hover:bg-indigo-600/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{sidebarOpen ? '收起待机坞' : `展开待机坞 (${standbyModels.length})`}</span>
          </button>

          {/* 全局停止所有容器按钮 */}
          <button
            onClick={onStopAll}
            disabled={runningModels.length === 0}
            className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 disabled:opacity-40 disabled:hover:bg-rose-950/80 text-rose-300 border border-rose-800/60 rounded-lg text-xs transition flex items-center gap-1.5 font-medium cursor-pointer disabled:cursor-not-allowed"
            title="停止当前主机上所有运行中的大模型容器"
          >
            <Power className="w-3.5 h-3.5 text-rose-400" />
            <span>停止所有容器</span>
          </button>
        </div>
      </div>

      {/* 主布局：左侧运行中核心主视窗 + 右侧未运行模型长方块收纳坞 */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* 左侧：运行中的核心容器列表 (支持折叠与展开) */}
        <div className="flex-1 w-full space-y-3.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>运行中容器 ({runningModels.length})</span>
            </h3>
            {runningModels.length > 0 && (
              <span className="text-xs text-slate-500 font-mono">点击卡片标题可自由折叠 / 展开</span>
            )}
          </div>

          {runningModels.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800/80 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
                <Container className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300">当前没有运行中的大模型容器</p>
                <p className="text-xs text-slate-500 mt-1">请从右侧【待机模型收纳坞】点击「启动服务」一键拉起容器</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {runningModels.map((m) => {
                const isExpanded = expandedModels[m.name] ?? false

                return (
                  <div
                    key={m.name}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition shadow-sm overflow-hidden"
                  >
                    {/* 折叠标题横条 (点击切换折叠/展开) */}
                    <div
                      onClick={() => toggleExpand(m.name)}
                      className="px-5 py-3.5 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/40 transition select-none"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button className="text-slate-400 hover:text-slate-200">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-indigo-400 transition-transform" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400 transition-transform" />
                          )}
                        </button>
                        <div className="flex items-center gap-2.5 truncate">
                          <span className="font-bold text-slate-100 text-sm tracking-wide truncate">
                            {m.name}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-mono font-medium shrink-0 ${
                              m.engine === 'vLLM'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            }`}
                          >
                            {m.engine}
                          </span>
                        </div>
                      </div>

                      {/* 折叠状态下右侧快捷信息与操作 */}
                      <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs font-mono text-slate-400 hidden sm:inline-block">
                          Port: <span className="text-slate-200 font-semibold">{m.port}</span>
                        </span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>运行中</span>
                        </span>

                        <button
                          onClick={() => openLogs(m)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs flex items-center gap-1 font-medium transition"
                          title="查看实时日志"
                        >
                          <ScrollText className="w-3.5 h-3.5 text-slate-400" />
                          <span className="hidden sm:inline">日志</span>
                        </button>

                        <button
                          onClick={() => onStopModel(m)}
                          className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-600/40 text-rose-300 rounded text-xs font-medium flex items-center gap-1 transition"
                          title="停止当前容器"
                        >
                          <Square className="w-3 h-3" />
                          <span>停止</span>
                        </button>
                      </div>
                    </div>

                    {/* 展开后的完整参数面板 */}
                    {isExpanded && (
                      <div className="px-5 pb-4 pt-1 border-t border-slate-800/80 bg-slate-950/40 space-y-3.5">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono pt-2">
                          <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-500 block mb-0.5">推理框架</span>
                            <span className="text-indigo-300 font-semibold">{m.engine}</span>
                          </div>
                          <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-500 block mb-0.5">并行张量 TP</span>
                            <span className="text-slate-200 font-semibold">{m.tp} 卡</span>
                          </div>
                          <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-500 block mb-0.5">服务端口</span>
                            <span className="text-slate-200 font-semibold">{m.port}</span>
                          </div>
                          <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                            <span className="text-slate-500 block mb-0.5">容器 PID</span>
                            <span className="text-slate-200 font-semibold">{m.pid || '已托管'}</span>
                          </div>
                        </div>

                        {/* 镜像 Repo / Tag 独立换行展示 */}
                        {(() => {
                          const imgStr = m.image || ''
                          const lastColon = imgStr.lastIndexOf(':')
                          const hasTag = lastColon !== -1 && !imgStr.substring(lastColon).includes('/')
                          const repo = hasTag ? imgStr.substring(0, lastColon) : imgStr
                          const tag = hasTag ? imgStr.substring(lastColon + 1) : 'latest'

                          return (
                            <div className="bg-slate-950 rounded-lg p-3 text-xs font-mono text-slate-400 space-y-1.5 border border-slate-800">
                              <div className="space-y-1">
                                <div className="flex items-start gap-1">
                                  <span className="text-slate-500 shrink-0">Docker 镜像:</span>
                                  <span className="text-slate-300 font-medium break-all" title={repo}>
                                    {repo}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-500 shrink-0">Image Tag:</span>
                                  <span className="text-indigo-300 font-semibold px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                                    {tag}
                                  </span>
                                </div>
                              </div>
                              <div className="pt-1.5 border-t border-slate-900 flex items-center gap-1 truncate">
                                <span className="text-slate-500 shrink-0">启动脚本:</span>
                                <span className="text-slate-300 font-medium truncate">{m.script}</span>
                              </div>
                            </div>
                          )
                        })()}

                        {/* 三大透视操作按钮 */}
                        <div className="grid grid-cols-3 gap-2.5 text-xs">
                          <button
                            onClick={() => openScript(m)}
                            className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center justify-center gap-1.5 transition font-medium"
                          >
                            <FileCode className="w-3.5 h-3.5 text-slate-400" />
                            <span>脚本源码</span>
                          </button>
                          <button
                            onClick={() => openCompose(m)}
                            className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center justify-center gap-1.5 transition font-medium"
                          >
                            <Container className="w-3.5 h-3.5 text-slate-400" />
                            <span>Compose 定义</span>
                          </button>
                          <button
                            onClick={() => openLogs(m)}
                            className="py-2 px-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-lg border border-indigo-500/40 flex items-center justify-center gap-1.5 transition font-medium"
                          >
                            <ScrollText className="w-3.5 h-3.5 text-indigo-400" />
                            <span>实时日志</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 右侧：未运行模型长方块收纳坞 (Standby Models Drawer) */}
        {sidebarOpen && (
          <aside className="w-full lg:w-96 shrink-0 bg-slate-900/90 border border-slate-800 rounded-2xl p-4.5 space-y-3.5 shadow-sm">
            {/* 收纳坞头部与搜索 */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Container className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-sm text-slate-100">待机模型收纳坞</h3>
                <span className="text-xs px-2 py-0.2 rounded-full bg-slate-800 text-slate-400 font-mono">
                  {standbyModels.length}
                </span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition"
                title="收起侧栏"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 搜索框 */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                placeholder="搜索模型 / 引擎..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            {/* 待机模型长方块列表 */}
            <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
              {filteredStandby.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  {searchQuery ? '没有找到匹配的待机模型' : '所有配置的模型都在运行中'}
                </div>
              ) : (
                filteredStandby.map((m) => (
                  <div
                    key={m.name}
                    className="bg-slate-950/90 border border-slate-800/90 hover:border-indigo-500/50 rounded-xl p-3 flex flex-col justify-between gap-2.5 transition shadow-sm group"
                  >
                    {/* 长方块上方：名称与引擎 */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-200 group-hover:text-white truncate" title={m.name}>
                          {m.name}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-mono">
                          <span
                            className={`px-1.5 py-0.2 rounded ${
                              m.engine === 'vLLM'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            }`}
                          >
                            {m.engine}
                          </span>
                          <span>TP={m.tp}</span>
                          <span>·</span>
                          <span>Port {m.port}</span>
                        </div>
                      </div>

                      {/* 右上状态小圆点 */}
                      <span className="w-2 h-2 rounded-full bg-slate-600 mt-1 shrink-0" title="已停止" />
                    </div>

                    {/* 长方块下方：快捷查看脚本与启动按钮 */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-900">
                      <button
                        onClick={() => openScript(m)}
                        className="py-1 px-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded text-[11px] border border-slate-800 flex items-center gap-1 transition"
                        title="查看脚本源码"
                      >
                        <FileCode className="w-3 h-3" />
                        <span>脚本</span>
                      </button>

                      <button
                        onClick={() => onStartModel(m)}
                        disabled={operatingModel}
                        className="flex-1 py-1 px-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title="立即在后台启动该模型"
                      >
                        <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                        <span>启动服务</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
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
