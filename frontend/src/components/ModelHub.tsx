import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Search,
  Download,
  Copy,
  Check,
  HardDrive,
  Cloud,
  Server,
  RotateCw,
  ExternalLink,
  Database,
  AlertCircle,
  Terminal,
  X,
  Activity,
  Send,
  ArrowRight,
  Zap,
  Clock,
  Layers,
  Sparkles
} from 'lucide-react'
import { DownloadTask, RsyncTask } from '../types'

interface LocalAsset {
  name: string
  server: string
  path: string
  server_ip: string
  model_type: string
  architectures: string[]
  torch_dtype: string
  quant_method: string
  max_position: number
  time: string
  type: 'MAIN' | 'ARCHIVE'
}

interface AggregatedModelAsset {
  key: string
  name: string
  locations: {
    server: string
    server_ip: string
    path: string
    type: 'MAIN' | 'ARCHIVE'
    time: string
  }[]
  hasMain: boolean
  hasArchive: boolean
  isDuplicate: boolean
  model_type: string
  architectures: string[]
  torch_dtype: string
  quant_method: string
  max_position: number
}

interface HubModelItem {
  id: string
  name: string
  owner: string
  description: string
  downloads: number
  updated_at: string
  file_size: number
  local_status: 'LOCAL_76' | 'LOCAL_TEST03' | 'CLOUD_ONLY'
  local_path: string
  local_meta?: LocalAsset
  download_cmd: string
  rsync_cmd: string
}

interface ModelHubProps {
  openConfirm?: (opts: any) => void
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void
}

export const ModelHub: React.FC<ModelHubProps> = ({ openConfirm, showToast }) => {
  const [activeTab, setActiveTab] = useState<'search' | 'local'>('search')
  const [localFilter, setLocalFilter] = useState<'ALL' | 'MAIN' | 'ARCHIVE' | 'DUPLICATE'>('ALL')
  const [localSearch, setLocalSearch] = useState('')
  const [query, setQuery] = useState('')
  const [selectedOrg, setSelectedOrg] = useState('metax-tech')
  const [searching, setSearching] = useState(false)
  const [loadingLocal, setLoadingLocal] = useState(false)

  const [localAssets, setLocalAssets] = useState<LocalAsset[]>([])
  const [searchResults, setSearchResults] = useState<HubModelItem[]>([])
  const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([])
  const [rsyncTasks, setRsyncTasks] = useState<RsyncTask[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [logModal, setLogModal] = useState<{ open: boolean; dir: string; name: string; logs: string; loading: boolean } | null>(null)
  const [rsyncLogModal, setRsyncLogModal] = useState<{ open: boolean; name: string; logs: string; loading: boolean } | null>(null)
  const [distributeModal, setDistributeModal] = useState<{
    open: boolean
    name: string
    sourceServer: string
    sourcePath: string
    targetServer: string
    targetPath: string
  } | null>(null)

  const orgCacheRef = useRef<{ [org: string]: HubModelItem[] }>({})
  const localLoadedRef = useRef(false)
  const prevTasksCountRef = useRef(0)
  const prevRsyncCountRef = useRef(0)

  const orgOptions = [
    { id: 'metax-tech', name: 'metax-tech' },
    { id: 'Qwen', name: 'Qwen' },
    { id: 'deepseek-ai', name: 'deepseek-ai' },
    { id: 'ZhipuAI', name: 'ZhipuAI' },
    { id: 'MiniMax', name: 'MiniMax' }
  ]

  const fetchDownloadTasks = async () => {
    try {
      const res = await fetch('/api/v1/hub/download-tasks')
      const data = await res.json()
      const tasks: DownloadTask[] = data.tasks || []
      setDownloadTasks(tasks)

      if (prevTasksCountRef.current > 0 && tasks.length === 0) {
        fetchLocalAssets(true)
        if (showToast) showToast('76 存储服务器后台下载任务已完成！', 'success')
      }
      prevTasksCountRef.current = tasks.length
    } catch (e) {
      console.error('获取下载任务失败', e)
    }
  }

  const fetchRsyncTasks = async () => {
    try {
      const res = await fetch('/api/v1/hub/rsync-tasks')
      const data = await res.json()
      const tasks: RsyncTask[] = data.tasks || []
      setRsyncTasks(tasks)

      if (prevRsyncCountRef.current > 0 && tasks.length === 0) {
        if (showToast) showToast('模型分发传输已完成！目标算力机已就绪', 'success')
      }
      prevRsyncCountRef.current = tasks.length
    } catch (e) {
      console.error('获取分发任务失败', e)
    }
  }

  useEffect(() => {
    fetchDownloadTasks()
    fetchRsyncTasks()
    const timer = setInterval(() => {
      fetchDownloadTasks()
      fetchRsyncTasks()
    }, 2500)
    return () => clearInterval(timer)
  }, [])

  const openLogModal = async (dir: string, name: string) => {
    setLogModal({
      open: true,
      dir,
      name,
      logs: '正在连接 76 存储服务器拉取实时下载日志...',
      loading: true
    })
    try {
      const res = await fetch(`/api/v1/hub/download-log?dir=${encodeURIComponent(dir)}&lines=120`)
      const data = await res.json()
      setLogModal((prev) => (prev ? { ...prev, logs: data.logs || '暂无下载日志输出', loading: false } : null))
    } catch (e: any) {
      setLogModal((prev) => (prev ? { ...prev, logs: `拉取失败: ${e.message}`, loading: false } : null))
    }
  }

  const openRsyncLogModal = async (name: string) => {
    setRsyncLogModal({
      open: true,
      name,
      logs: '正在连接 76 存储服务器拉取分发传输日志...',
      loading: true
    })
    try {
      const res = await fetch(`/api/v1/hub/rsync-log?name=${encodeURIComponent(name)}&lines=120`)
      const data = await res.json()
      setRsyncLogModal((prev) => (prev ? { ...prev, logs: data.logs || '暂无分发日志输出', loading: false } : null))
    } catch (e: any) {
      setRsyncLogModal((prev) => (prev ? { ...prev, logs: `拉取失败: ${e.message}`, loading: false } : null))
    }
  }

  const openDistributeModal = (item: { name: string; path?: string; server?: string; server_ip?: string }) => {
    const defaultSourceServer = item.server_ip || '192.2.56.76'
    const defaultSourcePath = item.path || `/data/AI_model/${item.name}`
    const defaultTargetServer = '192.2.0.146'
    const defaultTargetPath = `/data/model/${item.name}`

    setDistributeModal({
      open: true,
      name: item.name,
      sourceServer: defaultSourceServer,
      sourcePath: defaultSourcePath,
      targetServer: defaultTargetServer,
      targetPath: defaultTargetPath
    })
  }

  const handleConfirmDistribute = async () => {
    if (!distributeModal) return
    const { name, sourceServer, sourcePath, targetServer, targetPath } = distributeModal
    setDistributeModal(null)
    if (showToast) showToast(`正在向 76 下发分发指令: ${name} ➡️ ${targetServer}...`, 'info')

    try {
      await fetch('/api/v1/hub/start-rsync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: name,
          source_server: sourceServer,
          source_path: sourcePath,
          target_server: targetServer,
          target_path: targetPath
        })
      })
      if (showToast) showToast(`分发任务已在后台启动！目标: ${targetServer}`, 'success')
      fetchRsyncTasks()
    } catch (e: any) {
      if (showToast) showToast('分发启动失败: ' + e.message, 'error')
    }
  }

  useEffect(() => {
    if (!query && orgCacheRef.current[selectedOrg]) {
      setSearchResults(orgCacheRef.current[selectedOrg])
    } else {
      handleSearch(undefined, false)
    }
  }, [selectedOrg])

  useEffect(() => {
    if (activeTab === 'local' && !localLoadedRef.current) {
      fetchLocalAssets(false)
    }
  }, [activeTab])

  const fetchLocalAssets = async (force: boolean) => {
    setLoadingLocal(true)
    try {
      const res = await fetch('/api/v1/hub/local?force=' + force)
      const data = await res.json()
      const list = data.assets || []
      setLocalAssets(list)
      localLoadedRef.current = true
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingLocal(false)
    }
  }

  const handleSearch = async (e?: React.FormEvent, force: boolean = true) => {
    if (e) e.preventDefault()
    if (!force && !query && orgCacheRef.current[selectedOrg]) {
      setSearchResults(orgCacheRef.current[selectedOrg])
      return
    }

    setSearching(true)
    try {
      const res = await fetch('/api/v1/hub/search?org=' + encodeURIComponent(selectedOrg) + '&q=' + encodeURIComponent(query))
      const data = await res.json()
      const models = data.models || []
      setSearchResults(models)
      if (!query) {
        orgCacheRef.current[selectedOrg] = models
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSearching(false)
    }
  }

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    if (showToast) showToast('已复制命令到剪贴板', 'success')
    setTimeout(() => setCopiedId(null), 2500)
  }

  const handleStartDownload = (item: HubModelItem) => {
    if (openConfirm) {
      openConfirm({
        title: '76 存储服务器后台下载确认',
        message: '确定要在 76 主力存储服务器后台拉取【' + item.name + '】大模型权重吗？',
        detail: 'ModelScope 模型 ID: ' + item.id + ' · 存储落盘路径: /data/AI_model/' + item.name,
        confirmText: '确认下载',
        type: 'primary',
        onConfirm: async () => {
          setDownloadingId(item.id)
          if (showToast) showToast('已向 76 存储服务器下发下载任务...', 'info')
          try {
            await fetch('/api/v1/hub/start-download', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model_id: item.id, local_dir: item.name })
            })
            if (showToast) showToast('下载进程已在 76 后台启动', 'success')
            fetchLocalAssets(true)
          } catch (e: any) {
            if (showToast) showToast('下载提交失败: ' + e.message, 'error')
          } finally {
            setDownloadingId(null)
          }
        }
      })
    }
  }

  const normalizeStrict = (s: string) => {
    if (!s) return ''
    return s.toLowerCase().trim().replace(/[-_.]/g, '')
  }

  const formatSize = (bytes: number) => {
    if (!bytes) return '未知大小'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return `${gb.toFixed(1)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const getQuantTag = (name: string, quantMethod?: string) => {
    if (quantMethod && quantMethod !== 'none') return quantMethod.toUpperCase()
    const n = name.toUpperCase()
    if (n.includes('W8A8')) return 'W8A8'
    if (n.includes('FP8')) return 'FP8'
    if (n.includes('W4A8') || n.includes('INT4')) return 'INT4'
    if (n.includes('INT8') || n.includes('W8A16')) return 'INT8'
    if (n.includes('AWQ')) return 'AWQ'
    if (n.includes('GPTQ')) return 'GPTQ'
    return null
  }

  const aggregatedAssets = useMemo(() => {
    const map = new Map<string, AggregatedModelAsset>()
    for (const item of localAssets) {
      const key = item.name.toLowerCase().trim()
      const loc = {
        server: item.server,
        server_ip: item.server_ip,
        path: item.path,
        type: item.type,
        time: item.time
      }
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: item.name,
          locations: [loc],
          hasMain: item.type === 'MAIN',
          hasArchive: item.type === 'ARCHIVE',
          isDuplicate: false,
          model_type: item.model_type,
          architectures: item.architectures,
          torch_dtype: item.torch_dtype,
          quant_method: item.quant_method,
          max_position: item.max_position
        })
      } else {
        const existing = map.get(key)!
        existing.locations.push(loc)
        if (item.type === 'MAIN') existing.hasMain = true
        if (item.type === 'ARCHIVE') existing.hasArchive = true
        if (item.model_type && !existing.model_type) existing.model_type = item.model_type
        if (item.quant_method && existing.quant_method === 'none') existing.quant_method = item.quant_method
        if (item.max_position && !existing.max_position) existing.max_position = item.max_position
      }
    }
    const results: AggregatedModelAsset[] = []
    for (const item of map.values()) {
      item.isDuplicate = item.locations.length > 1
      results.push(item)
    }
    return results.sort((a, b) => a.name.localeCompare(b.name))
  }, [localAssets])

  const duplicateCount = aggregatedAssets.filter((a) => a.isDuplicate).length
  const mainOnlyCount = aggregatedAssets.filter((a) => a.hasMain && !a.hasArchive).length
  const archiveOnlyCount = aggregatedAssets.filter((a) => !a.hasMain && a.hasArchive).length

  const filteredAggregated = useMemo(() => {
    return aggregatedAssets.filter((ast) => {
      if (localFilter === 'MAIN' && !ast.hasMain) return false
      if (localFilter === 'ARCHIVE' && !ast.hasArchive) return false
      if (localFilter === 'DUPLICATE' && !ast.isDuplicate) return false
      if (localSearch) {
        const s = localSearch.toLowerCase()
        return (
          ast.name.toLowerCase().includes(s) ||
          ast.model_type.toLowerCase().includes(s) ||
          ast.locations.some((loc) => loc.path.toLowerCase().includes(s)) ||
          (ast.architectures && ast.architectures.some((a) => a.toLowerCase().includes(s)))
        )
      }
      return true
    })
  }, [aggregatedAssets, localFilter, localSearch])

  // =========================================================================
  // 🚀 全局总进度与活跃任务统计聚合 (Global Tasks Summary)
  // =========================================================================
  const totalActiveTasksCount = downloadTasks.length + rsyncTasks.length

  const globalSummary = useMemo(() => {
    if (totalActiveTasksCount === 0) return null

    let totalPctSum = 0
    let totalItems = 0
    const speeds: string[] = []
    const etas: string[] = []

    for (const t of rsyncTasks) {
      totalPctSum += t.progress || 0
      totalItems++
      if (t.speed) speeds.push(t.speed)
      if (t.eta) etas.push(t.eta)
    }

    for (const t of downloadTasks) {
      totalPctSum += t.progress || 0
      totalItems++
      if (t.speed) speeds.push(t.speed)
      if (t.eta) etas.push(t.eta)
    }

    const overallProgress = totalItems > 0 ? Math.round(totalPctSum / totalItems) : 0

    return {
      overallProgress,
      activeRsyncCount: rsyncTasks.length,
      activeDownloadCount: downloadTasks.length,
      speedText: speeds.join(' · ') || '传输中',
      etaText: etas[0] || ''
    }
  }, [downloadTasks, rsyncTasks, totalActiveTasksCount])

  return (
    <div className="space-y-5 text-slate-200 font-sans">
      {/* 顶部概览栏 */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <h2 className="font-semibold text-base text-slate-100 flex items-center gap-2">
            <Search className="w-5 h-5 text-slate-400" /> Model Hub
          </h2>
          <p className="text-sm text-slate-400 mt-1 font-mono">
            已存模型 <span className="text-slate-200 font-semibold">{aggregatedAssets.length}</span> · 76 ({mainOnlyCount}) · 29 ({archiveOnlyCount})
            {duplicateCount > 0 && <span className="ml-2 text-slate-300">· 双端副本 ({duplicateCount})</span>}
          </p>
        </div>

        {/* 模式切换 */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-800 text-sm">
          <button
            onClick={() => setActiveTab('search')}
            className={
              'px-3.5 py-1.5 rounded-md font-medium transition flex items-center gap-2 ' +
              (activeTab === 'search'
                ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200')
            }
          >
            <Cloud className="w-4 h-4 text-slate-400" />
            <span>ModelScope 检索 ({searchResults.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('local')}
            className={
              'px-3.5 py-1.5 rounded-md font-medium transition flex items-center gap-2 ' +
              (activeTab === 'local'
                ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200')
            }
          >
            <Database className="w-4 h-4 text-slate-400" />
            <span>本地已存 ({aggregatedAssets.length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🚀 活跃分发与下载任务独立监控看板 (Individual Active Tasks Panel) */}
      {/* ========================================================================= */}
      {(rsyncTasks.length > 0 || downloadTasks.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="flex items-center gap-2 font-bold text-slate-300">
              <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
              <span>后台活跃传输任务 ({rsyncTasks.length + downloadTasks.length})</span>
            </span>
            <span>每 2.5 秒自动刷新状态</span>
          </div>

          <div className="grid grid-cols-1 gap-3 font-mono">
            {/* 独立分发任务卡片 */}
            {rsyncTasks.map((t) => (
              <div
                key={t.pid}
                className="bg-slate-900/95 border-2 border-cyan-500/50 rounded-xl p-4 shadow-lg space-y-2.5 transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[11px] font-bold flex items-center gap-1">
                      <Send className="w-3 h-3" /> 分发中
                    </span>
                    <span className="font-bold text-slate-100 text-sm">{t.model_name}</span>
                    <span className="text-slate-400 text-xs">
                      76 ➡️ <strong className="text-cyan-300">{t.target_server === '192.2.0.146' ? '146 (沐曦 16卡)' : t.target_server}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-300">
                    {t.speed && (
                      <span className="text-cyan-400 flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5" /> 速率: {t.speed}
                      </span>
                    )}
                    <button
                      onClick={() => openRsyncLogModal(t.model_name)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded border border-slate-700 flex items-center gap-1 transition cursor-pointer text-xs"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>查看日志</span>
                    </button>
                  </div>
                </div>

                {/* 独立平稳进度条 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>
                      传输进度: <strong className="text-cyan-300">{t.transferred || `进度 ${t.progress}%`}</strong> ({t.progress}%)
                    </span>
                    <span className="text-slate-500 font-mono">目标: {t.target_path}</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      style={{ width: `${Math.max(4, t.progress)}%` }}
                      className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(6,182,212,0.4)]"
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* 独立下载任务卡片 */}
            {downloadTasks.map((t) => (
              <div
                key={t.pid}
                className="bg-slate-900/95 border-2 border-amber-500/50 rounded-xl p-4 shadow-lg space-y-2.5 transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center gap-1">
                      <Download className="w-3 h-3" /> 下载中
                    </span>
                    <span className="font-bold text-slate-100 text-sm">{t.local_dir}</span>
                    <span className="text-slate-400 text-xs font-mono">{t.model_id}</span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-300">
                    {t.dir_size && (
                      <span className="text-slate-300">已下载: <strong className="text-amber-300">{t.dir_size}</strong></span>
                    )}
                    {t.speed && (
                      <span className="text-amber-400 flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5" /> 速率: {t.speed}
                      </span>
                    )}
                    <button
                      onClick={() => openLogModal(t.local_dir, t.model_id)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700 flex items-center gap-1 transition cursor-pointer text-xs"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>查看日志</span>
                    </button>
                  </div>
                </div>

                {/* 独立平稳进度条 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>
                      下载进度: <strong className="text-amber-300">{t.transferred || `进度 ${t.progress}%`}</strong> ({t.progress}%)
                    </span>
                    <span className="text-slate-500 font-mono">76 存储: /data/AI_model/{t.local_dir}</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      style={{ width: `${Math.max(4, t.progress || 10)}%` }}
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 检索模式 */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 space-y-3.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-400 mr-1 font-medium font-sans">组织:</span>
              {orgOptions.map((org) => (
                <button
                  key={org.id}
                  onClick={() => setSelectedOrg(org.id)}
                  className={
                    'px-3 py-1.5 rounded-md text-xs font-mono transition border cursor-pointer ' +
                    (selectedOrg === org.id
                      ? 'bg-slate-800 text-slate-100 border-slate-600 font-semibold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700')
                  }
                >
                  {org.name}
                </button>
              ))}
            </div>

            <form onSubmit={(e) => handleSearch(e, true)} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索模型名称（如 Qwen3.8, DeepSeek, GLM...）"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-600 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={searching}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-sm font-medium flex items-center gap-2 transition disabled:opacity-50 cursor-pointer font-sans"
              >
                <RotateCw className={'w-4 h-4 ' + (searching ? 'animate-spin' : '')} />
                <span>{searching ? '检索中...' : '检索'}</span>
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {searchResults.map((item) => {
              const cleanName = item.name.split('/').pop() || item.name
              const activeTask = downloadTasks.find(
                (t) =>
                  t.model_id === item.id ||
                  t.local_dir === item.name ||
                  normalizeStrict(t.local_dir) === normalizeStrict(item.name)
              )
              const activeRsync = rsyncTasks.find(
                (t) => t.model_name === cleanName || normalizeStrict(t.model_name) === normalizeStrict(cleanName)
              )

              return (
                <div
                  key={item.id}
                  className={
                    'bg-slate-900/80 border rounded-xl p-4 transition flex flex-col md:flex-row md:items-center justify-between gap-4 ' +
                    (activeTask
                      ? 'border-amber-700/70 bg-gradient-to-r from-slate-900 via-amber-950/15 to-slate-900'
                      : activeRsync
                      ? 'border-cyan-700/70 bg-gradient-to-r from-slate-900 via-cyan-950/15 to-slate-900'
                      : 'border-slate-800/80 hover:border-slate-700/80')
                  }
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-semibold text-slate-100 text-sm">{item.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-950 text-slate-400 border border-slate-800">
                        {item.id}
                      </span>

                      {/* 状态徽章 (包含总进度与速度) */}
                      {activeTask ? (
                        <span className="text-xs px-2.5 py-0.5 rounded font-mono bg-amber-950/90 text-amber-300 border border-amber-700/80 flex items-center gap-1.5 font-medium shadow-sm animate-pulse">
                          <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          <span>76 下载中: {activeTask.progress}% {activeTask.dir_size ? `(${activeTask.dir_size})` : ''}</span>
                        </span>
                      ) : activeRsync ? (
                        <span className="text-xs px-2.5 py-0.5 rounded font-mono bg-cyan-950/90 text-cyan-300 border border-cyan-700/80 flex items-center gap-1.5 font-medium shadow-sm animate-pulse">
                          <RotateCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                          <span>
                            分发中 · {activeRsync.target_server === '192.2.0.146' ? '146' : '55'} ({activeRsync.progress}% · {activeRsync.speed || '同步中'})
                          </span>
                        </span>
                      ) : item.local_status === 'LOCAL_76' ? (
                        <span className="text-xs px-2 py-0.5 rounded font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-1.5 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> 已存 <span className="px-1 py-0.2 rounded bg-emerald-500/20 text-[10px] font-bold text-emerald-200">76</span>
                        </span>
                      ) : item.local_status === 'LOCAL_TEST03' ? (
                        <span className="text-xs px-2 py-0.5 rounded font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 flex items-center gap-1.5 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" /> 已存 <span className="px-1 py-0.2 rounded bg-cyan-500/20 text-[10px] font-bold text-cyan-200">29</span>
                        </span>
                      ) : (
                        <span className="text-xs px-2.5 py-0.5 rounded font-mono bg-slate-950 text-slate-500 border border-slate-800/80 flex items-center gap-1.5">
                          云端未存
                        </span>
                      )}

                      {/* 量化与架构标签区分 */}
                      {(() => {
                        const qTag = getQuantTag(item.name, item.local_meta?.quant_method)
                        if (qTag) {
                          return (
                            <span className="text-xs px-2 py-0.5 rounded font-mono bg-amber-950/70 text-amber-300 border border-amber-800/80 font-medium">
                              {qTag}
                            </span>
                          )
                        }
                        return null
                      })()}

                      {item.local_meta?.architectures?.[0] && (
                        <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-950 text-slate-400 border border-slate-800/80">
                          {item.local_meta.architectures[0]}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-400 flex items-center gap-4 font-mono">
                      <span>下载: {item.downloads.toLocaleString()}</span>
                      <span>大小: {formatSize(item.file_size)}</span>
                      <span>更新: {item.updated_at ? item.updated_at.substring(0, 10) : '近期'}</span>
                    </div>

                    {/* 卡片内分发总进度条 */}
                    {activeRsync && (
                      <div className="space-y-1 pt-0.5 font-mono">
                        <div className="flex items-center justify-between text-[11px] text-cyan-300">
                          <span>
                            分发进度: <strong className="text-cyan-200">{activeRsync.transferred || `${activeRsync.progress}%`}</strong> ({activeRsync.progress}%)
                          </span>
                          <span>{activeRsync.speed && `速率: ${activeRsync.speed}`}</span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <div
                            style={{ width: `${Math.max(5, activeRsync.progress)}%` }}
                            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-300 animate-pulse"
                          />
                        </div>
                      </div>
                    )}

                    {/* 卡片内下载总进度条 */}
                    {activeTask && (
                      <div className="space-y-1 pt-0.5 font-mono">
                        <div className="flex items-center justify-between text-[11px] text-amber-300">
                          <span>
                            76 下载进度: <strong className="text-amber-200">{activeTask.transferred || `${activeTask.progress}%`}</strong> ({activeTask.progress}%)
                            {activeTask.dir_size && ` · 已下载 ${activeTask.dir_size}`}
                          </span>
                          <span>{activeTask.speed && `速率: ${activeTask.speed}`}</span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <div
                            style={{ width: `${Math.max(5, activeTask.progress)}%` }}
                            className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-300 animate-pulse"
                          />
                        </div>
                      </div>
                    )}

                    {/* 路径与实时输出条 */}
                    {activeTask ? (
                      <div
                        onClick={() => openLogModal(activeTask.local_dir, item.name)}
                        className="text-xs font-mono bg-amber-950/30 border border-amber-800/60 px-2.5 py-1.5 rounded text-amber-300/90 truncate cursor-pointer hover:bg-amber-950/50 hover:border-amber-700 transition flex items-center justify-between gap-2"
                        title="点击查看 76 存储下载实时终端日志"
                      >
                        <span className="truncate flex-1 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
                          <span className="truncate">{activeTask.last_log || `落盘路径: /data/AI_model/${activeTask.local_dir}`}</span>
                        </span>
                        <span className="text-[11px] text-amber-400 font-sans font-medium underline shrink-0 flex items-center gap-1">
                          <Terminal className="w-3 h-3" /> 查看日志
                        </span>
                      </div>
                    ) : activeRsync ? (
                      <div
                        onClick={() => openRsyncLogModal(activeRsync.model_name)}
                        className="text-xs font-mono bg-cyan-950/30 border border-cyan-800/60 px-2.5 py-1.5 rounded text-cyan-300/90 truncate cursor-pointer hover:bg-cyan-950/50 hover:border-cyan-700 transition flex items-center justify-between gap-2"
                        title="点击查看分发实时传输日志"
                      >
                        <span className="truncate flex-1 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0 animate-pulse" />
                          <span className="truncate">{activeRsync.last_log || `正在分发至 ${activeRsync.target_server}:${activeRsync.target_path}`}</span>
                        </span>
                        <span className="text-[11px] text-cyan-400 font-sans font-medium underline shrink-0 flex items-center gap-1">
                          <Terminal className="w-3 h-3" /> 传输日志
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs font-mono bg-slate-950/80 px-2.5 py-1.5 rounded text-slate-400 truncate border border-slate-900">
                        {item.local_status === 'LOCAL_76' ? (
                          <span>76 路径: {item.local_path}</span>
                        ) : item.local_status === 'LOCAL_TEST03' ? (
                          <span>test03 路径: {item.local_path}</span>
                        ) : (
                          <span>{item.download_cmd}</span>
                        )}
                      </div>
                    )}
                  </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {activeTask ? (
                        <>
                          <button
                            onClick={() => openLogModal(activeTask.local_dir, item.name)}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-md shadow-amber-900/30 transition animate-pulse cursor-pointer"
                          >
                            <RotateCw className="w-4 h-4 animate-spin text-slate-950" />
                            <span>下载中 ({activeTask.progress}%)</span>
                          </button>
                          <button
                            onClick={() => openLogModal(activeTask.local_dir, item.name)}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
                            title="查看实时下载日志"
                          >
                            <Terminal className="w-4 h-4" />
                          </button>
                        </>
                      ) : activeRsync ? (
                        <>
                          <button
                            onClick={() => openRsyncLogModal(activeRsync.model_name)}
                            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-md shadow-cyan-900/30 transition animate-pulse cursor-pointer"
                          >
                            <RotateCw className="w-4 h-4 animate-spin text-slate-950" />
                            <span>分发中 ({activeRsync.progress}%)</span>
                          </button>
                          <button
                            onClick={() => openRsyncLogModal(activeRsync.model_name)}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
                            title="查看实时传输日志"
                          >
                            <Terminal className="w-4 h-4" />
                          </button>
                        </>
                      ) : (item.local_status === 'LOCAL_76' || item.local_status === 'LOCAL_TEST03') ? (
                        <>
                          <button
                            onClick={() => openDistributeModal(item)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-900/20"
                            title="一键将本地模型分发到 146 或 55 算力机"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>分发到算力机</span>
                          </button>
                          <button
                            onClick={() => handleCopy(item.local_path || (item.local_status === 'LOCAL_76' ? `/data/AI_model/${item.name}` : `/HDD_Raid/SVN_MODEL_REPO/Model/${item.name}`), item.id)}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-slate-700 transition cursor-pointer"
                            title={item.local_status === 'LOCAL_76' ? '复制 76 存储路径' : '复制 29 存储路径'}
                          >
                            {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartDownload(item)}
                            disabled={downloadingId === item.id}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>76 下载</span>
                          </button>
                          <button
                            onClick={() => handleCopy(item.download_cmd, item.id)}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-slate-700 transition cursor-pointer"
                            title="复制下载命令"
                          >
                            {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </>
                      )}
                    </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 本地已存模式 */}
      {activeTab === 'local' && (
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium font-sans">筛选:</span>
              <button
                onClick={() => setLocalFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition border cursor-pointer ${
                  localFilter === 'ALL'
                    ? 'bg-slate-800 text-slate-100 border-slate-600 font-semibold'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                全部 ({aggregatedAssets.length})
              </button>
              <button
                onClick={() => setLocalFilter('MAIN')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition border cursor-pointer ${
                  localFilter === 'MAIN'
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600 font-semibold'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                76 主力 ({mainOnlyCount})
              </button>
              <button
                onClick={() => setLocalFilter('ARCHIVE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition border cursor-pointer ${
                  localFilter === 'ARCHIVE'
                    ? 'bg-slate-800 text-slate-200 border-slate-600 font-semibold'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                29 存档 ({archiveOnlyCount})
              </button>
              {duplicateCount > 0 && (
                <button
                  onClick={() => setLocalFilter('DUPLICATE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition border cursor-pointer ${
                    localFilter === 'DUPLICATE'
                      ? 'bg-amber-950/80 text-amber-300 border-amber-600 font-semibold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  双端副本 ({duplicateCount})
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 flex-1 max-w-xs">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  placeholder="过滤本地模型..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-600 font-mono"
                />
              </div>
              <button
                onClick={() => fetchLocalAssets(true)}
                disabled={loadingLocal}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition cursor-pointer"
                title="重新深度扫描存储"
              >
                <RotateCw className={`w-3.5 h-3.5 ${loadingLocal ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {filteredAggregated.map((ast, idx) => {
              const activeRsync = rsyncTasks.find(
                (t) => t.model_name === ast.name || normalizeStrict(t.model_name) === normalizeStrict(ast.name)
              )

              return (
                <div
                  key={ast.key}
                  className={`bg-slate-900/80 border rounded-xl p-4 transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    activeRsync
                      ? 'border-cyan-700/70 bg-gradient-to-r from-slate-900 via-cyan-950/15 to-slate-900'
                      : 'border-slate-800/80 hover:border-slate-700/80'
                  }`}
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-semibold text-slate-100 text-sm">{ast.name}</span>

                      {/* 存储分布徽章 (统一为已存 + 机器标签) */}
                      {ast.hasMain && (
                        <span className="text-xs px-2 py-0.5 rounded font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-1 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 已存 <strong className="text-emerald-200">76</strong>
                        </span>
                      )}
                      {ast.hasArchive && (
                        <span className="text-xs px-2 py-0.5 rounded font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 flex items-center gap-1 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> 已存 <strong className="text-cyan-200">29</strong>
                        </span>
                      )}

                      {/* 量化与架构 */}
                      {(() => {
                        const qTag = getQuantTag(ast.name, ast.quant_method)
                        if (qTag) {
                          return (
                            <span className="text-xs px-2 py-0.5 rounded font-mono bg-amber-950/70 text-amber-300 border border-amber-800/80 font-medium">
                              {qTag}
                            </span>
                          )
                        }
                        return null
                      })()}

                      {ast.model_type && (
                        <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-950 text-slate-400 border border-slate-800">
                          {ast.model_type}
                        </span>
                      )}

                      {/* 分发中动态徽章 */}
                      {activeRsync && (
                        <span className="text-xs px-2.5 py-0.5 rounded font-mono bg-cyan-950/90 text-cyan-300 border border-cyan-700/80 flex items-center gap-1.5 font-medium shadow-sm animate-pulse">
                          <RotateCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                          <span>分发中 · {activeRsync.progress}% ({activeRsync.speed || '同步中'})</span>
                        </span>
                      )}
                    </div>

                    {/* 卡片内分发总进度条 */}
                    {activeRsync && (
                      <div className="space-y-1 pt-0.5 font-mono">
                        <div className="flex items-center justify-between text-[11px] text-cyan-300">
                          <span>
                            分发进度: <strong className="text-cyan-200">{activeRsync.transferred || `${activeRsync.progress}%`}</strong> ({activeRsync.progress}%)
                          </span>
                          <span>{activeRsync.speed && `速率: ${activeRsync.speed}`}</span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <div
                            style={{ width: `${Math.max(5, activeRsync.progress)}%` }}
                            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-300 animate-pulse"
                          />
                        </div>
                      </div>
                    )}

                    {/* 物理存储路径列表 */}
                    <div className="space-y-1 text-xs font-mono">
                      {ast.locations.map((loc, lIdx) => (
                        <div key={lIdx} className="bg-slate-950/80 px-2.5 py-1.5 rounded text-slate-400 flex items-center justify-between gap-2 border border-slate-900">
                          <span className="truncate">
                            <strong className="text-slate-300">{loc.server_ip}:</strong> {loc.path}
                          </span>
                          <span className="text-slate-500 text-[11px] shrink-0">{loc.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {activeRsync ? (
                      <button
                        onClick={() => openRsyncLogModal(activeRsync.model_name)}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-md shadow-cyan-900/30 transition animate-pulse cursor-pointer"
                      >
                        <RotateCw className="w-4 h-4 animate-spin text-slate-950" />
                        <span>分发中 ({activeRsync.progress}%)</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => openDistributeModal({ name: ast.name, path: ast.locations[0]?.path, server_ip: ast.locations[0]?.server_ip })}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md flex items-center gap-1.5 transition cursor-pointer font-sans"
                        title="一键将模型权重分发到 146 或 55 算力机"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>分发到算力机</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 一键分发确认与节点选择模态框 */}
      {distributeModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center">
                  <Send className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">大模型算力机后台一键分发</h3>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">模型: {distributeModal.name}</p>
                </div>
              </div>
              <button onClick={() => setDistributeModal(null)} className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="text-slate-400 font-sans font-medium">源存储位置:</label>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 break-all">
                  {distributeModal.sourceServer}:{distributeModal.sourcePath}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-slate-400 font-sans font-medium">选择目标算力节点:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setDistributeModal((prev) =>
                        prev ? { ...prev, targetServer: '192.2.0.146', targetPath: `/data/model/${prev.name}` } : null
                      )
                    }
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1 cursor-pointer ${
                      distributeModal.targetServer === '192.2.0.146'
                        ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold font-sans text-xs flex items-center justify-between">
                      <span>146 · 沐曦 16卡</span>
                      {distributeModal.targetServer === '192.2.0.146' && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                    </div>
                    <span className="text-[11px] text-slate-400">192.2.0.146 (免密就绪)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setDistributeModal((prev) =>
                        prev ? { ...prev, targetServer: '192.7.9.55', targetPath: `/data/model/${prev.name}` } : null
                      )
                    }
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-1 cursor-pointer ${
                      distributeModal.targetServer === '192.7.9.55'
                        ? 'bg-indigo-950/60 border-indigo-600 text-indigo-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold font-sans text-xs flex items-center justify-between">
                      <span>55 · 海光 8卡</span>
                      {distributeModal.targetServer === '192.7.9.55' && <span className="w-2 h-2 rounded-full bg-indigo-400" />}
                    </div>
                    <span className="text-[11px] text-slate-400">192.7.9.55 (免密就绪)</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 font-sans font-medium">目标落盘路径:</label>
                <input
                  type="text"
                  value={distributeModal.targetPath}
                  onChange={(e) => setDistributeModal((prev) => (prev ? { ...prev, targetPath: e.target.value } : null))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-600 font-mono text-xs"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 font-sans">
                💡 说明：分发采用带 <span className="text-slate-200 font-mono">--info=progress2</span> 的原子断点续传并在 76 存储服务器后台运行，提供全局总进度与 ETA，不占用本机与 WSL 流量。
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-end gap-3 font-sans">
              <button
                onClick={() => setDistributeModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDistribute}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md flex items-center gap-1.5 transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>立即启动后台分发</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分发实时传输日志模态框 */}
      {rsyncLogModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    76 存储服务器分发实时传输日志 · <span className="text-cyan-300 font-mono">{rsyncLogModal.name}</span>
                  </h3>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    日志文件: /tmp/rsync_{rsyncLogModal.name}.log
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openRsyncLogModal(rsyncLogModal.name)}
                  disabled={rsyncLogModal.loading}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  title="手动刷新传输日志"
                >
                  <RotateCw className={'w-3.5 h-3.5 ' + (rsyncLogModal.loading ? 'animate-spin' : '')} />
                  <span>刷新</span>
                </button>
                <button
                  onClick={() => handleCopy(rsyncLogModal.logs, 'rsync_modal_log')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  {copiedId === 'rsync_modal_log' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>复制日志</span>
                </button>
                <button
                  onClick={() => setRsyncLogModal(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg bg-slate-800 hover:bg-slate-700 transition ml-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 bg-black overflow-y-auto font-mono text-xs text-cyan-400/90 whitespace-pre-wrap leading-relaxed select-text min-h-[350px] max-h-[550px]">
              {rsyncLogModal.logs || '等待分发传输输出...'}
            </div>

            <div className="px-5 py-3 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span>每 2.5 秒自动同步分发传输总进度 (--info=progress2)</span>
              </span>
              <button
                onClick={() => setRsyncLogModal(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition cursor-pointer font-sans"
              >
                关闭窗口
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 实时下载终端日志模态框 */}
      {logModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-950/80 border border-amber-800/80 flex items-center justify-center">
                  <Terminal className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    76 存储服务器实时下载日志 · <span className="text-amber-300 font-mono">{logModal.name}</span>
                  </h3>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    落盘路径: /data/AI_model/{logModal.dir} · 日志: /tmp/download_{logModal.dir}.log
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openLogModal(logModal.dir, logModal.name)}
                  disabled={logModal.loading}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  title="手动刷新日志"
                >
                  <RotateCw className={'w-3.5 h-3.5 ' + (logModal.loading ? 'animate-spin' : '')} />
                  <span>刷新</span>
                </button>
                <button
                  onClick={() => handleCopy(logModal.logs, 'modal_log')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                >
                  {copiedId === 'modal_log' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>复制日志</span>
                </button>
                <button
                  onClick={() => setLogModal(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg bg-slate-800 hover:bg-slate-700 transition ml-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 bg-black overflow-y-auto font-mono text-xs text-emerald-400/90 whitespace-pre-wrap leading-relaxed select-text min-h-[350px] max-h-[550px]">
              {logModal.logs || '等待 76 存储服务器下载输出...'}
            </div>

            <div className="px-5 py-3 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>每 2.5 秒自动同步 76 存储日志</span>
              </span>
              <button
                onClick={() => setLogModal(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition cursor-pointer font-sans"
              >
                关闭窗口
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
