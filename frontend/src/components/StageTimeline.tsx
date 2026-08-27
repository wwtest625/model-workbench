import React, { useMemo, useState } from 'react'
import { CheckCircle2, RotateCw, Clock, ChevronDown, ChevronUp, Zap, Sparkles, Layers, Cpu, Activity } from 'lucide-react'

export interface StageInfo {
  id: string
  name: string
  shortName: string
  status: 'pending' | 'active' | 'completed' | 'failed'
  durationSec?: number
  startTimeStr?: string
  endTimeStr?: string
  percent?: number
  icon: string
  detail?: string
  color: string
}

export interface LifecycleAnalysis {
  stages: StageInfo[]
  currentStageId: string
  totalDurationSec: number
  isReady: boolean
  hasError: boolean
  errorMsg?: string
}

// 时间戳解析辅助函数 (支持多种日志时间格式)
const parseTimestamp = (line: string): number | null => {
  // 1. [2026-08-27 10:20:15] or 2026-08-27 10:20:15
  const m1 = line.match(/(?:\[)?(20\d{2}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:\])?/)
  if (m1) {
    const t = new Date(m1[1].replace(' ', 'T')).getTime()
    if (!isNaN(t)) return t
  }
  // 2. INFO 08-27 10:20:15 or [08-27 10:20:15]
  const m2 = line.match(/(?:INFO|DEBUG|WARNING|ERROR)?\s*(?:\[)?(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})(?:\])?/)
  if (m2) {
    const now = new Date()
    const t = new Date(`${now.getFullYear()}-${m2[1].replace(' ', 'T')}`).getTime()
    if (!isNaN(t)) return t
  }
  // 3. 纯时间 10:20:15
  const m3 = line.match(/(\d{2}:\d{2}:\d{2})/)
  if (m3) {
    const now = new Date()
    const ymd = now.toISOString().split('T')[0]
    const t = new Date(`${ymd}T${m3[1]}`).getTime()
    if (!isNaN(t)) return t
  }
  return null
}

// 日志全生命周期分析状态机 (支持日志滚动兜底与单向流转推导)
export const analyzeLifecycleLogs = (logs: string, modelStatus?: string): LifecycleAnalysis => {
  const lines = logs.split('\n')

  const stageDefs = [
    {
      id: 'init',
      name: '环境与通信拓扑初始化',
      shortName: '环境初始化',
      color: '#3b82f6',
      icon: 'Layers',
      match: /(Initializing|MCCL|NCCL|Maca|ROCm|CUDA|device_id|torch\.cuda|World size|Tensor parallel|init_process_group|distributed)/i
    },
    {
      id: 'weights',
      name: '多卡模型权重载入',
      shortName: '权重载入',
      color: '#eab308',
      icon: 'Cpu',
      match: /(Loading model weights|safetensors|Loading checkpoint shards|Loading safetensors|Loading weights took)/i
    },
    {
      id: 'kv_cache',
      name: 'KV Cache 显存空间预分配',
      shortName: 'KV 分配',
      color: '#f97316',
      icon: 'Zap',
      match: /(Profiling KV cache|Allocating.*for KV cache|available GPU memory|gpu_memory_utilization|block_size|KV Cache Memory)/i
    },
    {
      id: 'warmup',
      name: '计算图捕获与预热推理',
      shortName: '图捕获预热',
      color: '#a855f7',
      icon: 'Sparkles',
      match: /(Capturing CUDA graph|capturing graph|warmup|Warmup execution|Graph capturing completed|Capturing.*graph)/i
    },
    {
      id: 'ready',
      name: 'API 路由监听与服务就绪',
      shortName: '服务就绪',
      color: '#10b981',
      icon: 'CheckCircle2',
      match: /(Uvicorn running on|Application startup complete|Route: \/v1\/chat\/completions|Serving on|Ready for requests|Started server process|GET \/v1\/models|POST \/v1\/chat\/completions|HTTP\/1\.1" 200)/i
    }
  ]

  const firstHitTime: Record<string, number> = {}
  const lastHitTime: Record<string, number> = {}
  const stageHit: Record<string, boolean> = {}

  let globalFirstTime: number | null = null
  let globalLastTime: number | null = null
  let hasError = false
  let errorMsg = ''

  for (const line of lines) {
    if (!line.trim()) continue

    const t = parseTimestamp(line)
    if (t) {
      if (!globalFirstTime || t < globalFirstTime) globalFirstTime = t
      if (!globalLastTime || t > globalLastTime) globalLastTime = t
    }

    if (/(CUDA out of memory|OutOfMemoryError|Segmentation fault|Fatal error|RuntimeError: CUDA)/i.test(line)) {
      hasError = true
      errorMsg = line.trim().slice(0, 100)
    }

    for (const def of stageDefs) {
      if (def.match.test(line)) {
        stageHit[def.id] = true
        if (t) {
          if (!firstHitTime[def.id]) firstHitTime[def.id] = t
          lastHitTime[def.id] = t
        }
      }
    }
  }

  // 如果外部已知模型处于就绪状态，或者日志里全是 HTTP 访问日志
  if (modelStatus === 'READY' || stageHit['ready']) {
    stageHit['ready'] = true
  }

  // 找出现存最高已命中的阶段索引
  let highestHitIndex = -1
  for (let i = stageDefs.length - 1; i >= 0; i--) {
    if (stageHit[stageDefs[i].id]) {
      highestHitIndex = i
      break
    }
  }

  // 单向流转推导：若更高阶段已触发，所有前置阶段必然已完成
  if (highestHitIndex >= 0) {
    for (let i = 0; i < highestHitIndex; i++) {
      stageHit[stageDefs[i].id] = true
    }
  }

  // 计算每个阶段的状态与耗时
  const stages: StageInfo[] = []
  let currentStageId = 'ready'

  for (let i = 0; i < stageDefs.length; i++) {
    const def = stageDefs[i]
    const nextDef = stageDefs[i + 1]
    const isHit = !!stageHit[def.id]

    let status: StageInfo['status'] = 'pending'
    let durationSec = 0

    if (i < highestHitIndex) {
      // 在最高阶段之前的必然已完成
      status = 'completed'
    } else if (i === highestHitIndex) {
      if (def.id === 'ready') {
        status = 'completed'
        currentStageId = 'ready'
      } else {
        status = hasError ? 'failed' : 'active'
        currentStageId = def.id
      }
    } else {
      status = 'pending'
    }

    // 耗时计算逻辑 (如果有时间戳差值)
    if (firstHitTime[def.id]) {
      const startT = firstHitTime[def.id]
      let endT = nextDef && firstHitTime[nextDef.id] ? firstHitTime[nextDef.id] : lastHitTime[def.id] || startT
      if (endT >= startT) {
        durationSec = Math.max(0.5, parseFloat(((endT - startT) / 1000).toFixed(1)))
      }
    }

    stages.push({
      id: def.id,
      name: def.name,
      shortName: def.shortName,
      status,
      durationSec: durationSec > 0 ? durationSec : undefined,
      color: def.color,
      icon: def.icon
    })
  }

  const isReady = highestHitIndex === stageDefs.length - 1 || modelStatus === 'READY'
  if (isReady) currentStageId = 'ready'

  // 计算总耗时
  let totalDurationSec = 0
  if (globalFirstTime && globalLastTime && globalLastTime >= globalFirstTime) {
    totalDurationSec = parseFloat(((globalLastTime - globalFirstTime) / 1000).toFixed(1))
  } else {
    totalDurationSec = stages.reduce((acc, s) => acc + (s.durationSec || 0), 0)
    totalDurationSec = parseFloat(totalDurationSec.toFixed(1))
  }

  // 计算各阶段甘特百分比
  const validDurationSum = stages.reduce((acc, s) => acc + (s.durationSec || (s.status === 'completed' ? 2 : 0)), 0)
  if (validDurationSum > 0) {
    stages.forEach((s) => {
      const dur = s.durationSec || (s.status === 'completed' ? 2 : 0)
      s.percent = Math.max(8, Math.round((dur / validDurationSum) * 100))
    })
  }

  return {
    stages,
    currentStageId,
    totalDurationSec,
    isReady,
    hasError,
    errorMsg
  }
}

interface StageTimelineProps {
  logs: string
  modelStatus?: string
}

export const StageTimeline: React.FC<StageTimelineProps> = ({ logs, modelStatus }) => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const analysis = useMemo(() => analyzeLifecycleLogs(logs, modelStatus), [logs, modelStatus])

  if (!logs || logs.trim().length < 5) {
    return null
  }

  return (
    <div className="bg-slate-950 border-b border-slate-800/90 text-slate-200 shrink-0 font-mono transition-all select-none">
      {/* 阶段分析顶部概览条 */}
      <div className="px-4 py-2 flex items-center justify-between gap-3 bg-slate-900/90 border-b border-slate-800/60 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 font-bold text-slate-200">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>生命周期阶段与耗时分析</span>
          </span>

          {analysis.isReady ? (
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> 服务完全就绪 {analysis.totalDurationSec > 0 ? `(耗时: ${analysis.totalDurationSec}s)` : '(持续运行中)'}
            </span>
          ) : analysis.hasError ? (
            <span className="px-2.5 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 text-[11px] font-semibold flex items-center gap-1">
              ⚠️ 启动过程发生异常
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40 text-[11px] font-semibold flex items-center gap-1 animate-pulse">
              <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-400" /> 正在流转中 (已耗时: {analysis.totalDurationSec}s)
            </span>
          )}
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition flex items-center gap-1 text-[11px] cursor-pointer"
          title={isCollapsed ? '展开阶段图表' : '折叠阶段图表'}
        >
          <span>{isCollapsed ? '展开阶段' : '收起图表'}</span>
          {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* 展开的图表与阶段节点 */}
      {!isCollapsed && (
        <div className="px-4 py-3 space-y-3 bg-slate-950/80">
          {/* 5 阶段节点流 (Stage Stepper) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {analysis.stages.map((stage, idx) => {
              const isDone = stage.status === 'completed'
              const isActive = stage.status === 'active'
              const isFail = stage.status === 'failed'

              return (
                <div
                  key={stage.id}
                  className={`p-2 rounded-lg border flex flex-col justify-between gap-1 transition ${
                    isDone
                      ? 'bg-slate-900/90 border-slate-800 text-slate-300'
                      : isActive
                      ? 'bg-indigo-950/30 border-indigo-500/60 text-indigo-200 shadow-[0_0_15px_rgba(99,102,241,0.15)] animate-pulse'
                      : isFail
                      ? 'bg-rose-950/40 border-rose-700 text-rose-300'
                      : 'bg-slate-900/30 border-slate-800/40 text-slate-600 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      {idx + 1}. {stage.shortName}
                    </span>
                    {isDone ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : isActive ? (
                      <RotateCw className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
                    ) : isFail ? (
                      <span className="text-rose-400 text-xs font-bold">✕</span>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-700" />
                    )}
                  </div>

                  <div className="flex items-baseline justify-between pt-0.5">
                    <span className="text-xs font-bold truncate">
                      {isDone ? (
                        <span className="text-emerald-300 font-semibold">{stage.durationSec ? `${stage.durationSec}s` : '已完成'}</span>
                      ) : isActive ? (
                        <span className="text-indigo-300 font-semibold">流转中...</span>
                      ) : isFail ? (
                        <span className="text-rose-400 font-semibold">异常</span>
                      ) : (
                        <span className="text-slate-600 font-normal">待流转</span>
                      )}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 阶段甘特比例条 (Timeline Bar Chart) */}
          <div className="space-y-1.5 pt-1">
            <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden flex border border-slate-800/80">
              {analysis.stages.map((stage) => {
                if (stage.status === 'pending') return null
                return (
                  <div
                    key={stage.id}
                    style={{
                      width: `${stage.percent || 20}%`,
                      backgroundColor: stage.color
                    }}
                    className={`h-full transition-all duration-300 relative group ${
                      stage.status === 'active' ? 'animate-pulse opacity-90' : 'opacity-85 hover:opacity-100'
                    }`}
                    title={`${stage.name}: ${stage.durationSec ? `${stage.durationSec}s` : '进行中'}`}
                  />
                )
              })}
            </div>

            {/* 甘特图图例文本 */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 pt-0.5">
              <div className="flex flex-wrap items-center gap-3">
                {analysis.stages.map((s) => {
                  if (s.status === 'pending') return null
                  return (
                    <span key={s.id} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-slate-300">{s.shortName}</span>
                      {s.durationSec ? <span className="text-slate-500 font-mono">({s.durationSec}s)</span> : null}
                    </span>
                  )
                })}
              </div>
              <span className="text-slate-500 font-mono">
                {analysis.isReady ? '状态: 服务就绪' : `总计耗时: ${analysis.totalDurationSec}s`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
