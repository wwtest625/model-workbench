import React, { useState, useEffect, useRef } from "react"
import { Send, Bot, Sliders, Sparkles, Cpu, Copy, Check, Trash2, AlertTriangle, Network, Maximize2, Minimize2, Square, Zap } from "lucide-react"
import { ModelCard } from "../types"

interface PlaygroundProps {
  currentHostName?: string
  apiPort?: number
  models?: ModelCard[]
}

export const Playground: React.FC<PlaygroundProps> = ({ currentHostName = "146", apiPort = 8000, models = [] }) => {
  const [prompt, setPrompt] = useState("请用两句话介绍一下量子计算的基本原理，并给出一个生活中的比喻。")
  const [maxTokens, setMaxTokens] = useState(4096)
  const [temperature, setTemperature] = useState(0.7)
  const [targetPort, setTargetPort] = useState<number>(apiPort || 8000)
  const [generating, setGenerating] = useState(false)
  const [reply, setReply] = useState<string>("")
  const [finishReason, setFinishReason] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [stats, setStats] = useState({ cost: 0, speed: 0, tokens: 0, actualPort: 8000, actualModel: "" })

  const abortControllerRef = useRef<AbortController | null>(null)
  const outputContainerRef = useRef<HTMLDivElement | null>(null)

  const readyModels = models.filter((m) => m.status === "READY")
  const [selectedModelName, setSelectedModelName] = useState<string>("")

  // 监听 models 列表初始化
  useEffect(() => {
    if (readyModels.length > 0 && (!selectedModelName || !readyModels.some((m) => m.name === selectedModelName))) {
      const first = readyModels[0]
      setSelectedModelName(first.name)
      if (first.port) {
        setTargetPort(first.port)
      }
    }
  }, [models])

  // 切换模型时同步对应端口
  const handleModelChange = (modelName: string) => {
    setSelectedModelName(modelName)
    const found = readyModels.find((m) => m.name === modelName)
    if (found && found.port) {
      setTargetPort(found.port)
    }
  }

  // 快捷端口切换
  const handleQuickPort = (portNum: number) => {
    setTargetPort(portNum)
    const match = readyModels.find((m) => m.port === portNum)
    if (match) {
      setSelectedModelName(match.name)
    }
  }

  const handleCopy = () => {
    if (!reply) return
    navigator.clipboard.writeText(reply)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClear = () => {
    if (generating) {
      handleStop()
    }
    setReply("")
    setFinishReason("")
    setStats({ cost: 0, speed: 0, tokens: 0, actualPort: targetPort, actualModel: "" })
  }

  // 终止正在进行的流式生成
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setGenerating(false)
    setFinishReason("stopped")
  }

  // 流式打字机发送逻辑 (SSE)
  const handleSend = async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setFinishReason("")
    setReply("")
    setStats({ cost: 0, speed: 0, tokens: 0, actualPort: targetPort, actualModel: selectedModelName })

    const controller = new AbortController()
    abortControllerRef.current = controller

    const startTime = performance.now()
    let accumulatedText = ""
    let tokenCount = 0

    try {
      const response = await fetch("/api/v1/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt,
          max_tokens: Number(maxTokens) || 4096,
          temperature,
          port: Number(targetPort) || 8000,
          model: selectedModelName || ""
        })
      })

      if (!response.ok) {
        const errText = await response.text()
        setReply(`[请求异常 HTTP ${response.status}] ${errText}`)
        setGenerating(false)
        return
      }

      if (!response.body) {
        setReply("[错误] 服务端未返回响应数据流")
        setGenerating(false)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder("utf-8")
      let buffer = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith("data:")) continue

          const jsonStr = trimmed.slice(5).trim()
          if (jsonStr === "[DONE]") {
            break
          }

          try {
            const parsed = JSON.parse(jsonStr)
            const choice = parsed.choices?.[0]
            if (choice) {
              if (choice.delta?.content) {
                accumulatedText += choice.delta.content
                tokenCount += 1
                setReply(accumulatedText)

                // 自动平滑滚动到底部
                if (outputContainerRef.current) {
                  outputContainerRef.current.scrollTop = outputContainerRef.current.scrollHeight
                }
              }
              if (choice.finish_reason) {
                setFinishReason(choice.finish_reason)
              }
            }

            const elapsedSec = Math.max(0.1, (performance.now() - startTime) / 1000)
            setStats({
              cost: Number(elapsedSec.toFixed(2)),
              speed: Number((tokenCount / elapsedSec).toFixed(1)),
              tokens: tokenCount,
              actualPort: targetPort,
              actualModel: selectedModelName
            })
          } catch (err) {
            // 忽略非完整 JSON 行
          }
        }
      }

      const finalElapsed = Math.max(0.1, (performance.now() - startTime) / 1000)
      setStats((prev) => ({
        ...prev,
        cost: Number(finalElapsed.toFixed(2)),
        speed: Number((tokenCount / finalElapsed).toFixed(1)),
        tokens: tokenCount
      }))
    } catch (e: any) {
      if (e.name === "AbortError") {
        setFinishReason("stopped")
      } else {
        setReply((prev) => prev + `\n\n[网络连接异常]: ${e.message}`)
      }
    } finally {
      setGenerating(false)
      abortControllerRef.current = null
    }
  }

  return (
    <div className={`grid gap-6 transition-all duration-300 ${expanded ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"}`}>
      {/* 左侧参数调节面板 */}
      {!expanded && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-100 text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" /> 参数与 Prompt 输入
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                :{targetPort}
              </span>
            </h3>

            {/* 端口选择与快速切换 */}
            <div className="bg-slate-950/80 border border-slate-800/90 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                <span className="flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5 text-cyan-400" />
                  <span>服务端口 (Target Port)</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  直连端口
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickPort(8000)}
                  className={`py-1.5 px-2 rounded text-xs font-mono font-medium transition flex flex-col items-center justify-center border ${
                    targetPort === 8000
                      ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                      : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <span>:8000</span>
                  <span className="text-[9px] opacity-80 scale-90">Base 基座</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPort(8001)}
                  className={`py-1.5 px-2 rounded text-xs font-mono font-medium transition flex flex-col items-center justify-center border ${
                    targetPort === 8001
                      ? "bg-purple-600 text-white border-purple-500 shadow-sm"
                      : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <span>:8001</span>
                  <span className="text-[9px] opacity-80 scale-90">Distill 蒸馏</span>
                </button>
                <div className="relative">
                  <input
                    type="number"
                    value={targetPort}
                    onChange={(e) => setTargetPort(parseInt(e.target.value) || 8000)}
                    className="w-full h-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded px-2 text-center text-xs font-mono text-cyan-300 focus:outline-none"
                    placeholder="端口"
                  />
                </div>
              </div>
            </div>

            {/* 动态目标模型选择 */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-cyan-400" />
                  <span>目标测试模型</span>
                </span>
                <span className="font-mono text-cyan-400 text-[11px]">
                  {readyModels.length} 个运行中
                </span>
              </label>
              <select
                value={selectedModelName}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              >
                {readyModels.length === 0 ? (
                  <option value="">未自动检测到模型（使用端口 :{targetPort} 直连）</option>
                ) : (
                  readyModels.map((m) => (
                    <option key={`${m.name}-${m.port}`} value={m.name}>
                      {m.name} · [:{m.port || targetPort}] ({m.engine}, TP={m.tp})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 测试 Prompt */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">测试 Prompt</label>
              <textarea
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none font-sans leading-relaxed"
                placeholder="输入测试 Prompt..."
              />
            </div>

            {/* Max Tokens 设置 (大幅解禁至 16384，支持自由键盘输入与超长输出) */}
            <div className="bg-slate-950/80 border border-slate-800/90 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-medium">Max Tokens (最大生成长度)</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="64"
                    max="65536"
                    step="256"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                    className="w-20 bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded px-2 py-0.5 text-right font-mono text-xs text-indigo-400 font-semibold focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 font-mono">tokens</span>
                </div>
              </div>
              <input
                type="range"
                min="256"
                max="16384"
                step="256"
                value={maxTokens > 16384 ? 16384 : maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-1">
                {[1024, 2048, 4096, 8192, 16384].map((tok) => (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => setMaxTokens(tok)}
                    className={`px-1.5 py-0.5 rounded transition ${
                      maxTokens === tok
                        ? "bg-indigo-900/90 text-indigo-200 border border-indigo-600 font-bold"
                        : "bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {tok >= 1024 ? `${tok / 1024}K` : tok}
                  </button>
                ))}
              </div>
            </div>

            {/* Temperature */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Temperature (生成发散度)</span>
                <span className="font-mono text-indigo-400 font-semibold">{temperature}</span>
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
          </div>

          <div className="flex gap-2 mt-4">
            {generating ? (
              <button
                type="button"
                onClick={handleStop}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition animate-pulse"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>停止打字机流式生成</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>发送流式推理验证 (:{targetPort})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 右侧回复区域 (打字机流式展现与超大独立滚动) */}
      <div className={`${expanded ? "col-span-1" : "lg:col-span-2"} bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between shadow-sm min-h-[620px]`}>
        <div className="flex flex-col flex-1">
          {/* 顶部状态与统计栏 */}
          <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 mb-4 gap-2">
            <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-400" />
              <span>流式实时打字机输出</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                :{stats.actualPort || targetPort}
              </span>
              {generating && (
                <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-ping"></span>
                  正在实时生成中...
                </span>
              )}
              {stats.actualModel && !generating && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-900/60 hidden sm:inline">
                  {stats.actualModel}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-3 text-xs font-mono text-slate-400 mr-2">
                <span>耗时: <strong className="text-indigo-400">{stats.cost}s</strong></span>
                <span>吞吐: <strong className="text-emerald-400">{stats.speed} tok/s</strong></span>
                <span>Tokens: <strong className="text-slate-200">{stats.tokens}</strong></span>
              </div>
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs flex items-center gap-1 transition"
                title={expanded ? "恢复分栏视图" : "全屏沉浸阅读"}
              >
                {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span className="text-[11px] hidden sm:inline">{expanded ? "还原" : "宽屏"}</span>
              </button>
              {reply && (
                <>
                  <button
                    onClick={handleCopy}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs flex items-center gap-1 transition"
                    title="复制完整回复"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="text-[11px]">{copied ? "已复制" : "复制"}</span>
                  </button>
                  <button
                    onClick={handleClear}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 rounded text-xs transition"
                    title="清空输出"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 截断或完成提示栏 */}
          {finishReason === "length" && (
            <div className="mb-3 px-3.5 py-2 bg-amber-950/60 border border-amber-700/80 rounded-lg flex items-center justify-between text-xs text-amber-300">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>达到 Max Tokens 上限 ({maxTokens})：</strong>输出已自动停止。如需更长输出，可调大左侧 Max Tokens 再次生成。
                </span>
              </div>
            </div>
          )}
          {finishReason === "stopped" && (
            <div className="mb-3 px-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-400">
              用户已主动中断流式生成。
            </div>
          )}

          {/* 核心输出文本区域：超大容量独立滚动条，支持实时打字光标 */}
          <div
            ref={outputContainerRef}
            className={`flex-1 bg-slate-950/80 border border-slate-800/80 rounded-lg p-5 overflow-y-auto overflow-x-hidden text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap select-text selection:bg-indigo-600 selection:text-white ${
              expanded ? "max-h-[760px] min-h-[580px]" : "max-h-[640px] min-h-[460px]"
            }`}
          >
            {reply ? (
              <>
                {reply}
                {generating && (
                  <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse align-middle" />
                )}
              </>
            ) : (
              <span className="text-slate-500 select-none">
                点击左侧「发送流式推理验证」测试目标服务器上运行的大模型（支持秒级首字与实时打字流）...
              </span>
            )}
          </div>
        </div>

        {/* 底部实时连接状态 */}
        <div className="text-[11px] text-slate-500 pt-3 border-t border-slate-800/80 flex items-center justify-between mt-4">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              直连端点：<span className="font-mono text-cyan-400">http://{currentHostName}:{targetPort}/v1/chat/completions (SSE 流式)</span>
            </span>
          </div>
          <span className="font-mono text-[10px] text-emerald-400 font-medium">
            ● 0.3s 极速首字直出 · 零网络超时
          </span>
        </div>
      </div>
    </div>
  )
}
