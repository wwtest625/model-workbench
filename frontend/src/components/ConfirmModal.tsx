import React, { useEffect } from 'react'
import { AlertTriangle, Info, CheckCircle2, X } from 'lucide-react'

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'primary' | 'warning'
  detail?: string
  onConfirm: () => void
  onCancel?: () => void
}

interface ConfirmModalProps {
  isOpen: boolean
  options: ConfirmOptions | null
  onClose: () => void
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, options, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (options?.onCancel) options.onCancel()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, options, onClose])

  if (!isOpen || !options) return null

  const {
    title,
    message,
    confirmText = '确定',
    cancelText = '取消',
    type = 'primary',
    detail,
    onConfirm,
    onCancel
  } = options

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  const handleCancel = () => {
    if (onCancel) onCancel()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-slate-200">
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            {type === 'danger' ? (
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            ) : type === 'warning' ? (
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Info className="w-4 h-4" />
              </div>
            )}
            <h3 className="font-semibold text-base text-slate-100">{title}</h3>
          </div>
          <button
            onClick={handleCancel}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-300 leading-relaxed">{message}</p>
          {detail && (
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs text-slate-400 break-all leading-normal">
              {detail}
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="px-5 py-3.5 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium border border-slate-700 transition"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm transition ${
              type === 'danger'
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/20'
                : type === 'warning'
                ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/20'
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
