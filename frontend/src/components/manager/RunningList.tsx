import React from 'react'
import { Square, FileCode, Container, ScrollText, RotateCw, ChevronDown, ChevronRight, Activity, AlertCircle, Tag } from 'lucide-react'
import { ModelCard } from '../../types'

interface RunningListProps {
  openLogs: (m: ModelCard) => void
  openScript: (m: ModelCard) => void
  openCompose: (m: ModelCard) => void
  operatingModel: boolean
  onStopModel: (model: ModelCard) => void
  onRestartModel?: (model: ModelCard) => void
  setStatusTab: (t: 'RUNNING' | 'STOPPED' | 'IMAGES') => void
  searchQuery: string
  filteredList: ModelCard[]
  expandedModels: any
  statusTab: any
  toggleExpand: any
}

export const RunningList: React.FC<RunningListProps> = ({ openLogs, openScript, openCompose, operatingModel, onStopModel, onRestartModel, setStatusTab, searchQuery, filteredList, expandedModels, statusTab, toggleExpand }) => {
  return (
statusTab === 'RUNNING' && (
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
                      onClick={() => (onRestartModel ? onRestartModel(m) : undefined)}
                      disabled={operatingModel}
                      className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/40 text-amber-300 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                      title="重启当前容器 (重载脚本与配置)"
                    >
                      <RotateCw className="w-3 h-3 text-amber-400" />
                      <span>重启</span>
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
    )
  )
}
