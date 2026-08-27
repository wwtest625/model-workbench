import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Terminal as TermIcon,
  X,
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
  RotateCw,
  Trash2,
  Copy,
  Check,
  Play,
  Square,
  Clock,
  Plus,
  Activity,
  Layers
} from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { StageTimeline } from './StageTimeline'
import { ModelCard } from '../types'

export interface DockTab {
  id: string
  modelName: string
  containerName: string
  status?: string
}

interface DockTerminalPanelProps {
  tabs: DockTab[]
  activeTabId: string
  models: ModelCard[]
  isOpen: boolean
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onClosePanel: () => void
  onAddTab: (model: ModelCard) => void
  onHeightChange?: (height: number) => void
}

export const DockTerminalPanel: React.FC<DockTerminalPanelProps> = ({
  tabs,
  activeTabId,
  models,
  isOpen,
  onSelectTab,
  onCloseTab,
  onClosePanel,
  onAddTab,
  onHeightChange
}) => {
  // 3 态高度管理: 'minimized' | 'normal' | 'maximized'
  const [panelState, setPanelState] = useState<'minimized' | 'normal' | 'maximized'>('normal')
  const [dockHeight, setDockHeight] = useState<number>(380)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const dragStartY = useRef<number>(0)
  const dragStartH = useRef<number>(380)

  // xterm 终端引用
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const lastLogsRef = useRef<string>('')
  const [currentLogsText, setCurrentLogsText] = useState<string>('')

  const [isStreaming, setIsStreaming] = useState<boolean>(true)
  const [copied, setCopied] = useState<boolean>(false)
  const [fetching, setFetching] = useState<boolean>(false)
  const [lineCount, setLineCount] = useState<number>(0)
  const [countdown, setCountdown] = useState<number>(2)
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('')
  const [showAddMenu, setShowAddMenu] = useState<boolean>(false)

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]
  const activeModelCard = models.find((m) => m.name === activeTab?.modelName || m.container_name === activeTab?.containerName)

  // 通知外部当前 Dock 高度（用于主页面自适应 padding-bottom）
  useEffect(() => {
    if (!isOpen) {
      onHeightChange?.(0)
      return
    }
    if (panelState === 'minimized') {
      onHeightChange?.(38)
    } else if (panelState === 'maximized') {
      onHeightChange?.(window.innerHeight * 0.88)
    } else {
      onHeightChange?.(dockHeight)
    }
  }, [isOpen, panelState, dockHeight, onHeightChange])

  // 鼠标上下拖拽拉伸高度
  const handleStartResize = (e: React.MouseEvent) => {
    if (panelState !== 'normal') return
    setIsDragging(true)
    dragStartY.current = e.clientY
    dragStartH.current = dockHeight

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = dragStartY.current - moveEvent.clientY
      const nextH = Math.min(Math.max(220, dragStartH.current + delta), window.innerHeight * 0.85)
      setDockHeight(nextH)
      try {
        fitAddonRef.current?.fit()
      } catch (err) {}
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      try {
        fitAddonRef.current?.fit()
      } catch (err) {}
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // 格式化并写入终端
  const writeLogsToTerminal = (term: Terminal, text: string) => {
    if (!text) return
    const normalized = text.replace(/\r?\n/g, '\r\n')
    term.clear()
    term.write(normalized)
    setLineCount(text.split('\n').length)
    setCurrentLogsText(text)
  }

  // 初始化 xterm
  useEffect(() => {
    if (!isOpen || panelState === 'minimized' || !terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'Sarasa Term SC Nerd', 'Sarasa Term SC', 'Sarasa Mono SC', ui-monospace, Menlo, Monaco, Consolas, monospace",
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
        brightWhite: '#ffffff'
      },
      convertEol: true,
      scrollback: 5000,
      disableStdin: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    if (currentLogsText) {
      writeLogsToTerminal(term, currentLogsText)
    }

    const handleResize = () => {
      try {
        fitAddon.fit()
      } catch (e) {}
    }

    window.addEventListener('resize', handleResize)
    setTimeout(handleResize, 100)

    return () => {
      window.removeEventListener('resize', handleResize)
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [isOpen, panelState, activeTabId])

  // 单次拉取当前 Tab 日志
  const fetchLogsForActiveTab = useCallback(async () => {
    if (!isOpen || !activeTab) return
    const queryName = activeTab.containerName || activeTab.modelName
    if (!queryName) return

    setFetching(true)
    try {
      const res = await fetch(`/api/v1/models/logs?name=${encodeURIComponent(queryName)}`)
      const data = await res.json()
      const newLogs = data.logs || '暂无日志输出'
      if (newLogs !== lastLogsRef.current) {
        lastLogsRef.current = newLogs
        if (xtermRef.current) {
          writeLogsToTerminal(xtermRef.current, newLogs)
        } else {
          setCurrentLogsText(newLogs)
          setLineCount(newLogs.split('\n').length)
        }
      }
      const now = new Date()
      setLastUpdateTime(now.toTimeString().substring(0, 8))
    } catch (e) {
      console.error('拉取日志失败', e)
    } finally {
      setFetching(false)
    }
  }, [isOpen, activeTab])

  // Tab 切换时立即清空并拉取新日志
  useEffect(() => {
    if (!activeTab) return
    lastLogsRef.current = ''
    setCurrentLogsText('')
    if (xtermRef.current) {
      xtermRef.current.clear()
    }
    fetchLogsForActiveTab()
  }, [activeTabId, fetchLogsForActiveTab])

  // 动态倒计时调度器
  useEffect(() => {
    if (!isOpen || !isStreaming || panelState === 'minimized') return

    setCountdown(2)
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchLogsForActiveTab()
          return 2
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, isStreaming, panelState, fetchLogsForActiveTab])

  const handleCopyLogs = () => {
    if (!currentLogsText) return
    navigator.clipboard.writeText(currentLogsText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClear = () => {
    if (xtermRef.current) {
      xtermRef.current.clear()
    }
  }

  if (!isOpen || tabs.length === 0) return null

  // =========================================================================
  // 1. 状态栏折叠态 (MINIMIZED - 极简高度 36px，类似 VS Code 状态栏)
  // =========================================================================
  if (panelState === 'minimized') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-indigo-500/80 shadow-2xl h-9 px-4 flex items-center justify-between text-xs font-mono select-none">
        {/* 左侧当前 Tab 与状态速览 */}
        <div
          onClick={() => setPanelState('normal')}
          className="flex items-center gap-3 cursor-pointer hover:text-white transition group"
        >
          <span className="flex items-center gap-1.5 font-bold text-indigo-400">
            <TermIcon className="w-3.5 h-3.5" />
            <span>终端面板 ({tabs.length})</span>
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-200 font-semibold group-hover:text-indigo-300 transition">
            {activeTab?.modelName}
          </span>
          {activeModelCard?.status === 'READY' ? (
            <span className="text-[11px] text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> 服务就绪
            </span>
          ) : (
            <span className="text-[11px] text-amber-400 flex items-center gap-1">
              <RotateCw className="w-2.5 h-2.5 animate-spin" /> 流转中
            </span>
          )}
        </div>

        {/* 右侧控制按钮 */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPanelState('normal')}
            className="p-1 px-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition flex items-center gap-1 text-[11px] cursor-pointer"
            title="展开终端面板"
          >
            <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />
            <span>展开</span>
          </button>
          <button
            onClick={onClosePanel}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400 transition cursor-pointer"
            title="关闭面板"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  // =========================================================================
  // 2. 正常 Dock 态 / 全屏最大化态 (NORMAL / MAXIMIZED)
  // =========================================================================
  const currentHeightStyle =
    panelState === 'maximized' ? { height: '88vh' } : { height: `${dockHeight}px` }

  return (
    <div
      style={currentHeightStyle}
      className={`fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t-2 border-indigo-500/80 shadow-[0_-12px_45px_rgba(0,0,0,0.85)] flex flex-col font-mono text-slate-200 transition-[height] ${
        isDragging ? 'duration-0 select-none' : 'duration-150'
      }`}
    >
      {/* 顶部可拖拽拉伸把手条 (仅在 normal 状态下可用) */}
      {panelState === 'normal' && (
        <div
          onMouseDown={handleStartResize}
          className="w-full h-2.5 cursor-row-resize hover:bg-indigo-500/30 flex items-center justify-center transition-colors group select-none -mt-1 relative z-50 shrink-0"
          title="按住鼠标上下拖拽，自由调整终端高度"
        >
          <div className="w-16 h-1 bg-slate-700 group-hover:bg-indigo-400 rounded-full transition-colors" />
        </div>
      )}

      {/* VS Code 风格多容器 Tab 栏与控制顶栏 */}
      <div className="bg-slate-950 border-b border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 select-none">
        {/* 左侧多容器 Tab 集合 */}
        <div className="flex items-center gap-1 overflow-x-auto max-w-[70vw] scrollbar-none">
          {tabs.map((t) => {
            const isSelected = t.id === activeTabId
            const mCard = models.find((m) => m.name === t.modelName || m.container_name === t.containerName)

            return (
              <div
                key={t.id}
                onClick={() => onSelectTab(t.id)}
                className={`px-3 py-1.5 rounded-t-lg border-t-2 flex items-center gap-2 cursor-pointer transition text-xs font-semibold shrink-0 group ${
                  isSelected
                    ? 'bg-slate-900 border-indigo-500 text-slate-100 shadow-sm'
                    : 'bg-slate-950/60 border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                }`}
              >
                <TermIcon className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                <span className="truncate max-w-[160px]">{t.modelName}</span>

                {/* 状态小圆点 */}
                {mCard?.status === 'READY' ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="服务就绪" />
                ) : mCard?.status === 'FAILED' ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title="异常退出" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" title="权重加载/预热中" />
                )}

                {/* Tab 关闭按钮 (多于 1 个 Tab 时允许关闭) */}
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onCloseTab(t.id)
                    }}
                    className="p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"
                    title="关闭此 Tab"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )
          })}

          {/* 新增打开其他容器 Tab 的快捷下拉 */}
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition cursor-pointer"
              title="打开其他模型容器的日志 Tab"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            {showAddMenu && (
              <div
                className="absolute left-0 top-8 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 w-56 font-sans text-xs"
                onClick={() => setShowAddMenu(false)}
              >
                <div className="px-3 py-1.5 text-[11px] text-slate-500 font-semibold uppercase border-b border-slate-800 font-mono">
                  选择要监控的模型容器
                </div>
                <div className="max-h-48 overflow-y-auto py-1">
                  {models.map((m) => (
                    <button
                      key={m.name}
                      onClick={() => {
                        onAddTab(m)
                        setShowAddMenu(false)
                      }}
                      className="w-full px-3 py-1.5 text-left text-slate-300 hover:bg-slate-800 hover:text-white flex items-center justify-between transition cursor-pointer"
                    >
                      <span className="truncate">{m.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                          m.status === 'READY'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : m.status === 'STOPPED'
                            ? 'bg-slate-800 text-slate-500'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {m.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧控制栏动作群 */}
        <div className="flex items-center gap-2">
          {/* 持续刷新 / 暂停 */}
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

          {/* 手动单次拉取 */}
          <button
            onClick={() => fetchLogsForActiveTab()}
            disabled={fetching}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition disabled:opacity-50 cursor-pointer"
            title="立即手动拉取一次最新日志"
          >
            <RotateCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} />
          </button>

          {/* 清空终端 */}
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

          {/* 最小化折叠为底部状态栏 */}
          <button
            onClick={() => setPanelState('minimized')}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition cursor-pointer"
            title="最小化收起为底部状态栏"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {/* 最大化 / 还原 */}
          <button
            onClick={() => setPanelState(panelState === 'maximized' ? 'normal' : 'maximized')}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition cursor-pointer"
            title={panelState === 'maximized' ? '还原高度' : '全屏最大化'}
          >
            {panelState === 'maximized' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* 关闭面板 */}
          <button
            onClick={onClosePanel}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400 transition cursor-pointer"
            title="关闭终端面板"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 🚀 阶段甘特图与生命周期耗时分析看板 */}
      <StageTimeline logs={currentLogsText} modelStatus={activeModelCard?.status} />

      {/* xterm 真实终端挂载区域 */}
      <div className="flex-1 p-2 overflow-hidden relative bg-[#090d16]">
        <div ref={terminalRef} className="w-full h-full" />
      </div>
    </div>
  )
}
