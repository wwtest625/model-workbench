import React from 'react'
import { RotateCw, Send } from 'lucide-react'
import { RsyncTask, AggregatedModelAsset } from './types'
import { normalizeStrict, getQuantTag } from './utils'
interface LocalAssetsListProps {
  filteredAggregated: AggregatedModelAsset[]
  rsyncTasks: RsyncTask[]
  openRsyncLogModal: (name: string) => void
  openDistributeModal: (item: { name: string; path?: string; server?: string; server_ip?: string }) => void
}

export const LocalAssetsList: React.FC<LocalAssetsListProps> = ({ filteredAggregated, rsyncTasks, openRsyncLogModal, openDistributeModal }) => {
  return (

filteredAggregated.map((ast, idx) => {
            const activeRsync = rsyncTasks.find(
              (t) => t.model_name === ast.name || normalizeStrict(t.model_name) === normalizeStrict(ast.name)
            )

            return (
              <div
                key={ast.key}
                className={`bg-slate-900/80 border rounded-xl p-4 transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  activeRsync
                    ? 'border-cyan-700/70 bg-gradient-to-r from-slate-900 via-cyan-950/15 to-slate-900'
                    : 'border-slate-800/80 hover:border-slate-700/80'
                }`}
              >
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-semibold text-slate-100 text-sm">{ast.name}</span>

                    {/* 存储分布徽章 (统一为已存 + 机器标签) */}
                    {ast.hasMain && (
                      <span className="text-xs px-2 py-0.5 rounded font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-1 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 已存 <strong className="text-emerald-200">76</strong>
                      </span>
                    )}
                    {ast.hasArchive && (
                      <span className="text-xs px-2 py-0.5 rounded font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 flex items-center gap-1 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> 已存 <strong className="text-cyan-200">29</strong>
                      </span>
                    )}

                    {/* 量化与架构 */}
                    {(() => {
                      const qTag = getQuantTag(ast.name, ast.quant_method)
                      if (qTag) {
                        return (
                          <span className="text-xs px-2 py-0.5 rounded font-mono bg-amber-950/70 text-amber-300 border border-amber-800/80 font-medium">
                            {qTag}
                          </span>
                        )
                      }
                      return null
                    })()}

                    {ast.model_type && (
                      <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-950 text-slate-400 border border-slate-800">
                        {ast.model_type}
                      </span>
                    )}

                    {/* 分发中动态徽章 */}
                    {activeRsync && (
                      <span className="text-xs px-2.5 py-0.5 rounded font-mono bg-cyan-950/90 text-cyan-300 border border-cyan-700/80 flex items-center gap-1.5 font-medium shadow-sm animate-pulse">
                        <RotateCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        <span>分发中 · {activeRsync.progress}% ({activeRsync.speed || '同步中'})</span>
                      </span>
                    )}
                  </div>

                  {/* 卡片内分发总进度条 */}
                  {activeRsync && (
                    <div className="space-y-1 pt-0.5 font-mono">
                      <div className="flex items-center justify-between text-[11px] text-cyan-300">
                        <span>
                          分发进度: <strong className="text-cyan-200">{activeRsync.transferred || `${activeRsync.progress}%`}</strong> ({activeRsync.progress}%)
                        </span>
                        <span>{activeRsync.speed && `速率: ${activeRsync.speed}`}</span>
                      </div>
                      <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          style={{ width: `${Math.max(5, activeRsync.progress)}%` }}
                          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-300 animate-pulse"
                        />
                      </div>
                    </div>
                  )}

                  {/* 物理存储路径列表 */}
                  <div className="space-y-1 text-xs font-mono">
                    {ast.locations.map((loc, lIdx) => (
                      <div key={lIdx} className="bg-slate-950/80 px-2.5 py-1.5 rounded text-slate-400 flex items-center justify-between gap-2 border border-slate-900">
                        <span className="truncate">
                          <strong className="text-slate-300">{loc.server_ip}:</strong> {loc.path}
                        </span>
                        <span className="text-slate-500 text-[11px] shrink-0">{loc.time}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {activeRsync ? (
                    <button
                      onClick={() => openRsyncLogModal(activeRsync.model_name)}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-md shadow-cyan-900/30 transition animate-pulse cursor-pointer"
                    >
                      <RotateCw className="w-4 h-4 animate-spin text-slate-950" />
                      <span>分发中 ({activeRsync.progress}%)</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => openDistributeModal({ name: ast.name, path: ast.locations[0]?.path, server_ip: ast.locations[0]?.server_ip })}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md flex items-center gap-1.5 transition cursor-pointer font-sans"
                      title="一键将模型权重分发到 146 或 55 算力机"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>分发到算力机</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })
  )
}
