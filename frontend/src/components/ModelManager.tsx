import React, { useState, useEffect, useMemo } from 'react'
import {
  Play,
  Square,
  FileCode,
  Container,
  ScrollText,
  Copy,
  RotateCw,
  X,
  Power,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronRight,
  Search,
  CheckCircle2,
  Layers,
  Activity,
  AlertCircle,
  Zap,
  Disc,
  Tag,
  Check,
  HardDrive
} from 'lucide-react'
import { ModelCard, ModalState, DockerImageItem } from '../types'
import { CodeEditor } from './CodeEditor'
import { parseImageTraits } from './manager/traits'
import { RunningList } from './manager/RunningList'
import { StoppedList } from './manager/StoppedList'
import { ImagesPanel } from './manager/ImagesPanel'
import { ScriptModal } from './manager/ScriptModal'

interface ModelManagerProps {
  models: ModelCard[]
  operatingModel: boolean
  onStartModel: (model: ModelCard) => void
  onRestartModel?: (model: ModelCard) => void
  onStopModel: (model: ModelCard) => void
  onStopAll: () => void
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void
}

export const ModelManager: React.FC<ModelManagerProps> = ({
  models,
  operatingModel,
  onStartModel,
  onRestartModel,
  onStopModel,
  onStopAll,
  showToast
}) => {
  const [modal, setModal] = useState<ModalState>({
    show: false,
    type: 'script',
    title: '',
    modelName: '',
    content: '',
    loading: false
  })
  const [activeModel, setActiveModel] = useState<ModelCard | null>(null)

  // 状态切片 Tab: 运行中 / 未启动 / 本地镜像
  const isModelActive = (s: string) => s === 'READY' || s === 'WARMING_UP' || s === 'LOADING_WEIGHTS' || s === 'INIT' || s === 'LOADING' || s === 'RUNNING'
  const runningModels = models.filter((m) => isModelActive(m.status))
  const stoppedModels = models.filter((m) => !isModelActive(m.status))
  const readyCount = models.filter((m) => m.status === 'READY').length
  const loadingCount = models.filter((m) => m.status === 'WARMING_UP' || m.status === 'LOADING_WEIGHTS' || m.status === 'INIT' || m.status === 'LOADING').length
  const failedCount = models.filter((m) => m.status === 'FAILED').length

  const [statusTab, setStatusTab] = useState<'RUNNING' | 'STOPPED' | 'IMAGES'>('RUNNING')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({})

  // 本地镜像状态
  const [images, setImages] = useState<DockerImageItem[]>([])
  const [loadingImages, setLoadingImages] = useState<boolean>(false)
  const [copiedImageName, setCopiedImageName] = useState<string | null>(null)
  const [expandedRepos, setExpandedRepos] = useState<Record<string, boolean>>({})

  const fetchHostImages = async () => {
    setLoadingImages(true)
    try {
      const res = await fetch('/api/v1/models/images')
      const data = await res.json()
      setImages(data.images || [])
    } catch (e: any) {
      if (showToast) showToast('获取本地镜像列表失败: ' + e.message, 'error')
    } finally {
      setLoadingImages(false)
    }
  }

  useEffect(() => {
    // 首次载入或切换至 IMAGES 时自动拉取镜像
    if (statusTab === 'IMAGES' && images.length === 0) {
      fetchHostImages()
    }
  }, [statusTab])

  const handleCopyImage = (fullName: string) => {
    navigator.clipboard.writeText(fullName)
    setCopiedImageName(fullName)
    if (showToast) showToast('已复制镜像完整地址: ' + fullName, 'success')
    setTimeout(() => setCopiedImageName(null), 2500)
  }

  const toggleExpand = (modelName: string) => {
    setExpandedModels((prev) => ({
      ...prev,
      [modelName]: !prev[modelName]
    }))
  }

  const toggleExpandRepo = (repo: string) => {
    setExpandedRepos((prev) => ({
      ...prev,
      [repo]: prev[repo] === undefined ? false : !prev[repo]
    }))
  }

  const [imageFilter, setImageFilter] = useState<'ALL' | 'VLLM' | 'SGLANG' | 'IN_USE' | 'ALIAS'>('ALL')


  const imageCounts = useMemo(() => {
    let vllm = 0
    let sglang = 0
    let inUse = 0
    let alias = 0

    for (const img of images) {
      const traits = parseImageTraits(img.full_name, images, img)
      if (traits.framework === 'vLLM') vllm++
      if (traits.framework === 'SGLang') sglang++
      if (img.is_in_use) inUse++
      if (traits.aliasCount > 1) alias++
    }
    return { vllm, sglang, inUse, alias }
  }, [images])

  // 镜像按 Repo 聚合
  const repoGroups = useMemo(() => {
    const map = new Map<string, DockerImageItem[]>()
    for (const img of images) {
      const repo = img.repository || '<none>'
      if (!map.has(repo)) {
        map.set(repo, [])
      }
      map.get(repo)!.push(img)
    }

    const groups: { repository: string; tagsCount: number; images: DockerImageItem[] }[] = []
    for (const [repo, imgList] of map.entries()) {
      groups.push({
        repository: repo,
        tagsCount: imgList.length,
        images: imgList
      })
    }
    return groups.sort((a, b) => a.repository.localeCompare(b.repository))
  }, [images])

  const filteredRepoGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return repoGroups
      .map((group) => {
        const matchImages = group.images.filter((img) => {
          const traits = parseImageTraits(img.full_name, images, img)
          if (imageFilter === 'VLLM' && traits.framework !== 'vLLM') return false
          if (imageFilter === 'SGLANG' && traits.framework !== 'SGLang') return false
          if (imageFilter === 'IN_USE' && !img.is_in_use) return false
          if (imageFilter === 'ALIAS' && traits.aliasCount <= 1) return false

          if (!q) return true

          return (
            group.repository.toLowerCase().includes(q) ||
            img.tag.toLowerCase().includes(q) ||
            img.image_id.toLowerCase().includes(q) ||
            img.full_name.toLowerCase().includes(q) ||
            traits.framework.toLowerCase().includes(q) ||
            traits.driver.toLowerCase().includes(q) ||
            traits.pythonTorch.toLowerCase().includes(q) ||
            traits.modelPatch.toLowerCase().includes(q) ||
            (img.used_by && img.used_by.some((u) => u.toLowerCase().includes(q)))
          )
        })

        if (matchImages.length > 0) {
          return { ...group, images: matchImages, tagsCount: matchImages.length }
        }
        return null
      })
      .filter((g): g is { repository: string; tagsCount: number; images: DockerImageItem[] } => g !== null)
  }, [repoGroups, searchQuery, imageFilter, images])

  // 当前 Tab 下的模型搜索过滤
  const currentList = statusTab === 'RUNNING' ? runningModels : stoppedModels
  const filteredList = currentList.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.engine.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.script || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.image || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const openScript = async (m: ModelCard) => {
    setActiveModel(m)
    setModal({
      show: true,
      type: 'script',
      title: `启动脚本源码 (${m.script})`,
      modelName: m.name,
      content: '正在读取远程脚本源码...',
      loading: true
    })
    try {
      const res = await fetch(`/api/v1/models/script?name=${encodeURIComponent(m.script)}`)
      const data = await res.json()
      setModal((prev) => ({ ...prev, content: data.content || '(空文件)', loading: false }))
    } catch (e: any) {
      setModal((prev) => ({ ...prev, content: `读取失败: ${e.message}`, loading: false }))
    }
  }

  const handleSaveScript = async (newCode: string): Promise<boolean> => {
    if (!activeModel) return false
    const sanitizedCode = (newCode || '').replace(/\r\n/g, '\n').replace(/\r/g, '')
    try {
      const res = await fetch('/api/v1/models/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: activeModel.script,
          content: sanitizedCode
        })
      })
      if (res.ok) {
        setModal((prev) => ({ ...prev, content: sanitizedCode }))
        if (showToast) showToast(`脚本 ${activeModel.script} 保存成功 (已自动标准化 Unix 换行)`, 'success')
        return true
      } else {
        if (showToast) showToast('脚本保存失败', 'error')
        return false
      }
    } catch (e: any) {
      if (showToast) showToast(`保存失败: ${e.message}`, 'error')
      return false
    }
  }

  const openCompose = async (m: ModelCard) => {
    setActiveModel(m)
    setModal({
      show: true,
      type: 'command',
      title: `容器 Compose 编排定义 (${m.service_name || m.name})`,
      modelName: m.name,
      content: '正在读取 docker-compose-models.yml 中的容器定义...',
      loading: true
    })
    try {
      const serviceName = m.service_name || m.container_name || m.name
      const res = await fetch(`/api/v1/models/command?service=${encodeURIComponent(serviceName)}&name=${encodeURIComponent(m.name)}`)
      const data = await res.json()
      setModal((prev) => ({ ...prev, content: data.compose_yaml || '(未找到匹配的 Compose 片段)', loading: false }))
    } catch (e: any) {
      setModal((prev) => ({ ...prev, content: `读取失败: ${e.message}`, loading: false }))
    }
  }

  const [isScriptMaximized, setIsScriptMaximized] = useState(false)

  const openLogs = (m: ModelCard) => {
    // 在独立的新浏览器标签页中全屏查看容器日志（附带模型状态供加载链路分析）
    const queryName = m.container_name || m.service_name || m.name
    const status = m.status ? `&status=${encodeURIComponent(m.status)}` : ''
    window.open(`/?logs=${encodeURIComponent(queryName)}${status}`, '_blank')
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(modal.content)
    if (showToast) showToast('已复制到剪贴板', 'success')
  }

  return (
    <div className="space-y-4">
      {/* 方案 B：全景统一控制台导航与切片栏 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3.5 shadow-sm">
        {/* 左侧状态切片器：[运行中] [未启动] [本地镜像] */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1.5 text-xs font-medium">
          <button
            onClick={() => setStatusTab('RUNNING')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition cursor-pointer ${
              statusTab === 'RUNNING'
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              运行中 ({runningModels.length})
              {loadingCount > 0 && <span className="ml-1 text-amber-400 text-[11px]">[{loadingCount} 加载中]</span>}
            </span>
          </button>

          <button
            onClick={() => setStatusTab('STOPPED')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition cursor-pointer ${
              statusTab === 'STOPPED'
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>
              未启动 ({stoppedModels.length})
              {failedCount > 0 && <span className="ml-1 text-rose-400 text-[11px]">[{failedCount} 异常]</span>}
            </span>
          </button>

          <button
            onClick={() => setStatusTab('IMAGES')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition cursor-pointer ${
              statusTab === 'IMAGES'
                ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5 text-slate-400" />
            <span>
              本地镜像 ({images.length > 0 ? images.length : '镜像'})
            </span>
          </button>
        </div>

        {/* 右侧搜索与全局停止/刷新按钮 */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder={
                statusTab === 'IMAGES'
                  ? '搜索 Repo / Tag / ID...'
                  : `在 ${statusTab === 'RUNNING' ? '运行中' : '未启动'} 中搜索...`
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-56 sm:w-64 font-mono transition"
            />
          </div>

          {statusTab === 'IMAGES' ? (
            <button
              onClick={fetchHostImages}
              disabled={loadingImages}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg text-xs transition flex items-center gap-1.5 font-medium cursor-pointer shrink-0"
              title="重新扫描当前主机上的本地 Docker 镜像"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loadingImages ? 'animate-spin' : ''}`} />
              <span>刷新镜像</span>
            </button>
          ) : (
            <button
              onClick={onStopAll}
              disabled={runningModels.length === 0}
              className="px-3.5 py-2 bg-rose-950/80 hover:bg-rose-900 disabled:opacity-40 disabled:hover:bg-rose-950/80 text-rose-300 border border-rose-800/60 rounded-lg text-xs transition flex items-center gap-1.5 font-medium cursor-pointer disabled:cursor-not-allowed shrink-0"
              title="停止当前主机上所有运行中的大模型容器"
            >
              <Power className="w-3.5 h-3.5 text-rose-400" />
              <span>停止所有容器</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. 运行中模式 (RUNNING) */}
      {/* ========================================================================= */}
      <RunningList
        filteredList={filteredList}
        expandedModels={expandedModels}
        statusTab={statusTab}
        toggleExpand={toggleExpand}
        searchQuery={searchQuery}
        setStatusTab={setStatusTab}
        operatingModel={operatingModel}
        onRestartModel={onRestartModel}
        onStopModel={onStopModel}
        openLogs={openLogs}
        openScript={openScript}
        openCompose={openCompose}
      />

      {/* ========================================================================= */}
      {/* 2. 未启动模式 (STOPPED - 规整 3 列卡片网格) */}
      {/* ========================================================================= */}
      <StoppedList
        filteredList={filteredList}
        statusTab={statusTab}
        searchQuery={searchQuery}
        operatingModel={operatingModel}
        onStartModel={onStartModel}
        openLogs={openLogs}
        openScript={openScript}
        openCompose={openCompose}
      />

      {/* ========================================================================= */}
      {/* 3. 本地镜像模式 (IMAGES - 按 Repo 归类展示) */}
      {/* ========================================================================= */}
      <ImagesPanel
        images={images}
        loadingImages={loadingImages}
        filteredRepoGroups={filteredRepoGroups}
        expandedRepos={expandedRepos}
        copiedImageName={copiedImageName}
        imageFilter={imageFilter}
        setImageFilter={setImageFilter}
        searchQuery={searchQuery}
        statusTab={statusTab}
        imageCounts={imageCounts}
        toggleExpandRepo={toggleExpandRepo}
        handleCopyImage={handleCopyImage}
      />

      {/* 弹窗：启动脚本代码编辑器 (Monaco Editor) 与 Compose 片段查看器 */}
      <ScriptModal
        activeModel={activeModel}
        modal={modal}
        setModal={setModal}
        isScriptMaximized={isScriptMaximized}
        setIsScriptMaximized={setIsScriptMaximized}
        handleCopy={handleCopy}
        handleSaveScript={handleSaveScript}
      />
    </div>
  )
}
