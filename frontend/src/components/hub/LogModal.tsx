import React from 'react'
import { Copy, Check, RotateCw, Terminal, X } from 'lucide-react'
import { LogModalState } from './types'
import { normalizeStrict, getQuantTag } from './utils'
interface LogModalProps {
  copiedId: string | null
  logModal: LogModalState | null
  setLogModal: React.Dispatch<React.SetStateAction<LogModalState | null>>
  openLogModal: (dir: string, name: string) => void
  handleCopy: (text: string, id: string) => void
}

export const LogModal: React.FC<LogModalProps> = ({ copiedId, logModal, setLogModal, openLogModal, handleCopy }) => {
  return (
      logModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-950/80 border border-amber-800/80 flex items-center justify-center">
                  <Terminal className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    76 存储服务器实时下载日志 · <span className="text-amber-300 font-mono">{logModal.name}</span>
                  </h3>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    落盘路径: /data/AI_model/{logModal.dir} · 日志: /tmp/download_{logModal.dir}.log
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openLogModal(logModal.dir, logModal.name)}
                  disabled={logModal.loading}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  title="手动刷新日志"
                >
                  <RotateCw className={'w-3.5 h-3.5 ' + (logModal.loading ? 'animate-spin' : '')} />
                  <span>刷新</span>
                </button>
                <button
                  onClick={() => handleCopy(logModal.logs, 'modal_log')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  {copiedId === 'modal_log' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>复制日志</span>
                </button>
                <button
                  onClick={() => setLogModal(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg bg-slate-800 hover:bg-slate-700 transition ml-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 bg-black overflow-y-auto font-mono text-xs text-emerald-400/90 whitespace-pre-wrap leading-relaxed select-text min-h-[350px] max-h-[550px]">
              {logModal.logs || '等待 76 存储服务器下载输出...'}
            </div>

            <div className="px-5 py-3 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>每 2.5 秒自动同步 76 存储日志</span>
              </span>
              <button
                onClick={() => setLogModal(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition cursor-pointer font-sans"
              >
                关闭窗口
              </button>
            </div>
          </div>
        </div>
      )
  )
}
