import React, { useState, useMemo } from 'react'
import { LocalWeightItem } from '../../types'
import {
  HardDrive,
  Copy,
  Check,
  Folder,
  Layers,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  RotateCw,
  ChevronDown,
  ChevronRight,
  Database,
  Search,
  ExternalLink,
  ShieldCheck,
  Cpu
} from 'lucide-react'

interface LocalWeightsPanelProps {
  weights: LocalWeightItem[]
  loading: boolean
  searchQuery: string
  statusTab: 'RUNNING' | 'STOPPED' | 'IMAGES' | 'WEIGHTS'
  onRefresh: () => void
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void
}

export const LocalWeightsPanel: React.FC<LocalWeightsPanelProps> = ({
  weights,
  loading,
  searchQuery,
  statusTab,
  onRefresh,
  showToast
}) => {
  const [filterSeries, setFilterSeries] = useState<string>('ALL')
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'CONFIGURED' | 'READY' | 'INCOMPLETE'>('ALL')
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(text)
    if (showToast) showToast(`已复制${label}: ${text}`, 'success')
    setTimeout(() => setCopiedText(null), 2500)
  }

  const toggleExpand = (name: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [name]: !prev[name]
    }))
  }

  // 计算系列与状态统计数据
  const stats = useMemo(() => {
    const seriesCount: Record<string, number> = {}
    let configured = 0
    let ready = 0
    let incomplete = 0
    let totalSizeBytes = 0

    weights.forEach((w) => {
      seriesCount[w.series] = (seriesCount[w.series] || 0) + 1
      if (w.status === 'CONFIGURED') configured++
      else if (w.status === 'READY') ready++
      else if (w.status === 'INCOMPLETE') incomplete++
      totalSizeBytes += w.size_bytes || 0
    })

    const formatSize = (bytes: number) => {
      let b = bytes
      for (const u of ['B', 'KB', 'MB', 'GB', 'TB']) {
        if (b < 1024.0) return `${b.toFixed(1)} ${u}`
        b /= 1024.0
      }
      return `${b.toFixed(1)} PB`
    }

    return {
      seriesCount,
      configured,
      ready,
      incomplete,
      totalSize: formatSize(totalSizeBytes)
    }
  }, [weights])

  // 过滤后的模型
  const filteredWeights = useMemo(() => {
    return weights.filter((w) => {
      // 搜索过滤
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchName = w.name.toLowerCase().includes(q)
        const matchPath = w.host_path.toLowerCase().includes(q)
        const matchSeries = w.series.toLowerCase().includes(q)
        const matchFormat = w.format.toLowerCase().includes(q)
        if (!matchName && !matchPath && !matchSeries && !matchFormat) return false
      }

      // 系列过滤
      if (filterSeries !== 'ALL' && w.series !== filterSeries) {
        return false
      }

      // 状态过滤
      if (filterStatus !== 'ALL' && w.status !== filterStatus) {
        return false
      }

      return true
    })
  }, [weights, searchQuery, filterSeries, filterStatus])

  if (statusTab !== 'WEIGHTS') return null

  const getSeriesBadgeColor = (series: string) => {
    switch (series) {
      case 'Qwen':
        return 'bg-purple-950/80 text-purple-300 border-purple-800/80'
      case 'DeepSeek':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80'
      case 'GLM':
        return 'bg-amber-950/80 text-amber-300 border-amber-800/80'
      case 'MiniMax':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
      case 'Llama':
        return 'bg-blue-950/80 text-blue-300 border-blue-800/80'
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700'
    }
  }

  return (
    <div className="space-y-4 font-sans">
      {/* 状态与系列统计概览条 */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/70 p-3 rounded-xl border border-slate-800/90 text-xs">
        {/* 左侧系列快捷过滤 */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono">
          <button
            onClick={() => setFilterSeries('ALL')}
            className={`px-3 py-1 rounded-lg transition cursor-pointer ${
              filterSeries === 'ALL'
                ? 'bg-slate-800 text-slate-100 border border-slate-600 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            全部系列 ({weights.length})
          </button>
          {Object.entries(stats.seriesCount).map(([s, count]) => (
            <button
              key={s}
              onClick={() => setFilterSeries(s)}
              className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                filterSeries === s
                  ? 'bg-indigo-900/60 text-indigo-200 border border-indigo-600 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s} ({count})
            </button>
          ))}
        </div>

        {/* 右侧状态过滤与总容量 */}
        <div className="flex items-center gap-2 font-mono">
          <button
            onClick={() => setFilterStatus('ALL')}
            className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
              filterStatus === 'ALL'
                ? 'bg-slate-800 text-slate-200 border border-slate-600'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            全部状态
          </button>
          <button
            onClick={() => setFilterStatus('CONFIGURED')}
            className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
              filterStatus === 'CONFIGURED'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                : 'text-slate-400 hover:text-emerald-400'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            已配置 ({stats.configured})
          </button>
          <button
            onClick={() => setFilterStatus('READY')}
            className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
              filterStatus === 'READY'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                : 'text-slate-400 hover:text-cyan-400'
            }`}
          >
            <HardDrive className="w-3 h-3 text-cyan-400" />
            未编排 ({stats.ready})
          </button>
          {stats.incomplete > 0 && (
            <button
              onClick={() => setFilterStatus('INCOMPLETE')}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                filterStatus === 'INCOMPLETE'
                  ? 'bg-rose-950 text-rose-300 border border-rose-700'
                  : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              残缺 ({stats.incomplete})
            </button>
          )}
          <span className="text-slate-500 font-mono text-[11px] ml-2 border-l border-slate-800 pl-3">
            总计: <strong className="text-cyan-300">{stats.totalSize}</strong>
          </span>
        </div>
      </div>

      {/* 模型列表 */}
      {loading && weights.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-3">
          <RotateCw className="w-6 h-6 text-purple-400 animate-spin" />
          <p className="text-xs font-mono text-slate-400">正在地毯式扫描当前算力机上的模型权重目录...</p>
        </div>
      ) : filteredWeights.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-300">
              {searchQuery ? '没有找到符合条件的模型权重' : '当前主机暂无扫描到本地模型权重'}
            </p>
            <p className="text-xs text-slate-500 mt-1 font-mono">
              扫描路径涵盖: /mnt/model · /home/workspace/models
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredWeights.map((item) => {
            const isExpanded = !!expandedItems[item.name]
            const isCopyHost = copiedText === item.host_path

            return (
              <div
                key={item.host_path}
                className={`bg-slate-900/90 border rounded-xl p-4 transition-all duration-200 ${
                  item.status === 'INCOMPLETE'
                    ? 'border-rose-900/60 bg-gradient-to-r from-slate-900 via-rose-950/10 to-slate-900'
                    : item.status === 'CONFIGURED'
                    ? 'border-slate-800/90 hover:border-emerald-700/60'
                    : 'border-slate-800/90 hover:border-indigo-700/60'
                }`}
              >
                {/* 顶部标题与徽章行 */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-[280px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-100 text-sm font-mono tracking-tight">
                        {item.name}
                      </span>

                      {/* 系列徽章 */}
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded font-mono border font-medium ${getSeriesBadgeColor(
                          item.series
                        )}`}
                      >
                        {item.series}
                      </span>

                      {/* 格式徽章 */}
                      <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-slate-950 text-slate-400 border border-slate-800">
                        {item.format}
                      </span>

                      {/* 状态徽章 */}
                      {item.status === 'CONFIGURED' ? (
                        <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-1 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          已编排入服务
                        </span>
                      ) : item.status === 'INCOMPLETE' ? (
                        <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-rose-950/80 text-rose-300 border border-rose-800/80 flex items-center gap-1 font-medium">
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          残缺/未下载完
                        </span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-cyan-950/60 text-cyan-300 border border-cyan-800/60 flex items-center gap-1 font-medium">
                          <HardDrive className="w-3 h-3 text-cyan-400" />
                          权重就绪 · 待编排
                        </span>
                      )}
                    </div>

                    {/* 关联的启动脚本 / Compose 标签 */}
                    {item.used_by && item.used_by.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 flex-wrap pt-0.5">
                        <span className="text-slate-500 font-mono text-[11px]">绑定脚本/配置:</span>
                        {item.used_by.map((u) => (
                          <span
                            key={u}
                            className="bg-slate-950 px-2 py-0.5 rounded text-[11px] font-mono text-emerald-300 border border-emerald-900/60 flex items-center gap-1"
                          >
                            <FileCode className="w-3 h-3 text-emerald-400" />
                            {u}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 右上角大小与分卷统计 */}
                  <div className="text-right shrink-0 space-y-1">
                    <div className="text-sm font-semibold font-mono text-slate-200">
                      <span
                        className={
                          item.size_bytes > 200 * 1024 * 1024 * 1024
                            ? 'text-amber-300'
                            : item.size_bytes > 50 * 1024 * 1024 * 1024
                            ? 'text-cyan-300'
                            : 'text-slate-300'
                        }
                      >
                        {item.size_human}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {item.files_count} 个关键文件
                    </div>
                  </div>
                </div>

                  {/* 路径展示与一键复制卡片 (仅展示宿主机物理路径) */}
                <div className="mt-3 bg-slate-950/80 rounded-lg p-2.5 border border-slate-800/80 text-xs font-mono">
                  <div className="flex items-center justify-between gap-2 group">
                    <div className="flex items-center gap-2 min-w-0 text-slate-400">
                      <Folder className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate text-slate-300 selection:bg-indigo-900 select-all">
                        {item.host_path}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy(item.host_path, '模型物理路径')}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition flex items-center gap-1 shrink-0 border border-slate-800 text-[11px] cursor-pointer"
                      title="复制模型物理路径"
                    >
                      {isCopyHost ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-slate-400" />
                          <span>复制路径</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 底部折叠：查看包含的文件样本与修改时间 */}
                <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500 font-mono">
                  <div className="flex items-center gap-3">
                    {item.modified && <span>修改时间: {item.modified}</span>}
                    {item.sample_files && item.sample_files.length > 0 && (
                      <button
                        onClick={() => toggleExpand(item.name)}
                        className="text-slate-400 hover:text-slate-200 flex items-center gap-1 transition cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span>{isExpanded ? '收起权重文件采样' : `查看文件采样 (${item.sample_files.length})`}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 展开的文件切片预览 */}
                {isExpanded && item.sample_files && (
                  <div className="mt-2.5 bg-slate-950 rounded-lg p-3 border border-slate-800/80 text-[11px] font-mono text-slate-400 space-y-1">
                    <div className="text-slate-500 font-semibold mb-1">分卷切片文件示例：</div>
                    {item.sample_files.map((sf, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-slate-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                        <span className="truncate">{sf}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
