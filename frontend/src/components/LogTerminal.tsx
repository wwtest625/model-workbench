import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Play, Square, RotateCw, Trash2, Copy, Check, Terminal as TermIcon, Clock } from 'lucide-react'

interface LogTerminalProps {
  modelName?: string
  containerName?: string
  initialLogs?: string
  logs?: string
  isOpen?: boolean
  className?: string
  onClose?: () => void
}

export const LogTerminal: React.FC<LogTerminalProps> = ({
  modelName = '',
  containerName = '',
  initialLogs = '',
  logs = '',
  isOpen = true,
  className = '',
  onClose
}) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const lastLogsRef = useRef<string>('')

  const [isStreaming, setIsStreaming] = useState<boolean>(true)
  const [copied, setCopied] = useState<boolean>(false)
  const [fetching, setFetching] = useState<boolean>(false)
  const [lineCount, setLineCount] = useState<number>(0)
  const [countdown, setCountdown] = useState<number>(2)
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('')

  const targetQueryName = containerName || modelName

  // 格式化换行并写入终端
  const writeLogsToTerminal = (term: Terminal, text: string) => {
    if (!text) return
    const normalized = text.replace(/\r?\n/g, '\r\n')
    term.clear()
    term.write(normalized)
    setLineCount(text.split('\n').length)
  }

  // 初始化 Terminal
  useEffect(() => {
    if (!isOpen || !terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
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
        brightWhite: '#ffffff',
      },
      convertEol: true,
      scrollback: 5000,
      disableStdin: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    const currentText = logs || initialLogs
    if (currentText) {
      writeLogsToTerminal(term, currentText)
      lastLogsRef.current = currentText
      const now = new Date()
      setLastUpdateTime(now.toTimeString().substring(0, 8))
    }

    const handleResize = () => {
      try {
        fitAddon.fit()
      } catch (e) {}
    }

    window.addEventListener('resize', handleResize)
    setTimeout(handleResize, 150)

    return () => {
      window.removeEventListener('resize', handleResize)
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [isOpen])

  // 监听外部传入的 logs 或 initialLogs 更新
  useEffect(() => {
    const currentText = logs || initialLogs
    if (xtermRef.current && currentText && currentText !== lastLogsRef.current) {
      writeLogsToTerminal(xtermRef.current, currentText)
      lastLogsRef.current = currentText
      const now = new Date()
      setLastUpdateTime(now.toTimeString().substring(0, 8))
    }
  }, [logs, initialLogs])

  // 单次拉取最新日志
  const fetchLatestLogs = useCallback(async () => {
    if (!isOpen || !targetQueryName) return
    setFetching(true)
    try {
      const res = await fetch(`/api/v1/models/logs?name=${encodeURIComponent(targetQueryName)}`)
      const data = await res.json()
      const newLogs = data.logs || '暂无日志输出'
      if (xtermRef.current && newLogs !== lastLogsRef.current) {
        writeLogsToTerminal(xtermRef.current, newLogs)
        lastLogsRef.current = newLogs
      }
      const now = new Date()
      setLastUpdateTime(now.toTimeString().substring(0, 8))
    } catch (e) {
      console.error('拉取日志失败', e)
    } finally {
      setFetching(false)
    }
  }, [isOpen, targetQueryName])

  // 动态真实倒计时调度引擎 (每秒跳动 1 次，倒数到 0 触发拉取并重置为 2)
  useEffect(() => {
    if (!isOpen || !isStreaming) return

    setCountdown(2)
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchLatestLogs()
          return 2
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, isStreaming, fetchLatestLogs])

  // 复制当前终端日志
  const handleCopyLogs = () => {
    if (!lastLogsRef.current) return
    navigator.clipboard.writeText(lastLogsRef.current)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 清空终端
  const handleClear = () => {
    if (xtermRef.current) {
      xtermRef.current.clear()
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#090d16] text-slate-200">
      {/* 终端控制顶栏 */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-mono text-slate-300 font-semibold">
            <TermIcon className="w-4 h-4 text-slate-400" />
            <span>{modelName || '容器日志'}</span>
          </span>

          {/* 实时动态倒计时徽章 */}
          <span
            className={`px-2.5 py-0.5 rounded font-mono flex items-center gap-1.5 border transition ${
              isStreaming
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isStreaming ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            {isStreaming ? (
              <span className="flex items-center gap-1">
                <span>持续刷新</span>
                <span className="bg-emerald-400/20 px-1 rounded text-[11px] font-bold text-emerald-300 w-5 text-center inline-block">
                  {countdown}s
                </span>
              </span>
            ) : (
              <span>已暂停</span>
            )}
          </span>

          {/* 上次更新时间戳 */}
          {lastUpdateTime && (
            <span className="text-slate-500 font-mono hidden md:flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{lastUpdateTime}</span>
            </span>
          )}

          {lineCount > 0 && (
            <span className="text-slate-500 font-mono hidden sm:inline">
              {lineCount} 行
            </span>
          )}
        </div>

        {/* 核心操作按钮 */}
        <div className="flex items-center gap-2">
          {/* 持续刷新 / 停止刷新 核心切换按钮 */}
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition border ${
              isStreaming
                ? 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border-rose-500/40'
                : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40'
            }`}
          >
            {isStreaming ? (
              <>
                <Square className="w-3.5 h-3.5" />
                <span>停止刷新</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>持续刷新</span>
              </>
            )}
          </button>

          {/* 手动刷新一次 */}
          <button
            onClick={() => fetchLatestLogs()}
            disabled={fetching}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1 border border-slate-700 transition disabled:opacity-50"
            title="立即手动拉取最新日志"
          >
            <RotateCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} />
            <span>拉取</span>
          </button>

          {/* 清空终端 */}
          <button
            onClick={handleClear}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg border border-slate-700 transition"
            title="清空当前终端显示"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* 复制全部日志 */}
          <button
            onClick={handleCopyLogs}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1 border border-slate-700 transition"
            title="复制全部日志到剪贴板"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
        </div>
      </div>

      {/* xterm 真实终端挂载区域 */}
      <div className="flex-1 p-2 overflow-hidden relative">
        <div ref={terminalRef} className="w-full h-full" />
      </div>
    </div>
  )
}
