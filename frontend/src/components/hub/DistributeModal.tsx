import React, { useState, useEffect } from 'react'
import { X, Send, HardDrive, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { DistributeModalState, PreflightCheckResult } from './types'
import { normalizeStrict, getQuantTag } from './utils'

interface DistributeModalProps {
  distributeModal: DistributeModalState | null
  setDistributeModal: React.Dispatch<React.SetStateAction<DistributeModalState | null>>
  handleConfirmDistribute: () => void
}

export const DistributeModal: React.FC<DistributeModalProps> = ({ distributeModal, setDistributeModal, handleConfirmDistribute }) => {
  const [preflight, setPreflight] = useState<PreflightCheckResult | null>(null)
  const [checking, setChecking] = useState<boolean>(false)
  const [checkErr, setCheckErr] = useState<string>('')

  useEffect(() => {
    if (!distributeModal?.open) {
      setPreflight(null)
      setCheckErr('')
      return
    }

    let isMounted = true
    const runCheck = async () => {
      setChecking(true)
      setCheckErr('')
      try {
        const res = await fetch('/api/v1/transfer/preflight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_server: distributeModal.sourceServer,
            source_path: distributeModal.sourcePath,
            target_server: distributeModal.targetServer,
            target_path: distributeModal.targetPath
          })
        })
        const data = await res.json()
        if (isMounted) {
          if (!res.ok) {
            setCheckErr(data.error || '空间预检失败')
            setPreflight(null)
          } else {
            setPreflight(data)
          }
        }
      } catch (e: any) {
        if (isMounted) setCheckErr(e.message || '网络连接异常')
      } finally {
        if (isMounted) setChecking(false)
      }
    }

    const timer = setTimeout(runCheck, 300)
    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [distributeModal?.sourceServer, distributeModal?.sourcePath, distributeModal?.targetServer, distributeModal?.targetPath, distributeModal?.open])

  if (!distributeModal?.open) return null

  const isBlocked = !checking && preflight !== null && !preflight.allowed

  return (
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
            <label className="text-slate-400 font-sans font-medium">源存储路径 (源节点: {distributeModal.sourceServer}):</label>
            <input
              type="text"
              value={distributeModal.sourcePath}
              onChange={(e) => setDistributeModal((prev) => (prev ? { ...prev, sourcePath: e.target.value } : null))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-600 font-mono text-xs"
              placeholder="/data/AI_model/..."
            />
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

          {/* 前置磁盘空间预检结果卡片 */}
          <div className="space-y-1.5">
            <label className="text-slate-400 font-sans font-medium flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-slate-300" />
                <span>目标算力机磁盘空间预检</span>
              </span>
              {checking && (
                <span className="text-cyan-400 flex items-center gap-1 text-[11px]">
                  <Loader2 className="w-3 h-3 animate-spin" /> 探测容量中...
                </span>
              )}
            </label>

            {checking ? (
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span>正在远程探测目标路径挂载点与剩余可用空间...</span>
              </div>
            ) : preflight ? (
              <div
                className={`p-3 rounded-lg border flex flex-col gap-1.5 ${
                  preflight.allowed
                    ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-700/60 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs">
                  {preflight.allowed ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{preflight.message}</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{preflight.message}</span>
                    </>
                  )}
                </div>
                <div className="text-[11px] opacity-80 pl-6 flex flex-wrap gap-x-4 gap-y-1 font-mono">
                  <span>模型所需: <strong>{preflight.model_size_human}</strong></span>
                  <span>目标挂载点: <strong>{preflight.mount_point}</strong></span>
                  <span>磁盘可用: <strong>{preflight.target_free_human}</strong> / {preflight.target_total_human}</span>
                </div>
              </div>
            ) : checkErr ? (
              <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-700/60 text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>预检通信提示: {checkErr}</span>
              </div>
            ) : null}
          </div>

          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 font-sans">
            💡 说明：分发采用带 <span className="text-slate-200 font-mono">--info=progress2</span> 的原子断点续传并在源存储服务器后台运行，传输完成后自动深度核验 Safetensors 权重分片完整性。
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
            disabled={isBlocked || checking}
            onClick={handleConfirmDistribute}
            className={`px-5 py-2 rounded-lg text-xs font-semibold shadow-md flex items-center gap-1.5 transition ${
              isBlocked || checking
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isBlocked ? '目标空间不足 · 禁止分发' : checking ? '空间预检中...' : '立即启动后台分发'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
