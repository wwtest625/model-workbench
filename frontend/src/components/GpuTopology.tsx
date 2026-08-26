import React from 'react'
import { Gauge } from 'lucide-react'
import { GPUInfo } from '../types'

interface GpuTopologyProps {
  gpus: GPUInfo[]
}

export const GpuTopology: React.FC<GpuTopologyProps> = ({ gpus }) => {
  const totalMemUsed = gpus.reduce((acc, g) => acc + (g.memUsed || 0), 0).toFixed(1)
  const totalMemCap = gpus.reduce((acc, g) => acc + (g.memTotal || 0), 0).toFixed(1)
  const totalMemPct = parseFloat(totalMemCap) > 0 ? ((parseFloat(totalMemUsed) / parseFloat(totalMemCap)) * 100).toFixed(1) : '0.0'

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <h2 className="font-semibold text-slate-100 text-base flex items-center gap-2">
            <Gauge className="w-5 h-5 text-slate-400" /> GPU 实时拓扑与显存
          </h2>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
            {gpus.length} 卡在线
          </span>
        </div>
        <span className="text-sm text-slate-400 font-mono">
          总显存: {totalMemUsed} / {totalMemCap} GB ({totalMemPct}%)
        </span>
      </div>

      {/* GPU 卡网格 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
        {gpus.map((gpu) => (
          <div key={gpu.id} className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3.5 relative overflow-hidden">
            <div className="flex items-center justify-between text-sm mb-2 font-mono">
              <span className="font-semibold text-slate-200">GPU {gpu.id}</span>
              <span className="text-slate-400 text-xs">{gpu.temp}°C · {gpu.power}W</span>
            </div>
            {/* 显存进度条 */}
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden mb-2.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  gpu.memPct > 80 ? 'bg-rose-500' : gpu.memPct > 40 ? 'bg-indigo-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${gpu.memPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>{gpu.memUsed} / {gpu.memTotal} GB</span>
              <span className={gpu.memPct > 50 ? 'text-slate-200 font-medium' : 'text-slate-500'}>
                {gpu.memPct}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
