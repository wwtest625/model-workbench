import React, { useEffect } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

export interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

interface ToastProps {
  toasts: ToastItem[]
  onRemove: (id: string) => void
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <ToastItemCard key={t.id} item={t} onRemove={() => onRemove(t.id)} />
      ))}
    </div>
  )
}

const ToastItemCard: React.FC<{ item: ToastItem; onRemove: () => void }> = ({ item, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(onRemove, 3500)
    return () => clearTimeout(timer)
  }, [onRemove])

  return (
    <div className="pointer-events-auto bg-slate-900 border border-slate-700/80 shadow-2xl rounded-xl p-3.5 flex items-start gap-3 text-slate-200 animate-in slide-in-from-top-3 duration-200">
      {item.type === 'success' ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
      ) : item.type === 'error' ? (
        <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      ) : (
        <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 text-xs leading-relaxed font-medium">
        {item.message}
      </div>
      <button
        onClick={onRemove}
        className="text-slate-400 hover:text-slate-200 p-0.5 rounded transition shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
