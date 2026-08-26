import React, { useState, useEffect } from 'react'
import { Search, Download, Copy, Check, HardDrive, Cloud, Sparkles, CheckCircle2, RotateCw, ExternalLink, ArrowRight } from 'lucide-react'

interface LocalAsset {
  name: string
  server: string
  path: string
  server_ip: string
  time: string
  type: string
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
  download_cmd: string
  rsync_cmd: string
}

export const ModelHub: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'local'>('search')
  const [query, setQuery] = useState('')
  const [selectedOrg, setSelectedOrg] = useState('metax-tech')
  const [searching, setSearching] = useState(false)
  const [loadingLocal, setLoadingLocal] = useState(false)
  const [localAssets, setLocalAssets] = useState<LocalAsset[]>([])
  const [searchResults, setSearchResults] = useState<HubModelItem[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const orgOptions = [
    { id: 'metax-tech', name: '⭐ metax-tech (沐曦官方适配)', desc: '官方量化/Maca 专享' },
    { id: 'Qwen', name: 'Qwen (通义千问官方)', desc: '阿里云 Qwen 原生' },
    { id: 'deepseek-ai', name: 'deepseek-ai (深度求索)', desc: 'DeepSeek 官方' },
    { id: 'ZhipuAI', name: 'ZhipuAI (智谱)', desc: 'GLM 官方' },
    { id: 'MiniMax', name: 'MiniMax (名之梦)', desc: 'MiniMax 官方' },
  ]

  useEffect(() => {
    fetchLocalAssets(false)
    handleSearch()
  }, [selectedOrg])

  const fetchLocalAssets = async (force: boolean) => {
    setLoadingLocal(true)
    try {
      const res = await fetch(`/api/v1/hub/local?force=${force}`)
      const data = await res.json()
      setLocalAssets(data.assets || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingLocal(false)
    }
  }

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setSearching(true)
    try {
      const res = await fetch(`/api/v1/hub/search?org=${encodeURIComponent(selectedOrg)}&q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setSearchResults(data.models || [])
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
    if (!confirm(`确定要在 76 存储服务器后台启动下载【${item.name}】吗？\n将存入 /data/AI_model/${item.name}`)) return
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
      alert(`提交下载失败: ${e.message}`)
    } finally {
      setDownloadingId(null)
    }
  }

  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '未知大小'
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return `${gb.toFixed(1)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  return (
    <div className="space-y-6">
      {/* 顶部二级导航与快捷概览 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-indigo-400" /> 模型检索与资产下载中心 (Model Hub)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            智能索引本地存储（76 主力 / test03 历史）与 ModelScope 社区，自动关联一致性并一键生成规范下载命令
          </p>
        </div>

        {/* 模式切换 */}
        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
              activeTab === 'search' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>全网与官方检索 ({searchResults.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('local')}
            className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
              activeTab === 'local' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>本地存储已有资产 ({localAssets.length})</span>
          </button>
        </div>
      </div>

      {/* 检索模式 */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          {/* 搜索栏与组织过滤器 */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            {/* 组织快捷标签 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 font-medium mr-1">推荐组织:</span>
              {orgOptions.map((org) => (
                <button
                  key={org.id}
                  onClick={() => setSelectedOrg(org.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono transition border ${
                    selectedOrg === org.id
                      ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500 font-semibold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                  title={org.desc}
                >
                  {org.name}
                </button>
              ))}
            </div>

            {/* 搜索表单 */}
            <form onSubmit={handleSearch} className="flex gap-3">
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
                <RotateCw className={`w-3.5 h-3.5 ${searching ? 'animate-spin' : ''}`} />
                <span>{searching ? '正在检索...' : '检索 ModelScope'}</span>
              </button>
            </form>
          </div>

          {/* 搜索结果卡片列表 */}
          <div className="grid grid-cols-1 gap-3">
            {searchResults.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* 左侧模型信息 */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-100 text-sm">{item.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-slate-950 text-indigo-400 border border-slate-800">
                      {item.id}
                    </span>

                    {/* 状态徽章 (与本地资产比对) */}
                    {item.local_status === 'LOCAL_76' && (
                      <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> 76 主力存储已就绪
                      </span>
                    )}
                    {item.local_status === 'LOCAL_TEST03' && (
                      <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                        <HardDrive className="w-3 h-3" /> test03 历史已存档
                      </span>
                    )}
                    {item.local_status === 'CLOUD_ONLY' && (
                      <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                        <Cloud className="w-3 h-3" /> 云端未下载
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 flex items-center gap-4 font-mono">
                    <span>下载量: <strong className="text-slate-200">{item.downloads.toLocaleString()}</strong></span>
                    <span>文件大小: <strong className="text-indigo-300">{formatSize(item.file_size)}</strong></span>
                    <span>更新时间: {item.updated_at ? item.updated_at.substring(0, 10) : '近期'}</span>
                  </div>

                  {/* 路径或命令预览 */}
                  <div className="text-[11px] font-mono bg-slate-950 p-2 rounded text-slate-400 truncate">
                    {item.local_status === 'LOCAL_76' ? (
                      <span className="text-emerald-400 font-semibold">本地路径: {item.local_path}</span>
                    ) : (
                      <span className="text-slate-400">{item.download_cmd}</span>
                    )}
                  </div>
                </div>

                {/* 右侧快捷操作按钮 */}
                <div className="flex items-center gap-2 shrink-0">
                  {item.local_status === 'LOCAL_76' ? (
                    <button
                      onClick={() => handleCopy(item.rsync_cmd, item.id + '_rsync')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-slate-700"
                      title="复制分发到算力机 146 的 rsync 命令"
                    >
                      {copiedId === item.id + '_rsync' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === item.id + '_rsync' ? '已复制分发命令' : '复制分发至146命令'}</span>
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
                        <Download className={`w-3.5 h-3.5 ${downloadingId === item.id ? 'animate-spin' : ''}`} />
                        <span>一键在 76 下载</span>
                      </button>
                    </>
                  )}

                  <a
                    href={`https://modelscope.cn/models/${item.id}`}
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

      {/* 本地存储资产一览模式 */}
      {activeTab === 'local' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono">
              76 主力服务器 (/data/AI_model/) + test03 历史仓库 (/HDD_Raid/SVN_MODEL_REPO/Model/)
            </span>
            <button
              onClick={() => fetchLocalAssets(true)}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1.5 border border-slate-700"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loadingLocal ? 'animate-spin' : ''}`} />
              <span>重新扫描存储服务器</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {localAssets.map((ast, idx) => (
              <div
                key={idx}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2 flex flex-col justify-between hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-slate-100 text-xs font-mono break-all">{ast.name}</h4>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                        ast.type === 'MAIN'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {ast.server}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-1 truncate" title={ast.path}>
                    {ast.path}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span>{ast.time}</span>
                  <button
                    onClick={() => handleCopy(`xssh 192.2.56.76 "rsync -avP --progress ${ast.path}/ 192.2.0.146:/data/model/${ast.name}/"`, `loc_${idx}`)}
                    className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                  >
                    {copiedId === `loc_${idx}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedId === `loc_${idx}` ? '已复制' : '复制分发命令'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
