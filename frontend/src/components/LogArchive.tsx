import React from 'react'
import { FolderArchive, FileText, CheckCircle } from 'lucide-react'
import { LogFile } from '../types'

interface LogArchiveProps {
  logs: LogFile[]
  workspace?: string
  onRefresh?: () => void
}

export const LogArchive: React.FC<LogArchiveProps> = ({ logs, workspace = '/home/workspace' }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
          <FolderArchive className="w-4 h-4 text-indigo-400" /> 历史评测日志与打包归档 ({workspace}/benchmark_logs)
        </h3>
        <span className="text-xs text-slate-400">共 {logs.length} 个归档文件</span>
      </div>

      <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-lg overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">暂无归档日志文件</div>
        ) : (
          logs.map((log) => (
            <div
              key={log.name}
              className="p-3 bg-slate-950/40 hover:bg-slate-900/60 flex items-center justify-between transition text-xs"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-indigo-400" />
                <div>
                  <div className="font-medium text-slate-200">{log.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    大小: {log.size} · 修改时间: {log.time}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-400" /> 归档就绪
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
