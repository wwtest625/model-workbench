import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Search, Download, Copy, Check, HardDrive, Cloud, Server, CheckCircle2, RotateCw, ExternalLink, Database } from 'lucide-react'

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
  const [localServerFilter, setLocalServerFilter] = useState<'ALL' | 'MAIN' | 'ARCHIVE'>('ALL')
  const [localSearch, setLocalSearch] = useState('')
  const [query, setQuery] = useState('')
  const [selectedOrg, setSelectedOrg] = useState('metax-tech')
  const [searching, setSearching] = useState(false)
  const [loadingLocal, setLoadingLocal] = useState(false)
  
  // 缓存池 (避免切换 Tab 重复触发请求)
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

  // 1. 懒加载：仅在切换组织时检查缓存，有缓存直接读缓存，无缓存才请求
  useEffect(() => {
    if (!query && orgCacheRef.current[selectedOrg]) {
      setSearchResults(orgCacheRef.current[selectedOrg])
    } else {
      handleSearch(undefined, false)
    }
  }, [selectedOrg])

  // 2. 懒加载：当用户真正点击「本地存储已有资产」Tab 时才触发首次拉取
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
    
    // 如果无 query 且有组织缓存且非强制刷新，直接使用缓存
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

  const mainAssetsCount = useMemo(() => localAssets.filter((a) => a.type === 'MAIN').length, [localAssets])
  const archiveAssetsCount = useMemo(() => localAssets.filter((a) => a.type === 'ARCHIVE').length, [localAssets])

  const filteredLocalAssets = useMemo(() => {
    return localAssets.filter((ast) => {
      if (localServerFilter === 'MAIN' && ast.type !== 'MAIN') return false
      if (localServerFilter === 'ARCHIVE' && ast.type !== 'ARCHIVE') return false
      if (localSearch.trim()) {
        const s = localSearch.toLowerCase()
        return (
          ast.name.toLowerCase().includes(s) ||
          ast.model_type.toLowerCase().includes(s) ||
          ast.path.toLowerCase().includes(s) ||
          (ast.architectures && ast.architectures.some((a) => a.toLowerCase().includes(s)))
        )
      }
      return true
    })
  }, [localAssets, localServerFilter, localSearch])

  return (
    <div className="space-y-6">
      {/* 顶部二级导航 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-indigo-400" /> 模型检索与存储中心 (懒加载模式 · 毫秒级秒开)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            前端与后端双重缓存，按需异步拉取，告别多余的重复网络与 SSH 扫描
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
            <span>本地存储已有资产 ({localLoadedRef.current ? localAssets.length : '点击加载'})</span>
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
                        <CheckCircle2 className="w-3 h-3" /> 76 主力已就绪
                      </span>
                    )}
                    {item.local_status === 'LOCAL_TEST03' && (
                      <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1 font-semibold">
                        <HardDrive className="w-3 h-3" /> test03 历史已存档
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
                      <span className="text-emerald-400 font-semibold">76 绝对路径: {item.local_path}</span>
                    ) : item.local_status === 'LOCAL_TEST03' ? (
                      <span className="text-amber-400 font-semibold">test03 归档路径: {item.local_path} (建议直接分发)</span>
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
                      title="从 76 主力存储直接 rsync 到算力机 146"
                    >
                      {copiedId === item.id + '_rsync' ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === item.id + '_rsync' ? '已复制分发命令' : '复制从 76 分发至 146'}</span>
                    </button>
                  ) : item.local_status === 'LOCAL_TEST03' ? (
                    <button
                      onClick={() => handleCopy(item.rsync_cmd, item.id + '_rsync')}
                      className="px-3.5 py-1.5 bg-amber-600/80 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                      title="从 test03 历史仓库直接 rsync 到算力机 146，免去重复下载"
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

      {/* 本地存储资产一览模式 (懒加载) */}
      {activeTab === 'local' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setLocalServerFilter('ALL')}
                className={'px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ' + (localServerFilter === 'ALL' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200')}
              >
                <span>全部已存模型 ({localAssets.length})</span>
              </button>
              <button
                onClick={() => setLocalServerFilter('MAIN')}
                className={'px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ' + (localServerFilter === 'MAIN' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200')}
              >
                <Server className="w-3.5 h-3.5" />
                <span>76 主力存储 ({mainAssetsCount})</span>
              </button>
              <button
                onClick={() => setLocalServerFilter('ARCHIVE')}
                className={'px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ' + (localServerFilter === 'ARCHIVE' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200')}
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>test03 历史仓库 ({archiveAssetsCount})</span>
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredLocalAssets.map((ast, idx) => {
              const rsyncFrom = ast.server_ip === '192.2.56.76' ? '192.2.56.76' : '192.2.29.9';
              const rsyncCmd = 'xssh ' + rsyncFrom + ' "rsync -avP --progress ' + ast.path + '/ 192.2.0.146:/data/model/' + ast.name.split('/').pop() + '/"';
              return (
                <div
                  key={idx}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 flex flex-col justify-between hover:border-slate-700 transition"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-bold text-slate-100 text-xs font-mono break-all leading-tight">{ast.name}</h4>
                      <span
                        className={'text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ' + (ast.type === 'MAIN' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30')}
                      >
                        {ast.server}
                      </span>
                    </div>

                    <div className="bg-slate-950/90 rounded-lg p-2.5 text-[11px] font-mono text-slate-400 space-y-1.5 border border-slate-800/80">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">模型真实架构:</span>
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

                    <p className="text-[11px] text-slate-500 font-mono mt-2 truncate" title={ast.path}>
                      {ast.path}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span>{ast.time}</span>
                    <button
                      onClick={() => handleCopy(rsyncCmd, 'loc_' + idx)}
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                    >
                      {copiedId === 'loc_' + idx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === 'loc_' + idx ? '已复制' : '复制分发命令'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  )
}
