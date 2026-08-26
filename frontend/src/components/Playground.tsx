import React, { useState } from 'react'
import { Send, Bot, Sliders, Sparkles } from 'lucide-react'

interface PlaygroundProps {
  currentHostName?: string
  apiPort?: number
}

export const Playground: React.FC<PlaygroundProps> = ({ currentHostName = '146', apiPort = 8000 }) => {
  const [prompt, setPrompt] = useState('请用两句话介绍一下量子计算的基本原理，并给出一个生活中的比喻。')
  const [maxTokens, setMaxTokens] = useState(256)
  const [temperature, setTemperature] = useState(0.7)
  const [generating, setGenerating] = useState(false)
  const [reply, setReply] = useState<string>('')
  const [stats, setStats] = useState({ cost: 0, speed: 0, tokens: 0 })

  const handleSend = async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setReply('正在向大模型发送请求并实时计算生成中...')
    try {
      const res = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          max_tokens: maxTokens,
          temperature,
          port: apiPort
        })
      })
      const data = await res.json()
      if (data.ok) {
        setReply(data.reply)
        setStats({
          cost: data.cost,
          speed: data.speed,
          tokens: (data.prompt_tokens || 0) + (data.completion_tokens || 0)
        })
      } else {
        setReply(`[请求异常] ${data.error || '未知错误'}`)
      }
    } catch (e: any) {
      setReply(`[网络错误] ${e.message}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 左侧参数调节面板 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-400" /> 参数与 Prompt 输入
        </h3>
        <div>
          <label className="block text-xs text-slate-400 mb-1">测试 Prompt</label>
          <textarea
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none font-sans"
            placeholder="输入测试 Prompt..."
          />
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Max Tokens</span>
            <span className="font-mono text-indigo-400">{maxTokens}</span>
          </div>
          <input
            type="range"
            min="32"
            max="1024"
            step="32"
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value))}
            className="w-full accent-indigo-500 cursor-pointer"
          />
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Temperature</span>
            <span className="font-mono text-indigo-400">{temperature}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-indigo-500 cursor-pointer"
          />
        </div>
        <button
          onClick={handleSend}
          disabled={generating}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition"
        >
          <Send className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
          <span>{generating ? '正在调用大模型推理中...' : '发送推理验证'}</span>
        </button>
      </div>

      {/* 右侧回复区域 */}
      <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between shadow-sm">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-400" /> 模型实时回复
            </h3>
            <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
              <span>耗时: <strong className="text-indigo-400">{stats.cost} s</strong></span>
              <span>吞吐: <strong className="text-emerald-400">{stats.speed} tok/s</strong></span>
              <span>Tokens: <strong className="text-slate-200">{stats.tokens}</strong></span>
            </div>
          </div>
          <div className="text-xs text-slate-300 leading-relaxed font-sans min-h-[180px] whitespace-pre-wrap select-text">
            {reply || <span className="text-slate-500">点击「发送推理验证」测试目标服务器上运行的模型...</span>}
          </div>
        </div>
        <div className="text-[11px] text-slate-500 pt-3 border-t border-slate-800/80 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>当前直连目标服务器：<strong>{currentHostName}</strong> (端口 :{apiPort}/v1/chat/completions)</span>
        </div>
      </div>
    </div>
  )
}
