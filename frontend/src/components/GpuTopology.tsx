import React from 'react'
import { Gauge, Zap, Flame, Cpu } from 'lucide-react'
import { GPUInfo } from '../types'

interface GpuTopologyProps {
  gpus: GPUInfo[]
}

export const GpuTopology: React.FC<GpuTopologyProps> = ({ gpus }) => {
  const totalMemUsedNum = gpus.reduce((acc, g) => acc + (Number(g.memUsed) || 0), 0)
  const totalMemCapNum = gpus.reduce((acc, g) => acc + (Number(g.memTotal) || 0), 0)
  const totalMemPct = totalMemCapNum > 0 ? ((totalMemUsedNum / totalMemCapNum) * 100).toFixed(1) : '0.0'
  const activeCards = gpus.filter((g) => (g.memPct || 0) > 10 || (g.usage || 0) > 0).length

  // 根据 GPU 数量自动决定每行网格列数 (8卡/16卡智能自适应)
  const gridColsClass =
    gpus.length > 8
      ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-8'
      : gpus.length > 4
      ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-4'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      {/* 顶部总览 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80 text-sm">
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-slate-100 text-base flex items-center gap-2">
            <Gauge className="w-5 h-5 text-indigo-400" /> GPU 实时拓扑与显存
          </h2>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700 font-medium">
            {gpus.length} 卡在线
          </span>
          {activeCards > 0 && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/20 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> {activeCards} 卡计算中
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-slate-400">
            总显存池: <span className="text-slate-100 font-semibold">{totalMemUsedNum.toFixed(1)}</span> / {totalMemCapNum.toFixed(1)} GB (
            <span className={Number(totalMemPct) > 50 ? 'text-indigo-400 font-bold' : 'text-slate-300'}>{totalMemPct}%</span>)
          </span>
        </div>
      </div>

      {/* GPU 卡片自适应网格 */}
      <div className={`grid ${gridColsClass} gap-3`}>
        {gpus.map((gpu, idx) => {
          const used = Number(gpu.memUsed || 0).toFixed(1)
          const total = Number(gpu.memTotal || 0).toFixed(1)
          const pct = Math.min(Math.max(Number(gpu.memPct || 0), 0), 100).toFixed(1)
          const isHigh = Number(pct) > 80
          const isMid = Number(pct) > 30
          const cardId = gpu.id.startsWith('HCU-') ? gpu.id : `GPU ${gpu.id}`

          return (
            <div
              key={gpu.id || idx}
              className={`bg-slate-950/90 border rounded-xl p-3 flex flex-col justify-between transition shadow-sm ${
                isHigh
                  ? 'border-rose-500/40 shadow-rose-950/20'
                  : isMid
                  ? 'border-indigo-500/30'
                  : 'border-slate-800/80 hover:border-slate-700'
              }`}
            >
              {/* 卡片头部 */}
              <div>
                <div className="flex items-center justify-between gap-1 mb-2 font-mono">
                  <span className="font-bold text-xs text-slate-200 truncate">{cardId}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                      gpu.usage > 0
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    Util {gpu.usage}%
                  </span>
                </div>

                {/* 显存进度条 */}
                <div className="w-full bg-slate-800/90 h-2 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isHigh
                        ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                        : isMid
                        ? 'bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.5)]'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* 显存数值 */}
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2">
                  <span>{used} / {total} GB</span>
                  <span className={isHigh ? 'text-rose-400 font-bold' : isMid ? 'text-indigo-300 font-medium' : 'text-slate-400'}>
                    {pct}%
                  </span>
                </div>
              </div>

              {/* 底部温度与功耗 */}
              <div className="pt-2 border-t border-slate-900/90 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span className="flex items-center gap-0.5">
                  <Flame className="w-3 h-3 text-amber-500/80" /> {gpu.temp}°C
                </span>
                <span className="flex items-center gap-0.5">
                  <Zap className="w-3 h-3 text-slate-400" /> {gpu.power}W
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
