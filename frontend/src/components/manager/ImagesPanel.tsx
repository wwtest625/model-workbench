import React from 'react'
import { DockerImageItem } from '../../types'
import { parseImageTraits } from './traits'
import { Copy, RotateCw, ChevronDown, ChevronRight, CheckCircle2, Tag, Check, HardDrive } from 'lucide-react'

interface ImagesPanelProps {
  imageCounts: { vllm: number; sglang: number; inUse: number; alias: number }
  toggleExpandRepo: (repo: string) => void
  handleCopyImage: (fullName: string) => void
  searchQuery: string
  images: DockerImageItem[]
  loadingImages: boolean
  filteredRepoGroups: { repository: string; tagsCount: number; images: DockerImageItem[] }[]
  expandedRepos: Record<string, boolean>
  copiedImageName: string | null
  statusTab: 'RUNNING' | 'STOPPED' | 'IMAGES'
  imageFilter: 'ALL' | 'VLLM' | 'SGLANG' | 'IN_USE' | 'ALIAS'
  setImageFilter: React.Dispatch<React.SetStateAction<'ALL' | 'VLLM' | 'SGLANG' | 'IN_USE' | 'ALIAS'>>
}

export const ImagesPanel: React.FC<ImagesPanelProps> = ({ imageCounts, toggleExpandRepo, handleCopyImage, searchQuery, images, loadingImages, filteredRepoGroups, expandedRepos, copiedImageName, statusTab, imageFilter, setImageFilter }) => {
  return (
statusTab === 'IMAGES' && (
      <div className="space-y-4 font-sans">
        {loadingImages && images.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-3">
            <RotateCw className="w-6 h-6 text-cyan-400 animate-spin" />
            <p className="text-xs font-mono text-slate-400">正在扫描当前算力主机的 Docker 镜像列表...</p>
          </div>
        ) : filteredRepoGroups.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800/80 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-300">
                {searchQuery ? '没有找到匹配的镜像或版本' : '当前算力主机暂无 Docker 镜像'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                您可以点击右上角【刷新镜像】或在终端中拉取镜像
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 镜像快捷筛选分类 Pills */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/60 p-2 rounded-xl border border-slate-800/80 text-xs">
              <button
                onClick={() => setImageFilter('ALL')}
                className={`px-3 py-1 rounded-lg transition font-mono cursor-pointer ${
                  imageFilter === 'ALL'
                    ? 'bg-slate-800 text-slate-100 border border-slate-600 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                全部镜像 ({images.length})
              </button>
              <button
                onClick={() => setImageFilter('VLLM')}
                className={`px-3 py-1 rounded-lg transition font-mono cursor-pointer ${
                  imageFilter === 'VLLM'
                    ? 'bg-blue-900/50 text-blue-200 border border-blue-600 font-semibold'
                    : 'text-slate-400 hover:text-blue-300'
                }`}
              >
                vLLM ({imageCounts.vllm})
              </button>
              <button
                onClick={() => setImageFilter('SGLANG')}
                className={`px-3 py-1 rounded-lg transition font-mono cursor-pointer ${
                  imageFilter === 'SGLANG'
                    ? 'bg-purple-900/50 text-purple-200 border border-purple-600 font-semibold'
                    : 'text-slate-400 hover:text-purple-300'
                }`}
              >
                SGLang ({imageCounts.sglang})
              </button>
              <button
                onClick={() => setImageFilter('IN_USE')}
                className={`px-3 py-1 rounded-lg transition font-mono cursor-pointer ${
                  imageFilter === 'IN_USE'
                    ? 'bg-emerald-900/50 text-emerald-200 border border-emerald-600 font-semibold'
                    : 'text-slate-400 hover:text-emerald-300'
                }`}
              >
                运行中使用 ({imageCounts.inUse})
              </button>
              <button
                onClick={() => setImageFilter('ALIAS')}
                className={`px-3 py-1 rounded-lg transition font-mono cursor-pointer ${
                  imageFilter === 'ALIAS'
                    ? 'bg-amber-900/50 text-amber-200 border border-amber-600 font-semibold'
                    : 'text-slate-400 hover:text-amber-300'
                }`}
              >
                存在重复别名 ({imageCounts.alias})
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 font-mono px-1">
              <span>
                共聚合 <strong className="text-slate-200">{filteredRepoGroups.length}</strong> 个镜像仓库，共 <strong className="text-cyan-300">{images.length}</strong> 个镜像版本
              </span>
              <span className="hidden sm:inline">已自动解析底层驱动、推理引擎与重复别名</span>
            </div>

            {filteredRepoGroups.map((group) => {
              const isCollapsed = expandedRepos[group.repository] === false
              const hasInUse = group.images.some((img) => img.is_in_use)

              return (
                <div
                  key={group.repository}
                  className={`bg-slate-900/90 border rounded-xl overflow-hidden transition shadow-sm ${
                    hasInUse ? 'border-slate-700 bg-slate-900' : 'border-slate-800/80 hover:border-slate-700/80'
                  }`}
                >
                  {/* Repo 头部栏 */}
                  <div
                    onClick={() => toggleExpandRepo(group.repository)}
                    className="px-4 py-3 bg-slate-950/70 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-950 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 shrink-0">
                        <HardDrive className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-sm text-slate-100 font-mono break-all">
                        {group.repository}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                        {group.tagsCount} 个 Tag
                      </span>
                      {hasInUse && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 flex items-center gap-1 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>使用中</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-slate-400">
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                  </div>

                  {/* Tag 列表 */}
                  {!isCollapsed && (
                    <div className="divide-y divide-slate-800/40">
                      {group.images.map((img) => {
                        const isCopied = copiedImageName === img.full_name
                        const traits = parseImageTraits(img.full_name, images, img)

                        return (
                          <div
                            key={img.image_id + '_' + img.tag + '_' + img.repository}
                            className="px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs hover:bg-slate-800/30 transition font-mono"
                          >
                            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                {/* 框架 Badge */}
                                {traits.framework && (
                                  <span
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                      traits.framework === 'vLLM'
                                        ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                        : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                                    }`}
                                  >
                                    {traits.framework}
                                  </span>
                                )}

                                {/* 算力驱动 Badge */}
                                {traits.driver && (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                    {traits.driver}
                                  </span>
                                )}

                                {/* 运行时 Badge */}
                                {traits.pythonTorch && (
                                  <span className="px-2 py-0.5 rounded text-[11px] bg-slate-950 text-slate-300 border border-slate-800">
                                    {traits.pythonTorch}
                                  </span>
                                )}

                                {/* 模型专属 Patch */}
                                {traits.modelPatch && (
                                  <span className="px-2 py-0.5 rounded text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    {traits.modelPatch}
                                  </span>
                                )}

                                {/* 同 ID 别名标记 */}
                                {traits.aliasCount > 1 && (
                                  <span
                                    className="px-2 py-0.5 rounded text-[10px] bg-amber-950/60 text-amber-300 border border-amber-800/60 cursor-help"
                                    title={`同 ID 存在 ${traits.aliasCount} 个镜像别名 (底层层存储完全共享):\n${traits.aliasRepos.join('\n')}`}
                                  >
                                    同ID别名 ×{traits.aliasCount}
                                  </span>
                                )}

                                {/* 运行中状态 */}
                                {img.is_in_use && (
                                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-700/80 flex items-center gap-1 font-sans">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    <span>
                                      运行中: {img.used_by && img.used_by.length > 0 ? img.used_by.join(', ') : '已挂载'}
                                    </span>
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-3 text-slate-400 text-[11px]">
                                <span className="text-slate-200 font-semibold flex items-center gap-1">
                                  <Tag className="w-3 h-3 text-indigo-400" />
                                  <span>Tag: {img.tag || '<none>'}</span>
                                </span>
                                <span>ID: <strong className="text-slate-300">{img.image_id.substring(0, 12)}</strong></span>
                                <span>大小: <strong className="text-slate-200">{img.size}</strong></span>
                                <span>创建: {img.created ? img.created.substring(0, 19) : '-'}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleCopyImage(img.full_name)}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 flex items-center gap-1.5 transition cursor-pointer text-xs font-sans"
                                title="复制完整镜像名 (repo:tag)"
                              >
                                {isCopied ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-emerald-400 font-medium">已复制</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                                    <span>复制镜像名</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  )
}
