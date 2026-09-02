import React from 'react'
import { Download, Terminal, Activity, Send } from 'lucide-react'
import { RsyncTask, DownloadTask } from './types'
import { normalizeStrict, getQuantTag } from './utils'
interface TaskBoardPanelProps {
  rsyncTasks: RsyncTask[]
  downloadTasks: DownloadTask[]
  openLogModal: (dir: string, name: string) => void
  openRsyncLogModal: (name: string) => void
}

export const TaskBoardPanel: React.FC<TaskBoardPanelProps> = ({ rsyncTasks, downloadTasks, openLogModal, openRsyncLogModal }) => {
  return (

(rsyncTasks.length > 0 || downloadTasks.length > 0) && (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono text-slate-400">
          <span className="flex items-center gap-2 font-bold text-slate-300">
            <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span>后台活跃传输任务 ({rsyncTasks.length + downloadTasks.length})</span>
          </span>
          <span>每 2.5 秒自动刷新状态</span>
        </div>

        <div className="grid grid-cols-1 gap-3 font-mono">
          {/* 独立分发任务卡片 */}
          {rsyncTasks.map((t) => (
            <div
              key={t.pid}
              className="bg-slate-900/95 border-2 border-cyan-500/50 rounded-xl p-4 shadow-lg space-y-2.5 transition"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[11px] font-bold flex items-center gap-1">
                    <Send className="w-3 h-3" /> 分发中
                  </span>
                  <span className="font-bold text-slate-100 text-sm">{t.model_name}</span>
                  <span className="text-slate-400 text-xs">
                    76 ➡️ <strong className="text-cyan-300">{t.target_server === '192.2.0.146' ? '146 (沐曦 16卡)' : t.target_server}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-300">
                  {t.speed && (
                    <span className="text-cyan-400 flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5" /> 速率: {t.speed}
                    </span>
                  )}
                  <button
                    onClick={() => openRsyncLogModal(t.model_name)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded border border-slate-700 flex items-center gap-1 transition cursor-pointer text-xs"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>查看日志</span>
                  </button>
                </div>
              </div>

              {/* 独立平稳进度条 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>
                    传输进度: <strong className="text-cyan-300">{t.transferred || `进度 ${t.progress}%`}</strong> ({t.progress}%)
                  </span>
                  <span className="text-slate-500 font-mono">目标: {t.target_path}</span>
                </div>
                <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    style={{ width: `${Math.max(4, t.progress)}%` }}
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(6,182,212,0.4)]"
                  />
                </div>
              </div>
            </div>
          ))}

          {/* 独立下载任务卡片 */}
          {downloadTasks.map((t) => (
            <div
              key={t.pid}
              className="bg-slate-900/95 border-2 border-amber-500/50 rounded-xl p-4 shadow-lg space-y-2.5 transition"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center gap-1">
                    <Download className="w-3 h-3" /> 下载中
                  </span>
                  <span className="font-bold text-slate-100 text-sm">{t.local_dir}</span>
                  <span className="text-slate-400 text-xs font-mono">{t.model_id}</span>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-300">
                  {t.dir_size && (
                    <span className="text-slate-300">已下载: <strong className="text-amber-300">{t.dir_size}</strong></span>
                  )}
                  {t.speed && (
                    <span className="text-amber-400 flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5" /> 速率: {t.speed}
                    </span>
                  )}
                  <button
                    onClick={() => openLogModal(t.local_dir, t.model_id)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700 flex items-center gap-1 transition cursor-pointer text-xs"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>查看日志</span>
                  </button>
                </div>
              </div>

              {/* 独立平稳进度条 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>
                    下载进度: <strong className="text-amber-300">{t.transferred || `进度 ${t.progress}%`}</strong> ({t.progress}%)
                  </span>
                  <span className="text-slate-500 font-mono">76 存储: /data/AI_model/{t.local_dir}</span>
                </div>
                <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    style={{ width: `${Math.max(4, t.progress || 10)}%` }}
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )

  )
}
