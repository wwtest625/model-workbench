import React, { useState, useEffect } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { Save, RotateCcw, Copy, Check, FileCode, CheckCircle2 } from 'lucide-react'

// 使用本地打包的 monaco，避免运行时访问 jsdelivr CDN
loader.config({ monaco })

interface CodeEditorProps {
  filename: string
  initialCode: string
  onSave: (newCode: string) => Promise<boolean>
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ filename, initialCode, onSave }) => {
  const [code, setCode] = useState(initialCode)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  useEffect(() => {
    setCode(initialCode)
    setIsDirty(false)
  }, [initialCode])

  const handleEditorChange = (value: string | undefined) => {
    const val = value || ''
    setCode(val)
    setIsDirty(val !== initialCode)
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    setSavedSuccess(false)
    const success = await onSave(code)
    setSaving(false)
    if (success) {
      setIsDirty(false)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 3000)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleReset = () => {
    if (confirm('确定要放弃未保存的更改并重置吗？')) {
      setCode(initialCode)
      setIsDirty(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] rounded-lg overflow-hidden border border-slate-800 shadow-2xl">
      {/* 顶部工具栏 */}
      <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-indigo-400" />
          <span className="font-mono text-xs text-slate-200 font-semibold">{filename}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
            Shell / Bash
          </span>
          {isDirty && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              * 未保存修改
            </span>
          )}
          {savedSuccess && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> 已保存至远程服务器
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1.5 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>

          {isDirty && (
            <button
              onClick={handleReset}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded text-xs flex items-center gap-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>放弃更改</span>
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
          >
            <Save className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? '保存中...' : '💾 保存修改 (Ctrl+S)'}</span>
          </button>
        </div>
      </div>

      {/* Monaco Editor 核心编辑区 (打字实时彩色高亮) */}
      <div className="flex-1 w-full h-full overflow-hidden">
        <Editor
          height="100%"
          language="shell"
          theme="vs-dark"
          value={code}
          onChange={handleEditorChange}
          options={{
            fontSize: 13,
            fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            wordWrap: 'on'
          }}
        />
      </div>
    </div>
  )
}
