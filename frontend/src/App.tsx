import React, { useState, useEffect } from 'react'
import { Layers, Search, Activity, MessageSquare, Archive } from 'lucide-react'
import { Navbar } from './components/Navbar'
import { GpuTopology } from './components/GpuTopology'
import { ModelManager } from './components/ModelManager'
import { ModelHub } from './components/ModelHub'
import { BenchmarkConsole } from './components/BenchmarkConsole'
import { Playground } from './components/Playground'
import { LogArchive } from './components/LogArchive'
import { HostConfig, EnvStatus, GPUInfo, ModelCard, LogFile } from './types'

export default function App() {
  const [currentTab, setCurrentTab] = useState<'models' | 'hub' | 'benchmark' | 'playground' | 'logs'>('models')
  const [hosts, setHosts] = useState<HostConfig[]>([])
  const [currentHost, setCurrentHost] = useState<HostConfig | null>(null)
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null)
  const [gpus, setGpus] = useState<GPUInfo[]>([])
  const [models, setModels] = useState<ModelCard[]>([])
  const [logFiles, setLogFiles] = useState<LogFile[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [operatingModel, setOperatingModel] = useState(false)
  const [benchRunning, setBenchRunning] = useState(false)
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    '[系统准备就绪] 点击「开始执行巡检压测」或「跑 MCCL 通信基准」实时查看推流日志...'
  ])

  // 1. 初始化拉取数据
  useEffect(() => {
    fetchHosts()
    fetchEnv()
    fetchGPUs()
    fetchModels()
    fetchLogs()

    const timer = setInterval(() => {
      fetchGPUs()
      fetchModels()
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const fetchHosts = async () => {
    try {
      const res = await fetch('/api/v1/hosts')
      const data = await res.json()
      setHosts(data.hosts || [])
      setCurrentHost(data.current || null)
    } catch (e) {
      console.error(e)
    }
  }

  const fetchEnv = async () => {
    try {
      const res = await fetch('/api/v1/env')
      const data = await res.json()
      setEnvStatus(data)
    } catch (e) {
      console.error(e)
    }
  }

  const fetchGPUs = async () => {
    try {
      const res = await fetch('/api/v1/gpus')
      const data = await res.json()
      if (data.gpus) setGpus(data.gpus)
    } catch (e) {
      console.error(e)
    }
  }

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/v1/models')
      const data = await res.json()
      if (data.models) setModels(data.models)
    } catch (e) {
      console.error(e)
    }
  }

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/v1/benchmark/logs')
      const data = await res.json()
      if (data.logs) setLogFiles(data.logs)
    } catch (e) {
      console.error(e)
    }
  }

  const handleRefreshAll = async () => {
    setRefreshing(true)
    await Promise.all([fetchHosts(), fetchEnv(), fetchGPUs(), fetchModels(), fetchLogs()])
    setRefreshing(false)
  }

  const handleSwitchHost = async (hostId: string) => {
    try {
      const res = await fetch('/api/v1/hosts/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_id: hostId })
      })
      const data = await res.json()
      if (data.current) {
        setCurrentHost(data.current)
        handleRefreshAll()
      }
    } catch (e: any) {
      alert(`切换主机失败: ${e.message}`)
    }
  }

  const handleAddHost = async (newHost: HostConfig) => {
    try {
      const res = await fetch('/api/v1/hosts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newHost)
      })
      const data = await res.json()
      alert(data.message)
      fetchHosts()
    } catch (e: any) {
      alert(`添加失败: ${e.message}`)
    }
  }

  const handleStartModel = async (m: ModelCard) => {
    setOperatingModel(true)
    try {
      const res = await fetch('/api/v1/models/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: m.name, script: m.script })
      })
      const data = await res.json()
      alert(data.message)
      setTimeout(fetchModels, 2000)
    } catch (e: any) {
      alert(`启动失败: ${e.message}`)
    } finally {
      setOperatingModel(false)
    }
  }

  const handleStopAll = async () => {
    if (!confirm('确定要停止当前主机上所有运行中的推理服务吗？')) return
    try {
      const res = await fetch('/api/v1/models/stop', { method: 'POST' })
      const data = await res.json()
      alert(data.message)
      setTimeout(fetchModels, 1500)
    } catch (e: any) {
      alert(`停止失败: ${e.message}`)
    }
  }

  const handleStartBenchmark = async (model: string, dataset: string, concurrency: string) => {
    setBenchRunning(true)
    setConsoleLogs([`=== 开始在容器内执行压测 (${model} / ${dataset}) ===`])
    const es = new EventSource('/api/v1/benchmark/stream')
    es.onmessage = (event) => {
      try {
        const d = JSON.parse(event.data)
        if (d.text) {
          setConsoleLogs((prev) => [...prev, d.text])
        }
        if (d.done) {
          setConsoleLogs((prev) => [...prev, '=== 压测执行完毕 ==='])
          es.close()
          setBenchRunning(false)
          fetchLogs()
        }
      } catch (e) {}
    }
    es.onerror = () => {
      setConsoleLogs((prev) => [...prev, '[通信提示] 压测后台任务已提交'])
      es.close()
      setBenchRunning(false)
    }
  }

  const handleRunMCCL = () => {
    setCurrentTab('benchmark')
    setBenchRunning(true)
    setConsoleLogs(['=== 开始跑 run_mccl_v6.sh (16进程 AllReduce 1GB通信测试) ==='])
    const es = new EventSource('/api/v1/mccl/stream')
    es.onmessage = (event) => {
      try {
        const d = JSON.parse(event.data)
        if (d.text) setConsoleLogs((prev) => [...prev, d.text])
        if (d.done) {
          setConsoleLogs((prev) => [...prev, '=== MCCL 测试完成 ==='])
          es.close()
          setBenchRunning(false)
        }
      } catch (e) {}
    }
    es.onerror = () => {
      es.close()
      setBenchRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 顶栏 */}
      <Navbar
        hosts={hosts}
        currentHost={currentHost}
        envStatus={envStatus}
        refreshing={refreshing}
        onSwitchHost={handleSwitchHost}
        onRefresh={handleRefreshAll}
        onRunMCCL={handleRunMCCL}
        onCheckEnv={() => fetchEnv().then(() => alert('环境预检完成！'))}
        onAddHost={handleAddHost}
      />

      {/* 主体 */}
      <main className="max-w-7xl mx-auto p-6 space-y-6 w-full flex-1">
        {/* GPU 实时拓扑 */}
        <GpuTopology gpus={gpus} />

        {/* 标签栏 */}
        <div className="border-b border-slate-800 flex items-center gap-6 text-sm font-medium">
          <button
            onClick={() => setCurrentTab('models')}
            className={`flex items-center gap-1.5 pb-3 transition ${
              currentTab === 'models' ? 'text-indigo-400 border-b-2 border-indigo-500 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>模型服务 ({models.length})</span>
          </button>
          <button
            onClick={() => setCurrentTab('hub')}
            className={`flex items-center gap-1.5 pb-3 transition ${
              currentTab === 'hub' ? 'text-indigo-400 border-b-2 border-indigo-500 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Model Hub</span>
          </button>
          <button
            onClick={() => setCurrentTab('benchmark')}
            className={`flex items-center gap-1.5 pb-3 transition ${
              currentTab === 'benchmark' ? 'text-indigo-400 border-b-2 border-indigo-500 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>性能巡检</span>
          </button>
          <button
            onClick={() => setCurrentTab('playground')}
            className={`flex items-center gap-1.5 pb-3 transition ${
              currentTab === 'playground' ? 'text-indigo-400 border-b-2 border-indigo-500 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Playground</span>
          </button>
          <button
            onClick={() => setCurrentTab('logs')}
            className={`flex items-center gap-1.5 pb-3 transition ${
              currentTab === 'logs' ? 'text-indigo-400 border-b-2 border-indigo-500 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>基准归档</span>
          </button>
        </div>

        {/* Tab 页面展示 */}
        {currentTab === 'models' && (
          <ModelManager
            models={models}
            operatingModel={operatingModel}
            onStartModel={handleStartModel}
            onStopAll={handleStopAll}
          />
        )}

        {currentTab === 'hub' && <ModelHub />}

        {currentTab === 'benchmark' && (
          <BenchmarkConsole
            models={models.map((m) => ({ name: m.name, port: m.port }))}
            consoleLogs={consoleLogs}
            benchRunning={benchRunning}
            onStartBenchmark={handleStartBenchmark}
          />
        )}

        {currentTab === 'playground' && (
          <Playground currentHostName={currentHost?.name} apiPort={currentHost?.api_port || 8000} />
        )}

        {currentTab === 'logs' && (
          <LogArchive logs={logFiles} workspace={currentHost?.workspace || '/home/workspace'} />
        )}
      </main>
    </div>
  )
}
