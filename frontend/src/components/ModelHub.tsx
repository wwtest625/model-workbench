import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Search, Download, Copy, Check, HardDrive, Cloud, Server, CheckCircle2, RotateCw, ExternalLink, Database, AlertTriangle } from 'lucide-react'

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

export const ModelHub: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'local'>('search')
  const [localFilter, setLocalFilter] = useState<'ALL' | 'MAIN' | 'ARCHIVE' | 'DUPLICATE'>('ALL')
  const [localSearch, setLocalSearch] = useState('')
  const [query, setQuery] = useState('')
  const [selectedOrg, setSelectedOrg] = useState('metax-tech')
  const [searching, setSearching] = useState(false)
  const [loadingLocal, setLoadingLocal] = useState(false)
  
  const [localAssets, setLocalAssets] = useState<LocalAsset[]>([])
  const [searchResults, setSearchResults] = useState<HubModelItem[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const orgCacheRef = useRef<{ [org: string]: HubModelItem[] }>({})
  const localLoadedRef = useRef(false)

  const orgOptions = [
    { id: 'metax-tech', name: '⭐ metax-tech (沐曦官方适配)', desc: '官方量化/Maca 专享' },
    { id: 'Qwen', name: 'Qwen (通义千问官方)', desc: '阿里云 Qwen 原生' },
    { id: 'deepseek-ai', name: 'deepseek-ai (深度求索)', desc: 'DeepSeek 官方' },
    { id: 'ZhipuAI', name: 'ZhipuAI (智谱)', desc: 'GLM 官方' },
    { id: 'MiniMax', name: 'MiniMax (名之梦)', desc: 'MiniMax 官方' },
  ]

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
    setTimeout(() => setCopiedId(null), 2500)
  }

  const handleStartDownload = async (item: HubModelItem) => {
    if (!confirm('确定要在 76 存储服务器后台启动下载【' + item.name + '】吗？\n将存入 /data/AI_model/' + item.name)) return
    setDownloadingId(item.id)
    try {
      const res = await fetch('/api/v1/hub/start-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: item.id, local_dir: item.name })
      })
      const data = await res.json()
      alert(data.message || '已提交下载任务！')
      fetchLocalAssets(true)
    } catch (e: any) {
      alert('提交下载失败: ' + e.message)
    } finally {
      setDownloadingId(null)
    }
  }

  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '未知大小'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return gb.toFixed(1) + ' GB'
    const mb = bytes / (1024 * 1024)
    return mb.toFixed(1) + ' MB'
  }

  const formatContextLen = (len: number) => {
    if (!len || len <= 0) return ''
    if (len >= 1048576) return (len / 1024 / 1024).toFixed(0) + 'M 上下文'
    if (len >= 1024) return (len / 1024).toFixed(0) + 'K 上下文'
    return len + ' 上下文'
  }

  // 🌟 功能 1：多副本聚合算法 (将 76 和 test03 上的同名模型合并为单个资产条目)
  const aggregatedAssets = useMemo<AggregatedModelAsset[]>(() => {
    const map = new Map<string, AggregatedModelAsset>()

    localAssets.forEach((ast) => {
      // 提取核心名字做聚合 key (例如 Qwen3.8-27B)
      const baseName = ast.name.split('/').pop() || ast.name
      const normKey = baseName.toLowerCase().replace(/[-_.]/g, '')

      if (!map.has(normKey)) {
        map.set(normKey, {
          key: normKey,
          name: baseName,
          locations: [],
          hasMain: false,
          hasArchive: false,
          isDuplicate: false,
          model_type: ast.model_type,
          architectures: ast.architectures || [],
          torch_dtype: ast.torch_dtype,
          quant_method: ast.quant_method,
          max_position: ast.max_position,
        })
      }

      const item = map.get(normKey)!
      item.locations.push({
        server: ast.server,
        server_ip: ast.server_ip,
        path: ast.path,
        type: ast.type,
        time: ast.time,
      })

      if (ast.type === 'MAIN') item.hasMain = true
      if (ast.type === 'ARCHIVE') item.hasArchive = true
      if (!item.architectures.length && ast.architectures?.length) item.architectures = ast.architectures
      if (!item.model_type && ast.model_type) item.model_type = ast.model_type
      if (item.quant_method === 'none' && ast.quant_method !== 'none') item.quant_method = ast.quant_method
      if (!item.max_position && ast.max_position) item.max_position = ast.max_position
    })

    // 标记跨机重复副本
    map.forEach((item) => {
      item.isDuplicate = item.hasMain && item.hasArchive
    })

    return Array.from(map.values())
  }, [localAssets])

  // 统计信息
  const duplicateCount = useMemo(() => aggregatedAssets.filter((a) => a.isDuplicate).length, [aggregatedAssets])
  const mainOnlyCount = useMemo(() => aggregatedAssets.filter((a) => a.hasMain).length, [aggregatedAssets])
  const archiveOnlyCount = useMemo(() => aggregatedAssets.filter((a) => a.hasArchive).length, [aggregatedAssets])

  // 🌟 功能 3：筛选与关键词过滤 (支持一键筛选「跨机重复副本」)
  const filteredAggregatedAssets = useMemo(() => {
    return aggregatedAssets.filter((ast) => {
      if (localFilter === 'MAIN' && !ast.hasMain) return false
      if (localFilter === 'ARCHIVE' && !ast.hasArchive) return false
      if (localFilter === 'DUPLICATE' && !ast.isDuplicate) return false

      if (localSearch.trim()) {
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

  return (
    <div className="space-y-6">
      {/* 顶部二级导航与快捷概览 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-indigo-400" /> 模型检索与存储中心 (多副本智能聚合 · 跨机重复检测)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            聚合 <strong className="text-indigo-300">{aggregatedAssets.length}</strong> 个唯一模型资产 ·{' '}
            <strong className="text-emerald-400">76 主力</strong> ({mainOnlyCount}) ·{' '}
            <strong className="text-amber-400">test03 历史</strong> ({archiveOnlyCount})
            {duplicateCount > 0 && (
              <span className="ml-2 text-amber-300 font-semibold">
                · ⚠️ 发现 {duplicateCount} 个跨机重复副本
              </span>
            )}
          </p>
        </div>

        {/* 模式切换 */}
        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('search')}
            className={'px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ' + (activeTab === 'search' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200')}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>全网与官方检索 ({searchResults.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('local')}
            className={'px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ' + (activeTab === 'local' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200')}
          >
            <Database className="w-3.5 h-3.5" />
            <span>本地已存模型 ({aggregatedAssets.length})</span>
          </button>
        </div>
      </div>

      {/* 检索模式 */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 font-medium mr-1">推荐组织:</span>
              {orgOptions.map((org) => (
                <button
                  key={org.id}
                  onClick={() => setSelectedOrg(org.id)}
                  className={'px-2.5 py-1 rounded-lg text-xs font-mono transition border ' + (selectedOrg === org.id ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500 font-semibold' : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700')}
                  title={org.desc}
                >
                  {org.name}
                </button>
              ))}
            </div>

            <form onSubmit={(e) => handleSearch(e, true)} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索模型名称（例如: Qwen3.8, DeepSeek, GLM, MiniMax）..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={searching}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm transition"
              >
                <RotateCw className={'w-3.5 h-3.5 ' + (searching ? 'animate-spin' : '')} />
                <span>{searching ? '正在检索...' : '检索 ModelScope'}</span>
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {searchResults.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-100 text-sm">{item.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-slate-950 text-indigo-400 border border-slate-800">
                      {item.id}
                    </span>

                    {item.local_status === 'LOCAL_76' && (
                      <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> 76 主力已就绪 (无需下载)
                      </span>
                    )}
                    {item.local_status === 'LOCAL_TEST03' && (
                      <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1 font-semibold">
                        <HardDrive className="w-3 h-3" /> test03 历史已存档 (直接分发，无需下载)
                      </span>
                    )}
                    {item.local_status === 'CLOUD_ONLY' && (
                      <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                        <Cloud className="w-3 h-3" /> 云端未下载
                      </span>
                    )}

                    {item.local_meta && (
                      <>
                        {item.local_meta.architectures?.[0] && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                            {item.local_meta.architectures[0]}
                          </span>
                        )}
                        {item.local_meta.quant_method !== 'none' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            {item.local_meta.quant_method}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 flex items-center gap-4 font-mono">
                    <span>下载量: <strong className="text-slate-200">{item.downloads.toLocaleString()}</strong></span>
                    <span>云端大小: <strong className="text-indigo-300">{formatSize(item.file_size)}</strong></span>
                    <span>更新时间: {item.updated_at ? item.updated_at.substring(0, 10) : '近期'}</span>
                  </div>

                  <div className="text-[11px] font-mono bg-slate-950 p-2 rounded text-slate-400 truncate">
                    {item.local_status === 'LOCAL_76' ? (
                      <span className="text-emerald-400 font-semibold">76 路径: {item.local_path}</span>
                    ) : item.local_status === 'LOCAL_TEST03' ? (
                      <span className="text-amber-400 font-semibold">test03 路径: {item.local_path}</span>
                    ) : (
                      <span className="text-slate-400">{item.download_cmd}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.local_status === 'LOCAL_76' ? (
                    <button
                      onClick={() => handleCopy(item.rsync_cmd, item.id + '_rsync')}
                      className="px-3.5 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                    >
                      {copiedId === item.id + '_rsync' ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === item.id + '_rsync' ? '已复制分发命令' : '复制从 76 分发至 146'}</span>
                    </button>
                  ) : item.local_status === 'LOCAL_TEST03' ? (
                    <button
                      onClick={() => handleCopy(item.rsync_cmd, item.id + '_rsync')}
                      className="px-3.5 py-1.5 bg-amber-600/80 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                    >
                      {copiedId === item.id + '_rsync' ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === item.id + '_rsync' ? '已复制分发命令' : '复制从 test03 分发至 146'}</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleCopy(item.download_cmd, item.id)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition"
                      >
                        {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedId === item.id ? '已复制下载命令' : '复制 76 下载命令'}</span>
                      </button>

                      <button
                        onClick={() => handleStartDownload(item)}
                        disabled={downloadingId === item.id}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                      >
                        <Download className={'w-3.5 h-3.5 ' + (downloadingId === item.id ? 'animate-spin' : '')} />
                        <span>一键在 76 下载</span>
                      </button>
                    </>
                  )}

                  <a
                    href={'https://modelscope.cn/models/' + item.id}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-slate-400 hover:text-slate-200 rounded bg-slate-950 border border-slate-800"
                    title="在 ModelScope 页面打开"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🌟 本地存储资产一览 (多副本聚合 + 跨机重复检测) */}
      {activeTab === 'local' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            {/* 过滤器：支持查看全部、76、test03 以及 跨机重复副本 */}
            <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setLocalFilter('ALL')}
                className={'px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ' + (localFilter === 'ALL' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200')}
              >
                <span>全部聚合模型 ({aggregatedAssets.length})</span>
              </button>
              <button
                onClick={() => setLocalFilter('MAIN')}
                className={'px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ' + (localFilter === 'MAIN' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200')}
              >
                <Server className="w-3.5 h-3.5" />
                <span>在 76 主力 ({mainOnlyCount})</span>
              </button>
              <button
                onClick={() => setLocalFilter('ARCHIVE')}
                className={'px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ' + (localFilter === 'ARCHIVE' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200')}
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>在 test03 历史 ({archiveOnlyCount})</span>
              </button>
              
              {/* 🌟 功能 3：跨机重复副本筛选器 */}
              <button
                onClick={() => setLocalFilter('DUPLICATE')}
                className={'px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ' + (localFilter === 'DUPLICATE' ? 'bg-rose-600 text-white shadow-sm font-semibold' : duplicateCount > 0 ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30' : 'text-slate-500 hover:text-slate-300')}
                title="查看同时存在于 76 和 test03 产生重复占用的模型"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>⚠️ 跨机重复副本 ({duplicateCount})</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  placeholder="过滤模型名称/架构..."
                  className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono w-48"
                />
              </div>

              <button
                onClick={() => fetchLocalAssets(true)}
                disabled={loadingLocal}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1.5 border border-slate-700 transition"
              >
                <RotateCw className={'w-3.5 h-3.5 ' + (loadingLocal ? 'animate-spin' : '')} />
                <span>{loadingLocal ? '正在扫描...' : '强制刷新'}</span>
              </button>
            </div>
          </div>

          {/* 🌟 功能 1：聚合模型资产卡片网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredAggregatedAssets.map((ast, idx) => {
              // 默认优选 76 分发，没有 76 则从 test03 分发
              const preferredLoc = ast.locations.find((l) => l.type === 'MAIN') || ast.locations[0]
              const rsyncCmd = 'xssh ' + preferredLoc.server_ip + ' "rsync -avP --progress ' + preferredLoc.path + '/ 192.2.0.146:/data/model/' + ast.name + '/"'

              return (
                <div
                  key={idx}
                  className={'bg-slate-900 border rounded-xl p-4 space-y-3 flex flex-col justify-between transition ' + (ast.isDuplicate ? 'border-amber-500/40 bg-amber-950/10 hover:border-amber-500/70' : 'border-slate-800 hover:border-slate-700')}
                >
                  <div>
                    {/* 卡片头部与副本状态 */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-bold text-slate-100 text-xs font-mono break-all leading-tight">
                        {ast.name}
                      </h4>

                      {/* 聚合副本徽章 */}
                      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                        {ast.isDuplicate ? (
                          <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-400" /> 双机多副本 (76 + test03)
                          </span>
                        ) : ast.hasMain ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            76 (主力存储)
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            test03 (历史仓库)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 身份凭证栏 */}
                    <div className="bg-slate-950/90 rounded-lg p-2.5 text-[11px] font-mono text-slate-400 space-y-1.5 border border-slate-800/80">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">模型架构:</span>
                        <span className="text-indigo-300 font-semibold">{ast.architectures?.[0] || ast.model_type || '通用'}</span>
                      </div>
                      {ast.quant_method !== 'none' && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">量化方式:</span>
                          <span className="text-purple-300 font-semibold">{ast.quant_method}</span>
                        </div>
                      )}
                      {ast.torch_dtype && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">权重精度:</span>
                          <span className="text-slate-300">{ast.torch_dtype}</span>
                        </div>
                      )}
                      {ast.max_position > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">上下文上限:</span>
                          <span className="text-cyan-400">{formatContextLen(ast.max_position)}</span>
                        </div>
                      )}
                    </div>

                    {/* 物理存储路径列表 (包含全部副本) */}
                    <div className="mt-2.5 space-y-1 font-mono text-[10.5px]">
                      {ast.locations.map((loc, lIdx) => (
                        <div key={lIdx} className="flex items-center gap-1.5 text-slate-400 truncate" title={loc.path}>
                          <span className={'px-1 py-0.2 rounded text-[9px] font-bold ' + (loc.type === 'MAIN' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/50 text-amber-300')}>
                            {loc.type === 'MAIN' ? '76' : '03'}
                          </span>
                          <span className="truncate text-slate-400">{loc.path}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 底部操作区 */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span>{ast.locations[0]?.time || '近期'}</span>
                    <button
                      onClick={() => handleCopy(rsyncCmd, 'loc_' + idx)}
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                    >
                      {copiedId === 'loc_' + idx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === 'loc_' + idx ? '已复制分发' : ast.isDuplicate ? '复制分发 (优选76)' : '复制分发命令'}</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
