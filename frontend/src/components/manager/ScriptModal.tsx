import React from 'react'
import { FileCode, Container, Copy, X, Maximize2, Minimize2 } from 'lucide-react'
import { ModelCard, ModalState } from '../../types'
import { CodeEditor } from '../CodeEditor'

interface ScriptModalProps {
  activeModel: ModelCard | null
  modal: ModalState
  setModal: React.Dispatch<React.SetStateAction<ModalState>>
  isScriptMaximized: boolean
  setIsScriptMaximized: React.Dispatch<React.SetStateAction<boolean>>
  handleCopy: () => void
  handleSaveScript: (newCode: string) => Promise<boolean>
}

export const ScriptModal: React.FC<ScriptModalProps> = ({ activeModel, modal, setModal, isScriptMaximized, setIsScriptMaximized, handleCopy, handleSaveScript }) => {
  return (
modal.show && modal.type !== 'logs' && (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className={`bg-slate-900 border border-slate-800 rounded-2xl w-full flex flex-col shadow-2xl overflow-hidden transition-all duration-150 ${
          isScriptMaximized ? 'max-w-[96vw] h-[94vh]' : 'max-w-5xl h-[700px] max-h-[88vh]'
        }`}>
          {/* 弹窗头部 */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/80 shrink-0">
            <div className="flex items-center gap-2.5">
              {modal.type === 'script' ? (
                <FileCode className="w-5 h-5 text-indigo-400" />
              ) : (
                <Container className="w-5 h-5 text-indigo-400" />
              )}
              <div>
                <h3 className="font-bold text-sm text-slate-100">{modal.title}</h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  模型: <span className="text-indigo-300 font-semibold">{modal.modelName}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                title="复制内容到剪贴板"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>复制</span>
              </button>
              <button
                onClick={() => setIsScriptMaximized(!isScriptMaximized)}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                title={isScriptMaximized ? '还原窗口' : '最大化窗口'}
              >
                {isScriptMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setModal({ ...modal, show: false })}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                title="关闭窗口"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 弹窗主体内容 */}
          <div className="flex-1 overflow-hidden p-4 bg-slate-950 min-h-0 flex flex-col">
            {modal.type === 'script' ? (
              <CodeEditor
                filename={activeModel?.script || 'start_script.sh'}
                initialCode={modal.content}
                onSave={handleSaveScript}
              />
            ) : (
              <div className="flex-1 bg-slate-950 rounded-lg border border-slate-800/80 p-4 font-mono text-xs text-slate-300 overflow-y-auto leading-relaxed whitespace-pre selection:bg-indigo-500/30">
                {modal.content}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  )
}
