import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Terminal as TermIcon,
  RotateCw,
  Trash2,
  Copy,
  Check,
  Play,
  Square,
  X,
  ExternalLink
} from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface FullscreenLogViewProps {
  /** 容器名或模型名，用于 /api/v1/models/logs 查询 */
  name: string
}

const XTERM_THEME = {
  background: '#090d16',
  foreground: '#e2e8f0',
  cursor: '#818cf8',
  cursorAccent: '#090d16',
  selectionBackground: '#334155',
  black: '#1e293b',
  red: '#f87171',
  green: '#34d399',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#38bdf8',
  white: '#f1f5f9',
  brightBlack: '#64748b',
  brightRed: '#ef4444',
  brightGreen: '#10b981',
  brightYellow: '#f59e0b',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#0ea5e9',
  brightWhite: '#ffffff'
}

/**
 * 全屏日志视图（独立新标签页）
 * 打开方式: window.open(`/?logs=${encodeURIComponent(name)}`, '_blank')
 */
export const FullscreenLogView: React.FC<FullscreenLogViewProps> = ({ name }) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const lastLogsRef = useRef<string>('')

  const [isStreaming, setIsStreaming] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [copied, setCopied] = useState(false)
  const [lineCount, setLineCount] = useState(0)
  const [countdown, setCountdown] = useState(2)
  const [lastUpdateTime, setLastUpdateTime] = useState('')
  const currentLogsRef = useRef('')

  const writeLogsToTerminal = (term: Terminal, text: string) => {
    if (!text) return
    const normalized = text.replace(/\r?\n/g, '\r\n')
    term.clear()
    term.write(normalized)
    setLineCount(text.split('\n').length)
    currentLogsRef.current = text
  }

  const fetchLogs = useCallback(async () => {
    if (!name) return
    setFetching(true)
    try {
      const res = await fetch(`/api/v1/models/logs?name=${encodeURIComponent(name)}`)
      const data = await res.json()
      const newLogs = data.logs || '暂无日志输出'
      if (newLogs !== lastLogsRef.current) {
        lastLogsRef.current = newLogs
        if (xtermRef.current) {
          writeLogsToTerminal(xtermRef.current, newLogs)
        } else {
          currentLogsRef.current = newLogs
          setLineCount(newLogs.split('\n').length)
        }
      }
      setLastUpdateTime(new Date().toTimeString().substring(0, 8))
    } catch (e) {
      console.error('拉取日志失败', e)
    } finally {
      setFetching(false)
    }
  }, [name])

  // 初始化 xterm（全屏）
  useEffect(() => {
    if (!terminalRef.current) return
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'Sarasa Term SC Nerd', 'Sarasa Term SC', 'Sarasa Mono SC', ui-monospace, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.25,
      theme: XTERM_THEME,
      convertEol: true,
      scrollback: 10000,
      disableStdin: true
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    fitAddon.fit()
    xtermRef.current = term
    fitAddonRef.current = fitAddon

    if (currentLogsRef.current) {
      writeLogsToTerminal(term, currentLogsRef.current)
    }

    const handleResize = () => {
      try {
        fitAddon.fit()
      } catch (e) {}
    }
    window.addEventListener('resize', handleResize)
    const t = setTimeout(handleResize, 100)
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(t)
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  // 首次加载
  useEffect(() => {
    lastLogsRef.current = ''
    fetchLogs()
  }, [fetchLogs])

  // 倒计时轮询调度器
  useEffect(() => {
    if (!isStreaming) return
    setCountdown(2)
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchLogs()
          return 2
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [isStreaming, fetchLogs])

  const handleCopyLogs = () => {
    if (!currentLogsRef.current) return
    navigator.clipboard.writeText(currentLogsRef.current)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleClear = () => {
    lastLogsRef.current = ''
    currentLogsRef.current = ''
    xtermRef.current?.clear()
    setLineCount(0)
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#090d16] text-slate-200 font-sans overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-950 border-b border-slate-800 shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-800/80 flex items-center justify-center shrink-0">
            <TermIcon className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-slate-100 flex items-center gap-2 truncate">
              容器实时日志 · <span className="text-indigo-300 font-mono">{name}</span>
            </h1>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
              {lineCount} 行 · 最后更新 {lastUpdateTime || '--'} · 全屏独立标签页
            </p>
          </div>
        </div>
        {/* TOOLBAR_BUTTONS */}
        <div className="flex items-center gap-2">
          {/* 持续刷新开关 */}
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`px-2.5 py-1 rounded font-medium flex items-center gap-1.5 transition border cursor-pointer text-xs ${
              isStreaming
                ? 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border-rose-500/40'
                : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40'
            }`}
          >
            {isStreaming ? (
              <>
                <Square className="w-3 h-3" />
                <span>持续刷新</span>
                <span className="bg-rose-500/20 px-1 rounded text-[10px] font-bold text-rose-300 w-4 text-center inline-block">
                  {countdown}s
                </span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                <span>已暂停</span>
              </>
            )}
          </button>

          {/* 手动刷新 */}
          <button
            onClick={() => fetchLogs()}
            disabled={fetching}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition disabled:opacity-50 cursor-pointer"
            title="立即拉取一次最新日志"
          >
            <RotateCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} />
          </button>

          {/* 清空 */}
          <button
            onClick={handleClear}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded border border-slate-700 transition cursor-pointer"
            title="清空当前终端输出"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* 复制全部 */}
          <button
            onClick={handleCopyLogs}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition cursor-pointer"
            title="复制全部日志到剪贴板"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* 回主界面 */}
          <a
            href="/"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition flex items-center cursor-pointer"
            title="回到主工作台"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {/* 关闭标签页 */}
          <button
            onClick={() => window.close()}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400 transition cursor-pointer"
            title="关闭此标签页"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* xterm 全屏挂载区域 */}
      <div className="flex-1 p-2 overflow-hidden relative bg-[#090d16]">
        <div ref={terminalRef} className="w-full h-full" />
      </div>
    </div>
  )
}
