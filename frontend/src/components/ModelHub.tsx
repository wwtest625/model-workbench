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
import { LocalAsset, AggregatedModelAsset, HubModelItem, DistributeModalState, LogModalState, RsyncLogModalState } from './hub/types'
import { normalizeStrict, getQuantTag } from './hub/utils'
import { TaskBoardPanel } from './hub/TaskBoardPanel'
import { SearchResultsList } from './hub/SearchResultsList'
import { LocalAssetsList } from './hub/LocalAssetsList'
import { DistributeModal } from './hub/DistributeModal'
import { RsyncLogModal } from './hub/RsyncLogModal'
import { LogModal } from './hub/LogModal'

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

  const [customOrgs, setCustomOrgs] = useState<string[]>([])
  const [showAddOrg, setShowAddOrg] = useState(false)
  const [newOrgInput, setNewOrgInput] = useState('')

  const defaultOrgOptions = [
    { id: 'metax-tech', name: 'metax-tech (沐曦)' },
    { id: 'Qwen', name: 'Qwen' },
    { id: 'deepseek-ai', name: 'deepseek-ai' },
    { id: 'ZhipuAI', name: 'ZhipuAI' },
    { id: 'MiniMax', name: 'MiniMax' },
    { id: '01-ai', name: '01-ai' },
    { id: 'OTHER', name: '🌐 全网 / Other' }
  ]

  const orgOptions = useMemo(() => {
    const list = [...defaultOrgOptions]
    for (const c of customOrgs) {
      if (!list.some((o) => o.id.toLowerCase() === c.toLowerCase())) {
        list.splice(list.length - 1, 0, { id: c, name: c })
      }
    }
    return list
  }, [customOrgs])

  const handleAddCustomOrg = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newOrgInput.trim()
    if (!trimmed) return
    if (!customOrgs.includes(trimmed)) {
      setCustomOrgs((prev) => [...prev, trimmed])
    }
    setSelectedOrg(trimmed)
    setNewOrgInput('')
    setShowAddOrg(false)
  }

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

  const formatSize = (bytes: number) => {
    if (!bytes) return '未知大小'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return `${gb.toFixed(1)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
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
      <TaskBoardPanel
        rsyncTasks={rsyncTasks}
        downloadTasks={downloadTasks}
        openLogModal={openLogModal}
        openRsyncLogModal={openRsyncLogModal}
      />
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
                    'px-3 py-1.5 rounded-md text-xs font-mono transition border cursor-pointer flex items-center gap-1 ' +
                    (selectedOrg === org.id
                      ? org.id === 'OTHER'
                        ? 'bg-indigo-950/80 text-indigo-200 border-indigo-500/80 font-semibold shadow-sm'
                        : 'bg-slate-800 text-slate-100 border-slate-600 font-semibold'
                      : org.id === 'OTHER'
                      ? 'bg-slate-950 text-indigo-300/80 border-indigo-950/60 hover:text-indigo-200 hover:border-indigo-800'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700')
                  }
                >
                  {org.name}
                </button>
              ))}

              {showAddOrg ? (
                <form onSubmit={handleAddCustomOrg} className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newOrgInput}
                    onChange={(e) => setNewOrgInput(e.target.value)}
                    placeholder="输入 ModelScope 组织/作者名..."
                    autoFocus
                    className="px-2.5 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 w-44"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 bg-cyan-700 hover:bg-cyan-600 text-slate-100 rounded text-xs font-medium cursor-pointer"
                  >
                    确定
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddOrg(false)}
                    className="px-1.5 py-1 text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
                  >
                    取消
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddOrg(true)}
                  className="px-2.5 py-1.5 rounded-md text-xs font-mono transition border border-dashed border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 bg-slate-950/50 cursor-pointer"
                >
                  + 自定义组织
                </button>
              )}
            </div>

            <form onSubmit={(e) => handleSearch(e, true)} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    selectedOrg === 'OTHER'
                      ? '全网关键词检索（支持任意组织、作者或模型，如 internlm, baichuan, 01-ai, bge, llama...）'
                      : `搜索 ${selectedOrg} 下的模型名称（留空按回车刷新全部）...`
                  }
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
            <SearchResultsList
              searchResults={searchResults}
              downloadTasks={downloadTasks}
              rsyncTasks={rsyncTasks}
              copiedId={copiedId}
              downloadingId={downloadingId}
              openLogModal={openLogModal}
              openRsyncLogModal={openRsyncLogModal}
              openDistributeModal={openDistributeModal}
              handleStartDownload={handleStartDownload}
              handleCopy={handleCopy}
            />
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
            <LocalAssetsList
              filteredAggregated={filteredAggregated}
              rsyncTasks={rsyncTasks}
              openRsyncLogModal={openRsyncLogModal}
              openDistributeModal={openDistributeModal}
            />
          </div>
        </div>
      )}

      {/* 一键分发确认与节点选择模态框 */}
      <DistributeModal
        distributeModal={distributeModal}
        setDistributeModal={setDistributeModal}
        handleConfirmDistribute={handleConfirmDistribute}
      />
      {/* 分发实时传输日志模态框 */}
      <RsyncLogModal
        rsyncLogModal={rsyncLogModal}
        setRsyncLogModal={setRsyncLogModal}
        openRsyncLogModal={openRsyncLogModal}
        handleCopy={handleCopy}
        copiedId={copiedId}
      />
      {/* 实时下载终端日志模态框 */}
      <LogModal
        logModal={logModal}
        setLogModal={setLogModal}
        openLogModal={openLogModal}
        handleCopy={handleCopy}
        copiedId={copiedId}
      />
    </div>
  )
}
