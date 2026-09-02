import React from 'react'
import { Download, Copy, Check, RotateCw, Terminal, Activity, Send } from 'lucide-react'
import { RsyncTask, DownloadTask, HubModelItem } from './types'
import { normalizeStrict, getQuantTag, formatSize } from './utils'
interface SearchResultsListProps {
  rsyncTasks: RsyncTask[]
  downloadTasks: DownloadTask[]
  searchResults: HubModelItem[]
  copiedId: string | null
  downloadingId: string | null
  openLogModal: (dir: string, name: string) => void
  openRsyncLogModal: (name: string) => void
  openDistributeModal: (item: { name: string; path?: string; server?: string; server_ip?: string }) => void
  handleStartDownload: (item: HubModelItem) => void
  handleCopy: (text: string, id: string) => void
}

export const SearchResultsList: React.FC<SearchResultsListProps> = ({ rsyncTasks, downloadTasks, searchResults, copiedId, downloadingId, openLogModal, openRsyncLogModal, openDistributeModal, handleStartDownload, handleCopy }) => {
  return (
            searchResults.map((item) => {
              const cleanName = item.name.split('/').pop() || item.name
              const activeTask = downloadTasks.find(
                (t) =>
                  t.model_id === item.id ||
                  t.local_dir === item.name ||
                  normalizeStrict(t.local_dir) === normalizeStrict(item.name)
              )
              const activeRsync = rsyncTasks.find(
                (t) => t.model_name === cleanName || normalizeStrict(t.model_name) === normalizeStrict(cleanName)
              )

              return (
                <div
                  key={item.id}
                  className={
                    'bg-slate-900/80 border rounded-xl p-4 transition flex flex-col md:flex-row md:items-center justify-between gap-4 ' +
                    (activeTask
                      ? 'border-amber-700/70 bg-gradient-to-r from-slate-900 via-amber-950/15 to-slate-900'
                      : activeRsync
                      ? 'border-cyan-700/70 bg-gradient-to-r from-slate-900 via-cyan-950/15 to-slate-900'
                      : 'border-slate-800/80 hover:border-slate-700/80')
                  }
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-semibold text-slate-100 text-sm">{item.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-950 text-slate-400 border border-slate-800">
                        {item.id}
                      </span>

                      {/* 状态徽章 (包含总进度与速度) */}
                      {activeTask ? (
                        <span className="text-xs px-2.5 py-0.5 rounded font-mono bg-amber-950/90 text-amber-300 border border-amber-700/80 flex items-center gap-1.5 font-medium shadow-sm animate-pulse">
                          <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          <span>76 下载中: {activeTask.progress}% {activeTask.dir_size ? `(${activeTask.dir_size})` : ''}</span>
                        </span>
                      ) : activeRsync ? (
                        <span className="text-xs px-2.5 py-0.5 rounded font-mono bg-cyan-950/90 text-cyan-300 border border-cyan-700/80 flex items-center gap-1.5 font-medium shadow-sm animate-pulse">
                          <RotateCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                          <span>
                            分发中 · {activeRsync.target_server === '192.2.0.146' ? '146' : '55'} ({activeRsync.progress}% · {activeRsync.speed || '同步中'})
                          </span>
                        </span>
                      ) : item.local_status === 'LOCAL_76' ? (
                        <span className="text-xs px-2 py-0.5 rounded font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-1.5 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> 已存 <span className="px-1 py-0.2 rounded bg-emerald-500/20 text-[10px] font-bold text-emerald-200">76</span>
                        </span>
                      ) : item.local_status === 'LOCAL_TEST03' ? (
                        <span className="text-xs px-2 py-0.5 rounded font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 flex items-center gap-1.5 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" /> 已存 <span className="px-1 py-0.2 rounded bg-cyan-500/20 text-[10px] font-bold text-cyan-200">29</span>
                        </span>
                      ) : (
                        <span className="text-xs px-2.5 py-0.5 rounded font-mono bg-slate-950 text-slate-500 border border-slate-800/80 flex items-center gap-1.5">
                          云端未存
                        </span>
                      )}

                      {/* 量化与架构标签区分 */}
                      {(() => {
                        const qTag = getQuantTag(item.name, item.local_meta?.quant_method)
                        if (qTag) {
                          return (
                            <span className="text-xs px-2 py-0.5 rounded font-mono bg-amber-950/70 text-amber-300 border border-amber-800/80 font-medium">
                              {qTag}
                            </span>
                          )
                        }
                        return null
                      })()}

                      {item.local_meta?.architectures?.[0] && (
                        <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-950 text-slate-400 border border-slate-800/80">
                          {item.local_meta.architectures[0]}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-400 flex items-center gap-4 font-mono">
                      <span>下载: {item.downloads.toLocaleString()}</span>
                      <span>大小: {formatSize(item.file_size)}</span>
                      <span>更新: {item.updated_at ? item.updated_at.substring(0, 10) : '近期'}</span>
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

                    {/* 卡片内下载总进度条 */}
                    {activeTask && (
                      <div className="space-y-1 pt-0.5 font-mono">
                        <div className="flex items-center justify-between text-[11px] text-amber-300">
                          <span>
                            76 下载进度: <strong className="text-amber-200">{activeTask.transferred || `${activeTask.progress}%`}</strong> ({activeTask.progress}%)
                            {activeTask.dir_size && ` · 已下载 ${activeTask.dir_size}`}
                          </span>
                          <span>{activeTask.speed && `速率: ${activeTask.speed}`}</span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <div
                            style={{ width: `${Math.max(5, activeTask.progress)}%` }}
                            className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-300 animate-pulse"
                          />
                        </div>
                      </div>
                    )}

                    {/* 路径与实时输出条 */}
                    {activeTask ? (
                      <div
                        onClick={() => openLogModal(activeTask.local_dir, item.name)}
                        className="text-xs font-mono bg-amber-950/30 border border-amber-800/60 px-2.5 py-1.5 rounded text-amber-300/90 truncate cursor-pointer hover:bg-amber-950/50 hover:border-amber-700 transition flex items-center justify-between gap-2"
                        title="点击查看 76 存储下载实时终端日志"
                      >
                        <span className="truncate flex-1 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
                          <span className="truncate">{activeTask.last_log || `落盘路径: /data/AI_model/${activeTask.local_dir}`}</span>
                        </span>
                        <span className="text-[11px] text-amber-400 font-sans font-medium underline shrink-0 flex items-center gap-1">
                          <Terminal className="w-3 h-3" /> 查看日志
                        </span>
                      </div>
                    ) : activeRsync ? (
                      <div
                        onClick={() => openRsyncLogModal(activeRsync.model_name)}
                        className="text-xs font-mono bg-cyan-950/30 border border-cyan-800/60 px-2.5 py-1.5 rounded text-cyan-300/90 truncate cursor-pointer hover:bg-cyan-950/50 hover:border-cyan-700 transition flex items-center justify-between gap-2"
                        title="点击查看分发实时传输日志"
                      >
                        <span className="truncate flex-1 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0 animate-pulse" />
                          <span className="truncate">{activeRsync.last_log || `正在分发至 ${activeRsync.target_server}:${activeRsync.target_path}`}</span>
                        </span>
                        <span className="text-[11px] text-cyan-400 font-sans font-medium underline shrink-0 flex items-center gap-1">
                          <Terminal className="w-3 h-3" /> 传输日志
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs font-mono bg-slate-950/80 px-2.5 py-1.5 rounded text-slate-400 truncate border border-slate-900">
                        {item.local_status === 'LOCAL_76' ? (
                          <span>76 路径: {item.local_path}</span>
                        ) : item.local_status === 'LOCAL_TEST03' ? (
                          <span>test03 路径: {item.local_path}</span>
                        ) : (
                          <span>{item.download_cmd}</span>
                        )}
                      </div>
                    )}
                  </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {activeTask ? (
                        <>
                          <button
                            onClick={() => openLogModal(activeTask.local_dir, item.name)}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-md shadow-amber-900/30 transition animate-pulse cursor-pointer"
                          >
                            <RotateCw className="w-4 h-4 animate-spin text-slate-950" />
                            <span>下载中 ({activeTask.progress}%)</span>
                          </button>
                          <button
                            onClick={() => openLogModal(activeTask.local_dir, item.name)}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
                            title="查看实时下载日志"
                          >
                            <Terminal className="w-4 h-4" />
                          </button>
                        </>
                      ) : activeRsync ? (
                        <>
                          <button
                            onClick={() => openRsyncLogModal(activeRsync.model_name)}
                            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-md shadow-cyan-900/30 transition animate-pulse cursor-pointer"
                          >
                            <RotateCw className="w-4 h-4 animate-spin text-slate-950" />
                            <span>分发中 ({activeRsync.progress}%)</span>
                          </button>
                          <button
                            onClick={() => openRsyncLogModal(activeRsync.model_name)}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
                            title="查看实时传输日志"
                          >
                            <Terminal className="w-4 h-4" />
                          </button>
                        </>
                      ) : (item.local_status === 'LOCAL_76' || item.local_status === 'LOCAL_TEST03') ? (
                        <>
                          <button
                            onClick={() => openDistributeModal(item)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-900/20"
                            title="一键将本地模型分发到 146 或 55 算力机"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>分发到算力机</span>
                          </button>
                          <button
                            onClick={() => handleCopy(item.local_path || (item.local_status === 'LOCAL_76' ? `/data/AI_model/${item.name}` : `/HDD_Raid/SVN_MODEL_REPO/Model/${item.name}`), item.id)}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-slate-700 transition cursor-pointer"
                            title={item.local_status === 'LOCAL_76' ? '复制 76 存储路径' : '复制 29 存储路径'}
                          >
                            {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartDownload(item)}
                            disabled={downloadingId === item.id}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>76 下载</span>
                          </button>
                          <button
                            onClick={() => handleCopy(item.download_cmd, item.id)}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-slate-700 transition cursor-pointer"
                            title="复制下载命令"
                          >
                            {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </>
                      )}
                    </div>
                </div>
              )
            })
  )
}
