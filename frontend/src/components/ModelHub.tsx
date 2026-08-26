import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Search, Download, Copy, Check, HardDrive, Cloud, Server, RotateCw, ExternalLink, Database, AlertCircle } from 'lucide-react'

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
    { id: 'metax-tech', name: 'metax-tech' },
    { id: 'Qwen', name: 'Qwen' },
    { id: 'deepseek-ai', name: 'deepseek-ai' },
    { id: 'ZhipuAI', name: 'ZhipuAI' },
    { id: 'MiniMax', name: 'MiniMax' },
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
    if (!confirm('确定要在 76 存储后台下载【' + item.name + '】吗？\n目标路径: /data/AI_model/' + item.name)) return
    setDownloadingId(item.id)
    try {
      const res = await fetch('/api/v1/hub/start-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: item.id, local_dir: item.name })
      })
      const data = await res.json()
      alert(data.message || '下载任务已提交')
      fetchLocalAssets(true)
    } catch (e: any) {
      alert('提交失败: ' + e.message)
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
    if (len >= 1048576) return (len / 1024 / 1024).toFixed(0) + 'M ctx'
    if (len >= 1024) return (len / 1024).toFixed(0) + 'K ctx'
    return len + ' ctx'
  }

  // 多副本聚合
  const aggregatedAssets = useMemo<AggregatedModelAsset[]>(() => {
    const map = new Map<string, AggregatedModelAsset>()

    localAssets.forEach((ast) => {
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

    map.forEach((item) => {
      item.isDuplicate = item.hasMain && item.hasArchive
    })

    return Array.from(map.values())
  }, [localAssets])

  const duplicateCount = useMemo(() => aggregatedAssets.filter((a) => a.isDuplicate).length, [aggregatedAssets])
  const mainOnlyCount = useMemo(() => aggregatedAssets.filter((a) => a.hasMain).length, [aggregatedAssets])
  const archiveOnlyCount = useMemo(() => aggregatedAssets.filter((a) => a.hasArchive).length, [aggregatedAssets])

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
    <div className="space-y-5 text-slate-200">
      {/* 顶部概览栏 (字号提升至 text-base / text-sm) */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-base text-slate-100 flex items-center gap-2">
            <Search className="w-5 h-5 text-slate-400" /> Model Hub
          </h2>
          <p className="text-sm text-slate-400 mt-1 font-mono">
            已存模型 <span className="text-slate-200 font-semibold">{aggregatedAssets.length}</span> · 76 ({mainOnlyCount}) · test03 ({archiveOnlyCount})
            {duplicateCount > 0 && (
              <span className="ml-2 text-slate-300">· 重复副本 ({duplicateCount})</span>
            )}
          </p>
        </div>

        {/* 模式切换 (字号放大为 text-sm) */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-800 text-sm">
          <button
            onClick={() => setActiveTab('search')}
            className={'px-3.5 py-1.5 rounded-md font-medium transition flex items-center gap-2 ' + (activeTab === 'search' ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60' : 'text-slate-400 hover:text-slate-200')}
          >
            <Cloud className="w-4 h-4 text-slate-400" />
            <span>ModelScope 检索 ({searchResults.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('local')}
            className={'px-3.5 py-1.5 rounded-md font-medium transition flex items-center gap-2 ' + (activeTab === 'local' ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60' : 'text-slate-400 hover:text-slate-200')}
          >
            <Database className="w-4 h-4 text-slate-400" />
            <span>本地已存 ({aggregatedAssets.length})</span>
          </button>
        </div>
      </div>

      {/* 检索模式 */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 space-y-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-400 mr-1 font-medium">组织:</span>
              {orgOptions.map((org) => (
                <button
                  key={org.id}
                  onClick={() => setSelectedOrg(org.id)}
                  className={'px-3 py-1.5 rounded-md text-xs font-mono transition border ' + (selectedOrg === org.id ? 'bg-slate-800 text-slate-100 border-slate-600 font-semibold' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700')}
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
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-sm font-medium flex items-center gap-2 transition disabled:opacity-50"
              >
                <RotateCw className={'w-4 h-4 ' + (searching ? 'animate-spin' : '')} />
                <span>{searching ? '检索中...' : '检索'}</span>
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {searchResults.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900/80 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-4 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-semibold text-slate-100 text-sm">{item.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-950 text-slate-400 border border-slate-800">
                      {item.id}
                    </span>

                    {/* 状态徽章放大为 text-xs */}
                    {item.local_status === 'LOCAL_76' && (
                      <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-300 border border-slate-700/80 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> 76 已存
                      </span>
                    )}
                    {item.local_status === 'LOCAL_TEST03' && (
                      <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-300 border border-slate-700/80 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" /> test03 存档
                      </span>
                    )}
                    {item.local_status === 'CLOUD_ONLY' && (
                      <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-950 text-slate-500 border border-slate-800/80 flex items-center gap-1.5">
                        云端
                      </span>
                    )}

                    {item.local_meta?.architectures?.[0] && (
                      <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-950 text-slate-400 border border-slate-800/80">
                        {item.local_meta.architectures[0]}
                      </span>
                    )}
                    {item.local_meta?.quant_method && item.local_meta.quant_method !== 'none' && (
                      <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-950 text-slate-400 border border-slate-800/80">
                        {item.local_meta.quant_method}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 flex items-center gap-4 font-mono">
                    <span>下载: {item.downloads.toLocaleString()}</span>
                    <span>大小: {formatSize(item.file_size)}</span>
                    <span>更新: {item.updated_at ? item.updated_at.substring(0, 10) : '近期'}</span>
                  </div>

                  <div className="text-xs font-mono bg-slate-950/80 px-2.5 py-1.5 rounded text-slate-400 truncate border border-slate-900">
                    {item.local_status === 'LOCAL_76' ? (
                      <span>76 路径: {item.local_path}</span>
                    ) : item.local_status === 'LOCAL_TEST03' ? (
                      <span>test03 路径: {item.local_path}</span>
                    ) : (
                      <span>{item.download_cmd}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {item.local_status === 'LOCAL_76' ? (
                    <button
                      onClick={() => handleCopy(item.rsync_cmd, item.id + '_rsync')}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition"
                    >
                      {copiedId === item.id + '_rsync' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedId === item.id + '_rsync' ? '已复制' : '复制分发'}</span>
                    </button>
                  ) : item.local_status === 'LOCAL_TEST03' ? (
                    <button
                      onClick={() => handleCopy(item.rsync_cmd, item.id + '_rsync')}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition"
                    >
                      {copiedId === item.id + '_rsync' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedId === item.id + '_rsync' ? '已复制' : '复制分发'}</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleCopy(item.download_cmd, item.id)}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition"
                      >
                        {copiedId === item.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        <span>{copiedId === item.id ? '已复制' : '复制下载'}</span>
                      </button>

                      <button
                        onClick={() => handleStartDownload(item)}
                        disabled={downloadingId === item.id}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-sm transition"
                      >
                        <Download className={'w-4 h-4 ' + (downloadingId === item.id ? 'animate-spin' : '')} />
                        <span>76 下载</span>
                      </button>
                    </>
                  )}

                  <a
                    href={'https://modelscope.cn/models/' + item.id}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 text-slate-400 hover:text-slate-200 rounded bg-slate-950 border border-slate-800"
                    title="打开 ModelScope"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 本地存储资产 */}
      {activeTab === 'local' && (
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-lg border border-slate-800 text-sm">
              <button
                onClick={() => setLocalFilter('ALL')}
                className={'px-3 py-1.5 rounded-md font-medium transition ' + (localFilter === 'ALL' ? 'bg-slate-800 text-slate-100 border border-slate-700/60' : 'text-slate-400 hover:text-slate-200')}
              >
                <span>全部 ({aggregatedAssets.length})</span>
              </button>
              <button
                onClick={() => setLocalFilter('MAIN')}
                className={'px-3 py-1.5 rounded-md font-medium transition ' + (localFilter === 'MAIN' ? 'bg-slate-800 text-slate-100 border border-slate-700/60' : 'text-slate-400 hover:text-slate-200')}
              >
                <span>76 ({mainOnlyCount})</span>
              </button>
              <button
                onClick={() => setLocalFilter('ARCHIVE')}
                className={'px-3 py-1.5 rounded-md font-medium transition ' + (localFilter === 'ARCHIVE' ? 'bg-slate-800 text-slate-100 border border-slate-700/60' : 'text-slate-400 hover:text-slate-200')}
              >
                <span>test03 ({archiveOnlyCount})</span>
              </button>
              <button
                onClick={() => setLocalFilter('DUPLICATE')}
                className={'px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ' + (localFilter === 'DUPLICATE' ? 'bg-slate-800 text-slate-100 border border-slate-700/60' : 'text-slate-400 hover:text-slate-200')}
              >
                <AlertCircle className="w-4 h-4 text-slate-400" />
                <span>重复副本 ({duplicateCount})</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  placeholder="过滤模型名称/架构..."
                  className="bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-600 font-mono w-48"
                />
              </div>

              <button
                onClick={() => fetchLocalAssets(true)}
                disabled={loadingLocal}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1.5 border border-slate-700 transition"
              >
                <RotateCw className={'w-3.5 h-3.5 ' + (loadingLocal ? 'animate-spin' : '')} />
                <span>{loadingLocal ? '扫描中...' : '刷新'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredAggregatedAssets.map((ast, idx) => {
              const preferredLoc = ast.locations.find((l) => l.type === 'MAIN') || ast.locations[0]
              const rsyncCmd = 'xssh ' + preferredLoc.server_ip + ' "rsync -avP --progress ' + preferredLoc.path + '/ 192.2.0.146:/data/model/' + ast.name + '/"'

              return (
                <div
                  key={idx}
                  className="bg-slate-900/80 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-4 space-y-3 flex flex-col justify-between transition shadow-none"
                >
                  <div>
                    {/* 卡片头部 */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-semibold text-slate-100 text-sm font-mono break-all leading-tight">
                        {ast.name}
                      </h4>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {ast.isDuplicate ? (
                          <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-300 border border-slate-700/80 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> 双副本
                          </span>
                        ) : ast.hasMain ? (
                          <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-950 text-slate-400 border border-slate-800">
                            76
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-950 text-slate-400 border border-slate-800">
                            test03
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 元数据 (字号提升至 text-xs) */}
                    <div className="bg-slate-950/70 rounded-lg p-2.5 text-xs font-mono text-slate-400 space-y-1.5 border border-slate-900">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">架构:</span>
                        <span className="text-slate-300 font-medium truncate max-w-[190px]">{ast.architectures?.[0] || ast.model_type || '通用'}</span>
                      </div>
                      {ast.quant_method !== 'none' && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">量化:</span>
                          <span className="text-slate-300">{ast.quant_method}</span>
                        </div>
                      )}
                      {ast.torch_dtype && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">精度:</span>
                          <span className="text-slate-400">{ast.torch_dtype}</span>
                        </div>
                      )}
                      {ast.max_position > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">上下文:</span>
                          <span className="text-slate-400">{formatContextLen(ast.max_position)}</span>
                        </div>
                      )}
                    </div>

                    {/* 物理路径列表 */}
                    <div className="mt-2.5 space-y-1 font-mono text-xs">
                      {ast.locations.map((loc, lIdx) => (
                        <div key={lIdx} className="flex items-center gap-1.5 text-slate-400 truncate" title={loc.path}>
                          <span className="text-slate-500 font-bold shrink-0">
                            {loc.type === 'MAIN' ? '76:' : '03:'}
                          </span>
                          <span className="truncate text-slate-400">{loc.path}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 底部 */}
                  <div className="pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs font-mono text-slate-500">
                    <span>{ast.locations[0]?.time || '近期'}</span>
                    <button
                      onClick={() => handleCopy(rsyncCmd, 'loc_' + idx)}
                      className="text-slate-300 hover:text-white flex items-center gap-1 font-medium transition text-xs"
                    >
                      {copiedId === 'loc_' + idx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === 'loc_' + idx ? '已复制' : '复制分发'}</span>
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
