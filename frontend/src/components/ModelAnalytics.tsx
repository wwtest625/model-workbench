import React, { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { LineChart, Target, Zap } from 'lucide-react'

export const ModelAnalytics: React.FC = () => {
  const throughputRef = useRef<HTMLDivElement>(null)
  const latencyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!throughputRef.current || !latencyRef.current) return

    const tpChart = echarts.init(throughputRef.current, 'dark', { backgroundColor: 'transparent' } as any)
    const latChart = echarts.init(latencyRef.current, 'dark', { backgroundColor: 'transparent' } as any)

    const concurrencies = ['1', '2', '4', '8', '16', '32', '64', '128', '256', '512', '1024']

    tpChart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['Qwen3.8-27B (vLLM)', 'DeepSeek-V4-W8A8', 'GLM-4.7-W8A8', 'MiniMax-M2.5'], bottom: 0 },
      grid: { top: 20, left: 50, right: 20, bottom: 40 },
      xAxis: { type: 'category', data: concurrencies, name: '并发' },
      yAxis: { type: 'value', name: 'tok/s', splitLine: { lineStyle: { color: '#1e293b' } } },
      series: [
        { name: 'Qwen3.8-27B (vLLM)', type: 'line', smooth: true, data: [74, 145, 280, 520, 910, 1420, 1980, 2350, 2410, 2380, 2290], lineStyle: { color: '#6366f1', width: 3 } },
        { name: 'DeepSeek-V4-W8A8', type: 'line', smooth: true, data: [68, 132, 255, 480, 850, 1350, 1820, 2150, 2240, 2210, 2150], lineStyle: { color: '#10b981', width: 2 } },
        { name: 'GLM-4.7-W8A8', type: 'line', smooth: true, data: [62, 120, 230, 440, 780, 1210, 1650, 1920, 1980, 1940, 1890], lineStyle: { color: '#06b6d4', width: 2 } },
        { name: 'MiniMax-M2.5', type: 'line', smooth: true, data: [58, 110, 210, 400, 720, 1150, 1540, 1810, 1860, 1830, 1780], lineStyle: { color: '#f59e0b', width: 2 } }
      ]
    })

    latChart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['TTFT (ms)', 'TPOT (ms/tok)'], bottom: 0 },
      grid: { top: 20, left: 50, right: 50, bottom: 40 },
      xAxis: { type: 'category', data: concurrencies },
      yAxis: [
        { type: 'value', name: 'TTFT (ms)', splitLine: { lineStyle: { color: '#1e293b' } } },
        { type: 'value', name: 'TPOT (ms)', splitLine: { show: false } }
      ],
      series: [
        { name: 'TTFT (ms)', type: 'bar', yAxisIndex: 0, data: [118, 130, 155, 195, 245, 330, 480, 750, 1280, 2450, 4800], itemStyle: { color: '#6366f1' } },
        { name: 'TPOT (ms/tok)', type: 'line', yAxisIndex: 1, smooth: true, data: [13.5, 14.1, 15.2, 16.8, 18.2, 22.5, 28.4, 38.2, 54.0, 89.2, 152.0], lineStyle: { color: '#06b6d4', width: 3 } }
      ]
    })

    const handleResize = () => {
      tpChart.resize()
      latChart.resize()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="space-y-6">
      {/* SLO 摸高分析卡片 */}
      <section className="bg-slate-900 border border-indigo-500/30 rounded-xl p-5 shadow-lg shadow-indigo-950/20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-400" /> SLO 约束摸高与饱和并发分析
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              设定业务 SLA 延迟上限，系统自动计算各模型在满足 SLA 前提下的最大承载并发与吞吐峰值
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
              <span className="text-slate-400">TTFT 目标:</span>
              <span className="font-mono text-cyan-400 font-bold">≤ 500 ms</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
              <span className="text-slate-400">TPOT 目标:</span>
              <span className="font-mono text-indigo-400 font-bold">≤ 35 ms</span>
            </div>
            <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-semibold">
              最佳承载: Concurrency=64~128
            </span>
          </div>
        </div>
      </section>

      {/* 图表对比 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-2">
              <LineChart className="w-4 h-4 text-emerald-400" /> 多模型吞吐量 (Throughput tok/s) 对比
            </h3>
            <span className="text-xs text-slate-400">短上下文 (128 → 128)</span>
          </div>
          <div ref={throughputRef} className="w-full h-80" />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" /> TTFT & TPOT 延迟随并发增长走势
            </h3>
            <span className="text-xs text-slate-400">Qwen3.8-27B vs DeepSeek-V4</span>
          </div>
          <div ref={latencyRef} className="w-full h-80" />
        </div>
      </div>
    </div>
  )
}
