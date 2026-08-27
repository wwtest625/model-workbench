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
  CheckCircle2,
  Layers,
  Activity,
  AlertCircle,
  Zap
} from 'lucide-react'
import { ModelCard, ModalState } from '../types'
import { CodeEditor } from './CodeEditor'
import { DockTerminalPanel, DockTab } from './DockTerminalPanel'

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

  // 状态切片 Tab: 运行中 (READY / WARMING_UP / LOADING_WEIGHTS / INIT / LOADING / RUNNING) / 未启动 (STOPPED / FAILED)
  const isModelActive = (s: string) => s === 'READY' || s === 'WARMING_UP' || s === 'LOADING_WEIGHTS' || s === 'INIT' || s === 'LOADING' || s === 'RUNNING'
  const runningModels = models.filter((m) => isModelActive(m.status))
  const stoppedModels = models.filter((m) => !isModelActive(m.status))
  const readyCount = models.filter((m) => m.status === 'READY').length
  const loadingCount = models.filter((m) => m.status === 'WARMING_UP' || m.status === 'LOADING_WEIGHTS' || m.status === 'INIT' || m.status === 'LOADING').length
  const failedCount = models.filter((m) => m.status === 'FAILED').length

  const [statusTab, setStatusTab] = useState<'RUNNING' | 'STOPPED'>('RUNNING')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({})

  const toggleExpand = (modelName: string) => {
    setExpandedModels((prev) => ({
      ...prev,
      [modelName]: !prev[modelName]
    }))
  }

  // 当前 Tab 下的搜索过滤
  const currentList = statusTab === 'RUNNING' ? runningModels : stoppedModels
  const filteredList = currentList.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.engine.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.script || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.image || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const openScript = async (m: ModelCard) => {
    setActiveModel(m)
    setModal({
      show: true,
      type: 'script',
      title: `启动脚本源码 (${m.script})`,
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
      title: `容器 Compose 编排定义 (${m.service_name || m.name})`,
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

  // VS Code 风格底部多容器 Dock 终端状态
  const [dockTabs, setDockTabs] = useState<DockTab[]>([])
  const [activeDockTabId, setActiveDockTabId] = useState<string>('')
  const [isDockOpen, setIsDockOpen] = useState<boolean>(false)
  const [dockPaddingBottom, setDockPaddingBottom] = useState<number>(0)
  const [isScriptMaximized, setIsScriptMaximized] = useState(false)

  const openLogs = (m: ModelCard) => {
    const tabId = m.container_name || m.service_name || m.name
    setDockTabs((prev) => {
      if (prev.some((t) => t.id === tabId)) return prev
      return [
        ...prev,
        {
          id: tabId,
          modelName: m.name,
          containerName: m.container_name || m.service_name || m.name,
          status: m.status
        }
      ]
    })
    setActiveDockTabId(tabId)
    setIsDockOpen(true)
  }

  const handleCloseDockTab = (tabId: string) => {
    setDockTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId)
      if (next.length === 0) {
        setIsDockOpen(false)
      } else if (activeDockTabId === tabId) {
        setActiveDockTabId(next[next.length - 1].id)
      }
      return next
    })
  }

  const handleAddDockTab = (m: ModelCard) => {
    openLogs(m)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(modal.content)
    if (showToast) showToast('已复制到剪贴板', 'success')
  }

  return (
    <div className="space-y-4" style={{ paddingBottom: isDockOpen ? `${dockPaddingBottom + 16}px` : undefined }}>
      {/* 方案 B：全景统一控制台导航与切片栏 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3.5 shadow-sm">
        {/* 左侧状态切片器：仅保留 [运行中] 与 [未启动] */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1.5 text-xs font-medium">
          <button
            onClick={() => setStatusTab('RUNNING')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition cursor-pointer ${
              statusTab === 'RUNNING'
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              运行中 ({runningModels.length})
              {loadingCount > 0 && <span className="ml-1 text-amber-400 text-[11px]">[{loadingCount} 加载中]</span>}
            </span>
          </button>

          <button
            onClick={() => setStatusTab('STOPPED')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition cursor-pointer ${
              statusTab === 'STOPPED'
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>
              未启动 ({stoppedModels.length})
              {failedCount > 0 && <span className="ml-1 text-rose-400 text-[11px]">[{failedCount} 异常]</span>}
            </span>
          </button>
        </div>

        {/* 右侧搜索与全局停止按钮 */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder={`在 ${statusTab === 'RUNNING' ? '运行中' : '未启动'} 中搜索...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-56 sm:w-64 font-mono transition"
            />
          </div>

          <button
            onClick={onStopAll}
            disabled={runningModels.length === 0}
            className="px-3.5 py-2 bg-rose-950/80 hover:bg-rose-900 disabled:opacity-40 disabled:hover:bg-rose-950/80 text-rose-300 border border-rose-800/60 rounded-lg text-xs transition flex items-center gap-1.5 font-medium cursor-pointer disabled:cursor-not-allowed shrink-0"
            title="停止当前主机上所有运行中的大模型容器"
          >
            <Power className="w-3.5 h-3.5 text-rose-400" />
            <span>停止所有容器</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. 运行中模式 (RUNNING) */}
      {/* ========================================================================= */}
      {statusTab === 'RUNNING' && (
        <div className="space-y-3">
          {filteredList.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800/80 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
                <Container className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-300">
                  {searchQuery ? '没有找到匹配的运行中容器' : '当前没有正在运行的大模型服务'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  您可以点击上方切换至 <button onClick={() => setStatusTab('STOPPED')} className="text-indigo-400 hover:underline font-medium">【未启动】</button> 列表一键启动模型
                </p>
              </div>
            </div>
          ) : (
            filteredList.map((m) => {
              const isExpanded = expandedModels[m.name] ?? false

              return (
                <div
                  key={m.name}
                  className={`bg-slate-900 border rounded-xl transition shadow-sm overflow-hidden ${
                    m.status === 'READY'
                      ? 'border-slate-800 hover:border-slate-700'
                      : m.status === 'WARMING_UP'
                      ? 'border-amber-700/70 bg-gradient-to-r from-slate-900 via-amber-950/10 to-slate-900'
                      : m.status === 'LOADING_WEIGHTS'
                      ? 'border-yellow-700/70 bg-gradient-to-r from-slate-900 via-yellow-950/10 to-slate-900'
                      : m.status === 'INIT'
                      ? 'border-blue-700/70 bg-gradient-to-r from-slate-900 via-blue-950/10 to-slate-900'
                      : 'border-rose-700/70 bg-gradient-to-r from-slate-900 via-rose-950/15 to-slate-900'
                  }`}
                >
                  {/* 折叠标题横条 (点击切换折叠/展开) */}
                  <div
                    onClick={() => toggleExpand(m.name)}
                    className="px-5 py-3.5 flex items-center justify-between cursor-pointer select-none hover:bg-slate-800/40 transition"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <button className="p-0.5 rounded text-slate-400 hover:text-slate-200">
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

                      {/* 5 阶生命周期状态徽章 */}
                      {m.status === 'READY' ? (
                        <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 font-medium">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                          <span>服务就绪</span>
                          {m.ping_ms ? <span className="text-[10px] text-emerald-400 font-normal">({m.ping_ms}ms)</span> : null}
                        </span>
                      ) : m.status === 'WARMING_UP' ? (
                        <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/50 flex items-center gap-1.5 font-medium animate-pulse">
                          <RotateCw className="w-3 h-3 animate-spin text-amber-400" />
                          <span>图编译与预热中...</span>
                        </span>
                      ) : m.status === 'LOADING_WEIGHTS' ? (
                        <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/50 flex items-center gap-1.5 font-medium animate-pulse">
                          <RotateCw className="w-3 h-3 animate-spin text-yellow-400" />
                          <span>权重载入中...</span>
                        </span>
                      ) : m.status === 'INIT' ? (
                        <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/40 flex items-center gap-1.5 font-medium animate-pulse">
                          <RotateCw className="w-3 h-3 animate-spin text-blue-400" />
                          <span>通信初始化...</span>
                        </span>
                      ) : m.status === 'FAILED' ? (
                        <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-700/80 flex items-center gap-1.5 font-medium">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span>启动异常</span>
                        </span>
                      ) : (
                        <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>运行中</span>
                        </span>
                      )}

                      <button
                        onClick={() => openLogs(m)}
                        className="p-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs flex items-center gap-1 font-medium transition cursor-pointer"
                        title="查看实时日志"
                      >
                        <ScrollText className="w-3.5 h-3.5 text-slate-400" />
                        <span className="hidden sm:inline">日志</span>
                      </button>

                      <button
                        onClick={() => onStopModel(m)}
                        className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-600/40 text-rose-300 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                        title="停止当前容器"
                      >
                        <Square className="w-3 h-3" />
                        <span>停止</span>
                      </button>
                    </div>
                  </div>

                  {/* 状态详情横条 (实时回显权重进度、图预热、或报错提炼) */}
                  {m.status_detail && (
                    <div
                      onClick={() => openLogs(m)}
                      className={`mx-5 mb-3 px-3 py-1.5 rounded-lg text-xs font-mono border flex items-center justify-between gap-2 cursor-pointer transition ${
                        m.status === 'FAILED'
                          ? 'bg-rose-950/40 border-rose-800 text-rose-300 hover:bg-rose-950/60'
                          : m.status === 'WARMING_UP'
                          ? 'bg-amber-950/30 border-amber-800/80 text-amber-300 hover:bg-amber-950/50'
                          : m.status === 'LOADING_WEIGHTS'
                          ? 'bg-yellow-950/30 border-yellow-800/80 text-yellow-300 hover:bg-yellow-950/50'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                      title="点击直接查看实时日志"
                    >
                      <span className="truncate flex items-center gap-2">
                        <Activity className={`w-3.5 h-3.5 shrink-0 ${m.status === 'FAILED' ? 'text-rose-400' : 'text-amber-400 animate-pulse'}`} />
                        <span className="truncate">{m.status_detail}</span>
                      </span>
                      <span className="text-[11px] font-sans underline shrink-0 flex items-center gap-1 text-slate-400">
                        <ScrollText className="w-3 h-3" /> 查看日志
                      </span>
                    </div>
                  )}

                  {/* 展开后的完整参数与透视面板 */}
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
                            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1">
                              <span className="text-slate-500 text-[11px] shrink-0">镜像仓库 Repo:</span>
                              <span className="text-slate-200 font-medium break-all">{repo}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1">
                              <span className="text-slate-500 text-[11px] shrink-0">镜像标签 Tag:</span>
                              <span className="text-indigo-400 font-semibold break-all">{tag}</span>
                            </div>
                          </div>
                        )
                      })()}

                      {/* 三大透视操作栏 */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                        <button
                          onClick={() => openScript(m)}
                          className="py-2 px-3 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 flex items-center justify-center gap-1.5 transition font-medium cursor-pointer"
                        >
                          <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                          <span>启动脚本源码</span>
                        </button>
                        <button
                          onClick={() => openCompose(m)}
                          className="py-2 px-3 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 flex items-center justify-center gap-1.5 transition font-medium cursor-pointer"
                        >
                          <Container className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Compose 编排</span>
                        </button>
                        <button
                          onClick={() => openLogs(m)}
                          className="py-2 px-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-lg border border-indigo-500/40 flex items-center justify-center gap-1.5 transition font-medium cursor-pointer"
                        >
                          <ScrollText className="w-3.5 h-3.5 text-indigo-400" />
                          <span>实时日志</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. 未启动模式 (STOPPED - 规整 3 列卡片网格) */}
      {/* ========================================================================= */}
      {statusTab === 'STOPPED' && (
        <div className="space-y-4">
          {filteredList.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800/80 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-300">
                  {searchQuery ? '没有找到匹配的未启动模型' : '所有已配置的模型当前都在运行中！'}
                </p>
                <p className="text-xs text-slate-500 mt-1">您可以点击上方切换至【运行中】查看各项服务与显存状态</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredList.map((m) => (
                <div
                  key={m.name}
                  className={`bg-slate-900/90 border rounded-xl p-4 flex flex-col justify-between gap-3 transition shadow-sm group ${
                    m.status === 'FAILED'
                      ? 'border-rose-700/80 bg-gradient-to-b from-rose-950/20 to-slate-900/90'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* 卡片上部：模型名、引擎与右上紧凑启动按钮 */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-bold text-sm text-slate-200 group-hover:text-white truncate" title={m.name}>
                          {m.name}
                        </div>
                        {m.status === 'FAILED' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono flex items-center gap-1 shrink-0">
                            <AlertCircle className="w-3 h-3 text-rose-400" /> 异常退出
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400 font-mono">
                        <span
                          className={`px-2 py-0.2 rounded font-medium ${
                            m.engine === 'vLLM'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          }`}
                        >
                          {m.engine}
                        </span>
                        <span>TP={m.tp} 卡</span>
                        <span>·</span>
                        <span>Port {m.port}</span>
                      </div>
                    </div>

                    {/* 右上紧凑启动小按钮 */}
                    <button
                      onClick={() => onStartModel(m)}
                      disabled={operatingModel}
                      className="shrink-0 py-1.5 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      title="启动此模型容器服务"
                    >
                      <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                      <span>{m.status === 'FAILED' ? '重试启动' : '启动'}</span>
                    </button>
                  </div>

                  {/* 异常原因一览 (若有) */}
                  {m.status_detail && (
                    <div
                      onClick={() => openLogs(m)}
                      className="px-2.5 py-1.5 bg-rose-950/40 border border-rose-800/80 rounded-md text-[11px] font-mono text-rose-300 flex items-center justify-between gap-1 cursor-pointer hover:bg-rose-950/60 transition"
                      title="点击查看报错日志"
                    >
                      <span className="truncate flex items-center gap-1.5">
                        <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                        <span className="truncate">{m.status_detail}</span>
                      </span>
                      <span className="text-[10px] underline shrink-0">报错日志</span>
                    </div>
                  )}

                  {/* 卡片下部：脚本源码与 Compose 编排透视按钮 */}
                  <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-800/80 text-xs">
                    <button
                      onClick={() => openScript(m)}
                      className="py-1.5 px-2.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg border border-slate-800 flex items-center justify-center gap-1.5 transition font-mono cursor-pointer"
                      title="查看脚本源码"
                    >
                      <FileCode className="w-3.5 h-3.5 text-slate-500" />
                      <span>脚本源码</span>
                    </button>
                    <button
                      onClick={() => openCompose(m)}
                      className="py-1.5 px-2.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg border border-slate-800 flex items-center justify-center gap-1.5 transition font-mono cursor-pointer"
                      title="查看容器 Compose 编排"
                    >
                      <Container className="w-3.5 h-3.5 text-slate-500" />
                      <span>Compose</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 🚀 VS Code 风格底部多容器 Dock 终端面板 (支持多Tab/折叠状态栏/拖拽拉伸/页面自适应不遮挡) */}
      <DockTerminalPanel
        tabs={dockTabs}
        activeTabId={activeDockTabId}
        models={models}
        isOpen={isDockOpen}
        onSelectTab={(tabId) => setActiveDockTabId(tabId)}
        onCloseTab={handleCloseDockTab}
        onClosePanel={() => setIsDockOpen(false)}
        onAddTab={handleAddDockTab}
        onHeightChange={(h) => setDockPaddingBottom(h)}
      />

      {/* 弹窗：启动脚本代码编辑器 (Monaco Editor) 与 Compose 片段查看器 */}
      {modal.show && modal.type !== 'logs' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`bg-slate-900 border border-slate-800 rounded-2xl w-full flex flex-col shadow-2xl overflow-hidden transition-all duration-150 ${
            isScriptMaximized ? 'max-w-[96vw] h-[94vh]' : 'max-w-5xl h-[700px] max-h-[88vh]'
          }`}>
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/80 shrink-0">
              <div className="flex items-center gap-2.5">
                {modal.type === 'script' ? (
                  <FileCode className="w-5 h-5 text-indigo-400" />
                ) : (
                  <Container className="w-5 h-5 text-indigo-400" />
                )}
                <div>
                  <h3 className="font-bold text-sm text-slate-100">{modal.title}</h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    模型: <span className="text-indigo-300 font-semibold">{modal.modelName}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                  title="复制内容到剪贴板"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制</span>
                </button>
                <button
                  onClick={() => setIsScriptMaximized(!isScriptMaximized)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                  title={isScriptMaximized ? '还原窗口' : '最大化窗口'}
                >
                  {isScriptMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setModal({ ...modal, show: false })}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                  title="关闭窗口"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 弹窗主体内容 */}
            <div className="flex-1 overflow-hidden p-4 bg-slate-950 min-h-0 flex flex-col">
              {modal.type === 'script' ? (
                <CodeEditor
                  filename={activeModel?.script || 'start_script.sh'}
                  initialCode={modal.content}
                  onSave={handleSaveScript}
                />
              ) : (
                <div className="flex-1 bg-slate-950 rounded-lg border border-slate-800/80 p-4 font-mono text-xs text-slate-300 overflow-y-auto leading-relaxed whitespace-pre selection:bg-indigo-500/30">
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
