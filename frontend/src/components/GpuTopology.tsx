import React from 'react'
import { Gauge } from 'lucide-react'
import { GPUInfo } from '../types'

interface GpuTopologyProps {
  gpus: GPUInfo[]
}

export const GpuTopology: React.FC<GpuTopologyProps> = ({ gpus }) => {
  const getUsed = (g: GPUInfo) => Number(g.mem_used ?? g.memUsed ?? 0)
  const getTotal = (g: GPUInfo) => Number(g.mem_total ?? g.memTotal ?? 0)
  const getPct = (g: GPUInfo) => Number(g.mem_pct ?? g.memPct ?? 0)

  const totalMemUsedNum = gpus.reduce((acc, g) => acc + getUsed(g), 0)
  const totalMemCapNum = gpus.reduce((acc, g) => acc + getTotal(g), 0)
  const totalMemPct = totalMemCapNum > 0 ? ((totalMemUsedNum / totalMemCapNum) * 100).toFixed(1) : '0.0'
  const gpuModelName = gpus[0]?.name || 'GPU'

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      {/* 顶部总览 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-semibold text-slate-100 text-base flex items-center gap-2">
            <Gauge className="w-5 h-5 text-slate-400" /> GPU 实时拓扑与显存
          </h2>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-indigo-300 font-mono border border-slate-700 font-medium">
            {gpuModelName} · {gpus.length} 卡在线
          </span>
        </div>
        <span className="text-sm text-slate-400 font-mono">
          总显存: <span className="text-slate-200 font-medium">{totalMemUsedNum.toFixed(1)}</span> / {totalMemCapNum.toFixed(1)} GB ({totalMemPct}%)
        </span>
      </div>

      {/* 经典 4 列宽敞卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
        {gpus.map((gpu, idx) => {
          const used = getUsed(gpu).toFixed(1)
          const total = getTotal(gpu).toFixed(1)
          const pct = Math.min(Math.max(getPct(gpu), 0), 100).toFixed(1)
          const isHigh = Number(pct) > 80
          const isMid = Number(pct) > 30
          const cardId = gpu.id.startsWith('HCU-') ? gpu.id : `GPU ${gpu.id}`
          const modelName = gpu.name || 'GPU'

          return (
            <div
              key={gpu.id || idx}
              className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3.5 relative overflow-hidden"
            >
              {/* 卡片头部：标明型号 */}
              <div className="flex items-center justify-between text-sm mb-2.5 font-mono">
                <div className="flex items-center gap-2 truncate">
                  <span className="font-bold text-slate-100">{cardId}</span>
                  <span className="text-[11px] text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.2 rounded truncate">
                    {modelName}
                  </span>
                </div>
                <span className="text-slate-400 text-xs shrink-0">{gpu.temp}°C · {gpu.power}W</span>
              </div>

              {/* 显存进度条 */}
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden mb-2.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isHigh
                      ? 'bg-rose-500'
                      : isMid
                      ? 'bg-indigo-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* 显存数值与百分比 */}
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>{used} / {total} GB</span>
                <span className={isHigh ? 'text-rose-400 font-semibold' : isMid ? 'text-indigo-300 font-medium' : 'text-slate-500'}>
                  {pct}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
