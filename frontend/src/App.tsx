import React, { useState, useEffect } from 'react'
import { Layers, Search, Activity, MessageSquare, Archive } from 'lucide-react'
import { Navbar } from './components/Navbar'
import { GpuTopology } from './components/GpuTopology'
import { ModelManager } from './components/ModelManager'
import { ModelHub } from './components/ModelHub'
import { BenchmarkConsole } from './components/BenchmarkConsole'
import { Playground } from './components/Playground'
import { LogArchive } from './components/LogArchive'
import { ConfirmModal, ConfirmOptions } from './components/ConfirmModal'
import { ToastContainer, ToastItem } from './components/Toast'
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

  // 自绘弹窗与通知状态
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null)
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString() + Math.random().toString().substring(2, 6)
    setToasts((prev) => [...prev, { id, message, type }])
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const openConfirm = (opts: ConfirmOptions) => {
    setConfirmOptions(opts)
    setConfirmOpen(true)
  }

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
      setGpus(data.gpus || [])
    } catch (e) {
      console.error(e)
    }
  }

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/v1/models')
      const data = await res.json()
      setModels(data.models || [])
    } catch (e) {
      console.error(e)
    }
  }

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/v1/benchmark/logs')
      const data = await res.json()
      setLogFiles(data.logs || [])
    } catch (e) {
      console.error(e)
    }
  }

  const handleRefreshAll = async () => {
    setRefreshing(true)
    await Promise.all([fetchHosts(), fetchEnv(), fetchGPUs(), fetchModels(), fetchLogs()])
    setRefreshing(false)
    showToast('数据已全面刷新', 'success')
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
        showToast('已切换至服务器 ' + data.current.name, 'success')
      }
    } catch (e: any) {
      showToast('切换主机失败: ' + e.message, 'error')
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
      showToast(data.message || '添加成功', 'success')
      fetchHosts()
    } catch (e: any) {
      showToast('添加失败: ' + e.message, 'error')
    }
  }

  // 启动服务确认
  const handleStartModel = (m: ModelCard) => {
    openConfirm({
      title: '启动模型服务确认',
      message: '确定要在算力机上启动【' + m.name + '】服务吗？',
      detail: '启动引擎: ' + m.engine + ' · TP=' + m.tp + ' · Port=' + m.port + ' · 脚本: ' + m.script,
      confirmText: '确认启动',
      type: 'primary',
      onConfirm: async () => {
        setOperatingModel(true)
        showToast('正在启动模型【' + m.name + '】...', 'info')
        try {
          await fetch('/api/v1/models/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: m.name, script: m.service_name || m.name })
          })
          showToast('【' + m.name + '】启动指令已发送，正在加载权重', 'success')
          setTimeout(fetchModels, 2000)
        } catch (e: any) {
          showToast('启动失败: ' + e.message, 'error')
        } finally {
          setOperatingModel(false)
        }
      }
    })
  }

  // 停止单容器服务确认
  const handleStopModel = (m: ModelCard) => {
    openConfirm({
      title: '停止模型服务确认',
      message: '确定要停止【' + m.name + '】服务吗？',
      detail: '将仅停止该模型容器（' + (m.service_name || m.name) + '），不影响其他运行中的模型。',
      confirmText: '确认停止',
      type: 'warning',
      onConfirm: async () => {
        showToast('正在停止【' + m.name + '】服务...', 'info')
        try {
          await fetch('/api/v1/models/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: m.name,
              service_name: m.service_name,
              container_name: m.container_name
            })
          })
          showToast('【' + m.name + '】停止指令已执行', 'success')
          setTimeout(fetchModels, 1500)
        } catch (e: any) {
          showToast('停止失败: ' + e.message, 'error')
        }
      }
    })
  }

  // 重启单容器服务确认
  const handleRestartModel = (m: ModelCard) => {
    const cName = m.container_name || m.service_name || m.name
    openConfirm({
      title: '重启模型容器确认',
      message: '确定要重启【' + m.name + '】容器吗？',
      detail: '将执行 docker restart ' + cName + '，重新加载启动脚本与配置文件。',
      confirmText: '确认重启',
      type: 'warning',
      onConfirm: async () => {
        showToast('正在重启【' + m.name + '】容器...', 'info')
        setOperatingModel(true)
        try {
          const res = await fetch('/api/v1/models/restart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: m.name,
              service_name: m.service_name,
              container_name: m.container_name
            })
          })
          const data = await res.json()
          if (res.ok) {
            showToast(data.message || '【' + m.name + '】容器重启成功', 'success')
            setTimeout(fetchModels, 2000)
          } else {
            showToast(data.error || '重启失败', 'error')
          }
        } catch (e: any) {
          showToast('重启失败: ' + e.message, 'error')
        } finally {
          setOperatingModel(false)
        }
      }
    })
  }

  // 停止全部服务确认 (高危操作)
  const handleStopAll = () => {
    openConfirm({
      title: '停止所有服务警告',
      message: '确定要停止当前主机上所有运行中的大模型推理服务吗？',
      detail: '此操作将释放所有 GPU 显存并关闭正在运行的 Docker 容器与后台进程。',
      confirmText: '立即停止所有服务',
      cancelText: '取消',
      type: 'danger',
      onConfirm: async () => {
        showToast('正在停止所有运行中的服务...', 'info')
        try {
          await fetch('/api/v1/models/stop-all', { method: 'POST' })
          showToast('所有服务停止指令已执行，显存已释放', 'success')
          setTimeout(fetchModels, 1500)
        } catch (e: any) {
          showToast('停止失败: ' + e.message, 'error')
        }
      }
    })
  }

  const handleStartBenchmark = async (model: string, dataset: string, concurrency: string) => {
    setBenchRunning(true)
    setConsoleLogs(['=== 开始在容器内执行压测 (' + model + ' / ' + dataset + ') ==='])
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
          showToast('基准压测已执行完毕', 'success')
        }
      } catch (e) {}
    }
    es.onerror = () => {
      setBenchRunning(false)
      es.close()
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
          showToast('MCCL 通信测试已完成', 'success')
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
      {/* 全局 Toast 通知气泡 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* 全局自绘 ConfirmModal */}
      <ConfirmModal
        isOpen={confirmOpen}
        options={confirmOptions}
        onClose={() => setConfirmOpen(false)}
      />

      {/* 顶部导航 */}
      <Navbar
        hosts={hosts}
        currentHost={currentHost}
        envStatus={envStatus}
        refreshing={refreshing}
        onRefresh={handleRefreshAll}
        onSwitchHost={handleSwitchHost}
        onAddHost={handleAddHost}
        onCheckEnv={fetchEnv}
        onRunMCCL={handleRunMCCL}
        openConfirm={openConfirm}
        showToast={showToast}
      />

      {/* 主工作区 */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* GPU 实时拓扑 */}
        <GpuTopology gpus={gpus} />

        {/* 标签栏 */}
        <div className="border-b border-slate-800 flex items-center gap-8 text-base font-medium">
          <button
            onClick={() => setCurrentTab('models')}
            className={'flex items-center gap-2 pb-3 transition ' + (currentTab === 'models' ? 'text-indigo-400 border-b-2 border-indigo-500 font-semibold' : 'text-slate-400 hover:text-slate-200')}
          >
            <Layers className="w-5 h-5" />
            <span>模型服务 ({models.length})</span>
          </button>
          <button
            onClick={() => setCurrentTab('hub')}
            className={'flex items-center gap-2 pb-3 transition ' + (currentTab === 'hub' ? 'text-indigo-400 border-b-2 border-indigo-500 font-semibold' : 'text-slate-400 hover:text-slate-200')}
          >
            <Search className="w-5 h-5" />
            <span>Model Hub</span>
          </button>
          <button
            onClick={() => setCurrentTab('benchmark')}
            className={'flex items-center gap-2 pb-3 transition ' + (currentTab === 'benchmark' ? 'text-indigo-400 border-b-2 border-indigo-500 font-semibold' : 'text-slate-400 hover:text-slate-200')}
          >
            <Activity className="w-5 h-5" />
            <span>性能巡检</span>
          </button>
          <button
            onClick={() => setCurrentTab('playground')}
            className={'flex items-center gap-2 pb-3 transition ' + (currentTab === 'playground' ? 'text-indigo-400 border-b-2 border-indigo-500 font-semibold' : 'text-slate-400 hover:text-slate-200')}
          >
            <MessageSquare className="w-5 h-5" />
            <span>Playground</span>
          </button>
          <button
            onClick={() => setCurrentTab('logs')}
            className={'flex items-center gap-2 pb-3 transition ' + (currentTab === 'logs' ? 'text-indigo-400 border-b-2 border-indigo-500 font-semibold' : 'text-slate-400 hover:text-slate-200')}
          >
            <Archive className="w-5 h-5" />
            <span>基准归档</span>
          </button>
        </div>

        {/* Tab 页面展示 */}
        {currentTab === 'models' && (
          <ModelManager
            models={models}
            operatingModel={operatingModel}
            onStartModel={handleStartModel}
            onRestartModel={handleRestartModel}
            onStopModel={handleStopModel}
            onStopAll={handleStopAll}
            showToast={showToast}
          />
        )}

        {currentTab === 'hub' && (
          <ModelHub openConfirm={openConfirm} showToast={showToast} />
        )}

        {currentTab === 'benchmark' && (
          <BenchmarkConsole
            models={models}
            benchRunning={benchRunning}
            consoleLogs={consoleLogs}
            onStartBenchmark={handleStartBenchmark}
            onClearLogs={() => setConsoleLogs(['[控制台就绪] 已清空日志'])}
          />
        )}

        {currentTab === 'playground' && (
          <Playground currentHostName={currentHost?.name} apiPort={currentHost?.api_port || 8000} models={models} />
        )}

        {currentTab === 'logs' && <LogArchive logs={logFiles} onRefresh={fetchLogs} />}
      </main>
    </div>
  )
}
