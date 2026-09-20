import React, { useState, useEffect } from 'react'
import {
  Download,
  Terminal,
  Activity,
  Send,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  Play,
  Square,
  ShieldCheck,
  RotateCcw,
  Trash2,
  FileText,
  Clock,
  HardDrive,
  Loader2
} from 'lucide-react'
import { RsyncTask, DownloadTask, TransferTaskItem, VerifyReport } from './types'

interface TaskBoardPanelProps {
  rsyncTasks?: RsyncTask[]
  downloadTasks?: DownloadTask[]
  openLogModal?: (dir: string, name: string) => void
  openRsyncLogModal?: (name: string) => void
}

export const TaskBoardPanel: React.FC<TaskBoardPanelProps> = ({
  downloadTasks = [],
  openLogModal
}) => {
  const [transferTasks, setTransferTasks] = useState<TransferTaskItem[]>([])
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active')
  const [verifyingId, setVerifyingId] = useState<string>('')
  const [resumingId, setResumingId] = useState<string>('')
  const [selectedVerifyReport, setSelectedVerifyReport] = useState<{ name: string; report: VerifyReport } | null>(null)
  const [logModal, setLogModal] = useState<{ open: boolean; taskName: string; logs: string; loading: boolean }>({
    open: false,
    taskName: '',
    logs: '',
    loading: false
  })

  // 轮询拉取最新的全生命周期传输任务
  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/v1/transfer/tasks')
      if (res.ok) {
        const data = await res.json()
        setTransferTasks(data.tasks || [])
      }
    } catch (e) {
      console.error('获取传输管理任务失败', e)
    }
  }

  useEffect(() => {
    fetchTasks()
    const timer = setInterval(() => {
      if (document.hidden) return
      fetchTasks()
    }, 2500)
    return () => clearInterval(timer)
  }, [])

  // 操作: 断点续传
  const handleResume = async (taskId: string) => {
    setResumingId(taskId)
    try {
      const res = await fetch('/api/v1/transfer/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId })
      })
      if (res.ok) {
        await fetchTasks()
      }
    } catch (e) {
      console.error('续传失败', e)
    } finally {
      setResumingId('')
    }
  }

  // 操作: 停止任务
  const handleStop = async (taskId: string) => {
    try {
      const res = await fetch('/api/v1/transfer/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId })
      })
      if (res.ok) {
        await fetchTasks()
      }
    } catch (e) {
      console.error('停止任务失败', e)
    }
  }

  // 操作: 触发重新质检
  const handleVerify = async (taskId: string) => {
    setVerifyingId(taskId)
    try {
      const res = await fetch('/api/v1/transfer/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId })
      })
      if (res.ok) {
        const report = await res.json()
        const task = transferTasks.find((t) => t.id === taskId)
        if (task) {
          setSelectedVerifyReport({ name: task.model_name, report })
        }
        await fetchTasks()
      }
    } catch (e) {
      console.error('质检失败', e)
    } finally {
      setVerifyingId('')
    }
  }

  // 操作: 删除历史任务
  const handleDelete = async (taskId: string) => {
    try {
      const res = await fetch(`/api/v1/transfer/tasks/${taskId}`, { method: 'DELETE' })
      if (res.ok) {
        setTransferTasks((prev) => prev.filter((t) => t.id !== taskId))
      }
    } catch (e) {
      console.error('删除任务失败', e)
    }
  }

  // 操作: 查看实时日志
  const handleOpenLog = async (task: TransferTaskItem) => {
    setLogModal({ open: true, taskName: task.model_name, logs: '正在拉取远程传输日志...', loading: true })
    try {
      const res = await fetch(`/api/v1/transfer/log?task_id=${task.id}`)
      const data = await res.json()
      setLogModal({
        open: true,
        taskName: task.model_name,
        logs: data.logs || '暂无日志输出',
        loading: false
      })
    } catch (e: any) {
      setLogModal({
        open: true,
        taskName: task.model_name,
        logs: '读取日志失败: ' + e.message,
        loading: false
      })
    }
  }

  const formatSourceServer = (ip: string) => {
    if (ip === '192.2.29.9') return '29 (test03 历史库)'
    if (ip === '192.2.56.76') return '76 (主力存储)'
    return ip || '76'
  }

  const formatTargetServer = (ip: string) => {
    if (ip === '192.2.0.146') return '146 (沐曦 16卡)'
    if (ip === '192.7.9.55') return '55 (海光 8卡)'
    return ip || '146'
  }

  const activeTasks = transferTasks.filter(
    (t) => t.status === 'SYNCING' || t.status === 'PENDING' || t.status === 'INTERRUPTED' || t.status === 'VERIFYING'
  )
  const historyTasks = transferTasks.filter(
    (t) => t.status === 'SUCCESS' || t.status === 'VERIFY_FAILED' || t.status === 'FAILED'
  )

  const hasContent = activeTasks.length > 0 || historyTasks.length > 0 || downloadTasks.length > 0
  if (!hasContent) return null

  return (
    <div className="space-y-3 font-mono">
      {/* 顶部控制与视图切换栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 font-bold text-slate-200">
            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span>模型传输与分发生命周期中心</span>
          </span>
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1 rounded-md transition text-xs flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-cyan-950 text-cyan-200 border border-cyan-700/60 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>进行中与异常</span>
              {(activeTasks.length > 0 || downloadTasks.length > 0) && (
                <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-cyan-500/20 text-cyan-300">
                  {activeTasks.length + downloadTasks.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 rounded-md transition text-xs flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-slate-800 text-slate-100 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>传输档案与质检报告</span>
              {historyTasks.length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-800 text-slate-300">
                  {historyTasks.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <span className="text-[11px] text-slate-500 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> 每 2.5 秒自动同步状态
        </span>
      </div>

      {/* 视图 1: 活跃与中断任务 */}
      {activeTab === 'active' && (
        <div className="grid grid-cols-1 gap-3">
          {activeTasks.length === 0 && downloadTasks.length === 0 && (
            <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-xl text-center text-xs text-slate-400">
              当前暂无活跃的传输或下载任务。在下方选择模型后点击【分发】即可启动受管传输。
            </div>
          )}

          {activeTasks.map((t) => {
            const isInterrupted = t.status === 'INTERRUPTED'
            const isVerifying = t.status === 'VERIFYING'

            let borderClass = 'border-cyan-500/50'
            let bgBadge = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
            if (isInterrupted) {
              borderClass = 'border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
              bgBadge = 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            } else if (isVerifying) {
              borderClass = 'border-purple-500/60'
              bgBadge = 'bg-purple-500/20 text-purple-300 border-purple-500/40'
            }

            return (
              <div
                key={t.id}
                className={`bg-slate-900/95 border-2 ${borderClass} rounded-xl p-4 shadow-lg space-y-3 transition`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className={`px-2 py-0.5 rounded border text-[11px] font-bold flex items-center gap-1 ${bgBadge}`}>
                      {isInterrupted ? (
                        <>
                          <AlertTriangle className="w-3 h-3 text-amber-400" /> 传输意外中断
                        </>
                      ) : isVerifying ? (
                        <>
                          <Loader2 className="w-3 h-3 text-purple-400 animate-spin" /> 权重完整性质检中
                        </>
                      ) : (
                        <>
                          <Send className="w-3 h-3" /> 分发传输中
                        </>
                      )}
                    </span>
                    <span className="font-bold text-slate-100 text-sm">{t.model_name}</span>
                    <span className="text-slate-400 text-xs">
                      {formatSourceServer(t.source_server)} ➡️ <strong className="text-cyan-300">{formatTargetServer(t.target_server)}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 text-xs">
                    {t.speed && (
                      <span className={isInterrupted ? 'text-amber-400' : 'text-cyan-400'}>
                        {t.speed}
                      </span>
                    )}

                    {/* 操作按钮区 */}
                    {isInterrupted ? (
                      <button
                        onClick={() => handleResume(t.id)}
                        disabled={resumingId === t.id}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-md flex items-center gap-1 font-semibold transition cursor-pointer text-xs shadow-sm"
                      >
                        {resumingId === t.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        <span>一键断点续传</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStop(t.id)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-300 rounded border border-slate-700 flex items-center gap-1 transition cursor-pointer text-xs"
                      >
                        <Square className="w-3 h-3" />
                        <span>暂停</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleOpenLog(t)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded border border-slate-700 flex items-center gap-1 transition cursor-pointer text-xs"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>查看日志</span>
                    </button>
                  </div>
                </div>

                {/* 意外中断提示条 */}
                {isInterrupted && (
                  <div className="p-2.5 bg-amber-950/50 border border-amber-700/60 rounded-lg text-amber-200 text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{t.error_message || '传输由于网络闪断或进程关闭中断，断点已安全留存，可随时一键续传。'}</span>
                    </span>
                  </div>
                )}

                {/* 平稳进度条 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>
                      状态: <strong className={isInterrupted ? 'text-amber-300' : 'text-cyan-300'}>
                        {t.transferred_desc || `进度 ${t.progress}%`}
                      </strong> ({t.progress}%)
                    </span>
                    <span className="text-slate-500 font-mono">目标: {t.target_path}</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      style={{ width: `${Math.max(4, t.progress)}%` }}
                      className={`h-full rounded-full transition-all duration-300 ${
                        isInterrupted
                          ? 'bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                          : isVerifying
                          ? 'bg-gradient-to-r from-purple-500 to-indigo-400 shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                          : 'bg-gradient-to-r from-cyan-500 to-emerald-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                      }`}
                    />
                  </div>
                </div>
              </div>
            )
          })}

          {/* 历史兼容: 下载中任务 */}
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
                <div className="flex items-center gap-3 text-xs text-slate-300">
                  {t.dir_size && <span>已下载: <strong className="text-amber-300">{t.dir_size}</strong></span>}
                  {t.speed && <span>速率: <strong className="text-amber-400">{t.speed}</strong></span>}
                  {openLogModal && (
                    <button
                      onClick={() => openLogModal(t.local_dir, t.model_id)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700 flex items-center gap-1 transition cursor-pointer text-xs"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>查看日志</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 视图 2: 传输历史档案与质检报告 */}
      {activeTab === 'history' && (
        <div className="grid grid-cols-1 gap-3">
          {historyTasks.length === 0 ? (
            <div className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-xl text-center text-xs text-slate-400">
              暂无已归档的历史传输任务。
            </div>
          ) : (
            historyTasks.map((t) => {
              const isPassed = t.status === 'SUCCESS'
              const isVerifyFailed = t.status === 'VERIFY_FAILED'

              return (
                <div
                  key={t.id}
                  className={`bg-slate-900/90 border rounded-xl p-4 shadow space-y-2.5 transition ${
                    isPassed
                      ? 'border-emerald-700/50 hover:border-emerald-500/80'
                      : 'border-rose-700/50 hover:border-rose-500/80'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      {isPassed ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> 权重质检通过 (就绪)
                        </span>
                      ) : isVerifyFailed ? (
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-bold flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> 质检异常 (分片缺漏)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-bold">
                          分发失败
                        </span>
                      )}
                      <span className="font-bold text-slate-100 text-sm">{t.model_name}</span>
                      <span className="text-slate-400 text-xs">
                        {formatSourceServer(t.source_server)} ➡️ <strong className="text-cyan-300">{formatTargetServer(t.target_server)}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      {t.verify_result && (
                        <button
                          onClick={() => setSelectedVerifyReport({ name: t.model_name, report: t.verify_result! })}
                          className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 rounded border border-emerald-700/60 flex items-center gap-1 transition cursor-pointer text-xs"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>质检证书</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleVerify(t.id)}
                        disabled={verifyingId === t.id}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-purple-300 rounded border border-slate-700 flex items-center gap-1 transition cursor-pointer text-xs"
                      >
                        {verifyingId === t.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span>重新质检</span>
                      </button>

                      <button
                        onClick={() => handleOpenLog(t)}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition cursor-pointer text-xs"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDelete(t.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition cursor-pointer"
                        title="删除记录"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2">
                    <span className="flex items-center gap-3">
                      <span>落盘路径: <strong className="text-slate-200">{t.target_path}</strong></span>
                      {t.total_size && <span>大小: <strong className="text-slate-200">{t.total_size}</strong></span>}
                    </span>
                    <span>归档时间: {new Date(t.updated_at).toLocaleString()}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* 质检报告明细弹窗 (Verify Report Modal) */}
      {selectedVerifyReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">模型权重完整性质检报告</h3>
                  <p className="text-xs text-slate-400">{selectedVerifyReport.name}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedVerifyReport(null)}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div
                className={`p-3.5 rounded-xl border flex items-center gap-3 ${
                  selectedVerifyReport.report.passed
                    ? 'bg-emerald-950/40 border-emerald-700 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-700 text-rose-200'
                }`}
              >
                {selectedVerifyReport.report.passed ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-rose-400 shrink-0" />
                )}
                <div className="space-y-0.5">
                  <div className="font-bold text-sm">
                    {selectedVerifyReport.report.passed ? '质检全项合格 · 模型完好就绪' : '质检未通过 · 存在缺漏风险'}
                  </div>
                  <div className="text-[11px] opacity-80">{selectedVerifyReport.report.details}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-slate-400 text-[11px]">物理落盘 / 官方发布分片</div>
                  <div className="text-base font-bold text-emerald-400">
                    {selectedVerifyReport.report.found_shards} / {selectedVerifyReport.report.total_shards} 个
                  </div>
                  {selectedVerifyReport.report.declared_shards && selectedVerifyReport.report.declared_shards > selectedVerifyReport.report.total_shards && (
                    <div className="text-[10px] text-amber-400">
                      (文件名标称 {selectedVerifyReport.report.declared_shards}，官方实发 {selectedVerifyReport.report.total_shards})
                    </div>
                  )}
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-slate-400 text-[11px]">模型隐藏层架构 (Transformer Layers)</div>
                  <div className="text-base font-bold text-emerald-400">
                    {selectedVerifyReport.report.total_layers || 0} / {selectedVerifyReport.report.expected_layers || 0} 层 (100% 闭环)
                  </div>
                  {selectedVerifyReport.report.total_tensors && (
                    <div className="text-[10px] text-slate-400">
                      共覆盖 {selectedVerifyReport.report.total_tensors.toLocaleString()} 个权重张量
                    </div>
                  )}
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-slate-400 text-[11px]">Safetensors Header 健全度</div>
                  <div className="text-sm font-bold text-emerald-400">
                    {selectedVerifyReport.report.header_intact ? '✅ 头部元数据正常' : '❌ 头部破损'}
                  </div>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-slate-400 text-[11px]">最终输出层权重探测</div>
                  <div className="text-sm font-bold text-emerald-400">
                    {selectedVerifyReport.report.final_layer_found ? '✅ lm_head / norm 已就绪' : '⚠️ 未探测到'}
                  </div>
                </div>
              </div>

              {selectedVerifyReport.report.missing_shards && selectedVerifyReport.report.missing_shards.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-rose-400 font-bold">缺失的分片列表 ({selectedVerifyReport.report.missing_shards.length}):</div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-rose-900/50 max-h-32 overflow-y-auto font-mono text-[11px] text-rose-300 space-y-0.5">
                    {selectedVerifyReport.report.missing_shards.map((s, idx) => (
                      <div key={idx}>• {s}</div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[11px] text-slate-500 text-right">
                质检时间: {selectedVerifyReport.report.verified_at}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 实时传输日志弹窗 */}
      {logModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-slate-100">传输实时日志: {logModal.taskName}</h3>
              </div>
              <button
                onClick={() => setLogModal((prev) => ({ ...prev, open: false }))}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-950">
              <pre className="p-4 bg-black/60 rounded-xl text-slate-300 font-mono text-xs max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
                {logModal.logs}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
