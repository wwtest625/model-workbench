import React from 'react'
import { Play, FileCode, Container, CheckCircle2, AlertCircle } from 'lucide-react'
import { ModelCard } from '../../types'

interface StoppedListProps {
  openLogs: (m: ModelCard) => void
  openScript: (m: ModelCard) => void
  openCompose: (m: ModelCard) => void
  operatingModel: boolean
  onStartModel: (model: ModelCard) => void
  searchQuery: string
  filteredList: ModelCard[]
  statusTab: any
}

export const StoppedList: React.FC<StoppedListProps> = ({ openLogs, openScript, openCompose, operatingModel, onStartModel, searchQuery, filteredList, statusTab }) => {
  return (
statusTab === 'STOPPED' && (
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
    )
  )
}
