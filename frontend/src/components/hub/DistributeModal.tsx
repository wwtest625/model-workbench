import React from 'react'
import { X, Send } from 'lucide-react'
import { DistributeModalState } from './types'
import { normalizeStrict, getQuantTag } from './utils'
interface DistributeModalProps {
  distributeModal: DistributeModalState | null
  setDistributeModal: React.Dispatch<React.SetStateAction<DistributeModalState | null>>
  handleConfirmDistribute: () => void
}

export const DistributeModal: React.FC<DistributeModalProps> = ({ distributeModal, setDistributeModal, handleConfirmDistribute }) => {
  return (

distributeModal?.open && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center">
                <Send className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">大模型算力机后台一键分发</h3>
                <p className="text-xs font-mono text-slate-400 mt-0.5">模型: {distributeModal.name}</p>
              </div>
            </div>
            <button onClick={() => setDistributeModal(null)} className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-4 text-xs font-mono">
            <div className="space-y-1.5">
              <label className="text-slate-400 font-sans font-medium">源存储位置:</label>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 break-all">
                {distributeModal.sourceServer}:{distributeModal.sourcePath}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-slate-400 font-sans font-medium">选择目标算力节点:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setDistributeModal((prev) =>
                      prev ? { ...prev, targetServer: '192.2.0.146', targetPath: `/data/model/${prev.name}` } : null
                    )
                  }
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1 cursor-pointer ${
                    distributeModal.targetServer === '192.2.0.146'
                      ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold font-sans text-xs flex items-center justify-between">
                    <span>146 · 沐曦 16卡</span>
                    {distributeModal.targetServer === '192.2.0.146' && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                  </div>
                  <span className="text-[11px] text-slate-400">192.2.0.146 (免密就绪)</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDistributeModal((prev) =>
                      prev ? { ...prev, targetServer: '192.7.9.55', targetPath: `/data/model/${prev.name}` } : null
                    )
                  }
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1 cursor-pointer ${
                    distributeModal.targetServer === '192.7.9.55'
                      ? 'bg-indigo-950/60 border-indigo-600 text-indigo-200 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold font-sans text-xs flex items-center justify-between">
                    <span>55 · 海光 8卡</span>
                    {distributeModal.targetServer === '192.7.9.55' && <span className="w-2 h-2 rounded-full bg-indigo-400" />}
                  </div>
                  <span className="text-[11px] text-slate-400">192.7.9.55 (免密就绪)</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-400 font-sans font-medium">目标落盘路径:</label>
              <input
                type="text"
                value={distributeModal.targetPath}
                onChange={(e) => setDistributeModal((prev) => (prev ? { ...prev, targetPath: e.target.value } : null))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-600 font-mono text-xs"
              />
            </div>

            <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 font-sans">
              💡 说明：分发采用带 <span className="text-slate-200 font-mono">--info=progress2</span> 的原子断点续传并在 76 存储服务器后台运行，提供全局总进度与 ETA，不占用本机与 WSL 流量。
            </div>
          </div>

          <div className="px-6 py-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-end gap-3 font-sans">
            <button
              onClick={() => setDistributeModal(null)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleConfirmDistribute}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md flex items-center gap-1.5 transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>立即启动后台分发</span>
            </button>
          </div>
        </div>
      </div>
    )

  )
}
