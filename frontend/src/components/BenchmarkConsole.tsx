import React, { useState, useEffect, useRef } from 'react'
import { Play, Flame, Terminal } from 'lucide-react'

interface BenchmarkConsoleProps {
  models: { name: string; port: number }[]
  consoleLogs: string[]
  benchRunning: boolean
  onStartBenchmark: (model: string, dataset: string, concurrency: string) => void
}

export const BenchmarkConsole: React.FC<BenchmarkConsoleProps> = ({
  models,
  consoleLogs,
  benchRunning,
  onStartBenchmark
}) => {
  const [model, setModel] = useState('Qwen3.8-27B')
  const [dataset, setDataset] = useState('short')
  const [concurrency, setConcurrency] = useState('1, 2, 4, 8, 16, 32, 64, 128, 256')
  const consoleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [consoleLogs])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onStartBenchmark(model, dataset, concurrency)
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
          <Flame className="w-4 h-4 text-amber-400" /> 性能常规巡检控制台 (穿透进入容器执行 /workspace/run.py)
        </h3>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">测试目标模型</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} (:{m.port})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">测试场景模式</label>
            <select
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="short">短上下文 (128~2048 Tokens)</option>
              <option value="long">长上下文 (4K~32K Tokens)</option>
              <option value="slo">SLO 极限摸高压测 (阶梯并发)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">并发梯度 (Concurrency)</label>
            <input
              type="text"
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={benchRunning}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition"
            >
              <Play className={`w-3.5 h-3.5 ${benchRunning ? 'animate-spin' : ''}`} />
              <span>{benchRunning ? '压测实时推流中...' : '🚀 开始执行巡检压测'}</span>
            </button>
          </div>
        </form>

        {/* 实时终端回显窗口 */}
        <div
          ref={consoleRef}
          className="bg-black border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 space-y-1 h-80 overflow-y-auto leading-relaxed"
        >
          {consoleLogs.map((line, idx) => (
            <div
              key={idx}
              className={
                line.includes('Throughput')
                  ? 'text-emerald-400 font-bold'
                  : line.includes('===')
                  ? 'text-indigo-400 font-semibold'
                  : line.includes('ERROR') || line.includes('失败')
                  ? 'text-rose-400'
                  : 'text-slate-300'
              }
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
