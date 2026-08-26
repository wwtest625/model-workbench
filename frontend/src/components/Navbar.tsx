import React, { useState } from 'react'
import { Server, Cpu, CheckCircle2, RotateCw, Network, Plus, ShieldCheck, Zap } from 'lucide-react'
import { HostConfig, EnvStatus } from '../types'

interface NavbarProps {
  hosts: HostConfig[]
  currentHost: HostConfig | null
  envStatus: EnvStatus | null
  refreshing: boolean
  onSwitchHost: (hostId: string) => void
  onRefresh: () => void
  onRunMCCL: () => void
  onCheckEnv: () => void
  onAddHost: (host: HostConfig) => void
  openConfirm?: (opts: any) => void
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void
}

export const Navbar: React.FC<NavbarProps> = ({
  hosts,
  currentHost,
  envStatus,
  refreshing,
  onSwitchHost,
  onRefresh,
  onRunMCCL,
  onCheckEnv,
  onAddHost,
  openConfirm,
  showToast
}) => {
  const [showAddModal, setShowAddModal] = useState(false)
  const [addingLoading, setAddingLoading] = useState(false)
  const [formData, setFormData] = useState({
    ip: '',
    user: 'root',
    password: '',
    name: '',
    workspace: '/home/workspace',
    gpu_type: 'auto',
    port: 22
  })

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.ip) return
    setAddingLoading(true)
    try {
      const res = await fetch('/api/v1/hosts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      const data = await res.json()
      if (res.ok) {
        if (showToast) showToast(data.message || '主机添加成功', 'success')
        setShowAddModal(false)
        setFormData({
          ip: '',
          user: 'root',
          password: '',
          name: '',
          workspace: '/home/workspace',
          gpu_type: 'auto',
          port: 22
        })
        onRefresh()
      } else {
        if (showToast) showToast(data.error || '添加主机失败', 'error')
      }
    } catch (err: any) {
      if (showToast) showToast(`添加失败: ${err.message}`, 'error')
    } finally {
      setAddingLoading(false)
    }
  }

  const handleFixAutoUpgrade = () => {
    if (openConfirm) {
      openConfirm({
        title: '系统自动更新关闭确认',
        message: '确定要关闭服务器自动更新配置（20auto-upgrades & 10periodic）并禁用后台无人值守更新服务吗？',
        detail: '目标主机: ' + (currentHost?.name || '') + ' (' + (currentHost?.ssh_alias || '') + ') · 彻底杜绝内核自动升级破坏 GPU 驱动',
        confirmText: '确认关闭',
        type: 'warning',
        onConfirm: async () => {
          try {
            await fetch('/api/v1/env/fix-auto-upgrade', { method: 'POST' })
            onCheckEnv()
            if (showToast) showToast('已成功关闭自动更新，GPU 环境已处于稳态', 'success')
          } catch (e: any) {
            if (showToast) showToast('修复失败: ' + e.message, 'error')
          }
        }
      })
    }
  }

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
      {/* 左侧 Logo 与主机切换 */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-100 shadow-sm">
          <Server className="w-5 h-5 text-slate-300" />
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-bold text-lg text-white tracking-wide">Model-Workbench</h1>
            {/* 主机下拉切换选择器 */}
            <div className="relative">
              <select
                value={currentHost?.id || ''}
                onChange={(e) => onSwitchHost(e.target.value)}
                className="bg-slate-950 border border-slate-700 hover:border-slate-600 rounded-lg px-3 py-1 text-sm text-slate-200 font-medium focus:outline-none cursor-pointer"
              >
                {hosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.ssh_alias})
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 cursor-pointer"
              title="添加新算力服务器"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            {currentHost?.workspace || '/home/workspace'} · {envStatus?.driver_ver || 'GPU 集群'}
          </p>
        </div>
      </div>

      {/* 中间环境预检胶囊状态 */}
      <div className="flex items-center gap-2.5 bg-slate-950/80 border border-slate-800 rounded-lg px-3.5 py-1.5 text-xs">
        <span className="text-slate-400 font-medium flex items-center gap-1">
          <ShieldCheck className="w-4 h-4 text-slate-400" /> 环境:
        </span>
        <span className="inline-flex items-center gap-1 text-slate-300 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> ACS: {envStatus?.acs || 'OFF'}
        </span>
        <span className="inline-flex items-center gap-1 text-slate-300 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> IOMMU: {envStatus?.iommu || 'OFF'}
        </span>
        <span className="inline-flex items-center gap-1 text-slate-300 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> CPU: {envStatus?.cpu_governor || 'perf'}
        </span>
        <span className="inline-flex items-center gap-1 text-slate-300 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
          <span className={`w-2 h-2 rounded-full ${envStatus?.auto_upgrade === 'ON' ? 'bg-rose-500' : 'bg-emerald-400'}`} /> AutoUpgrade: {envStatus?.auto_upgrade || 'OFF'}
        </span>

        {envStatus?.auto_upgrade === 'ON' ? (
          <button
            onClick={handleFixAutoUpgrade}
            className="ml-1 px-2 py-0.5 bg-rose-600/20 text-rose-300 border border-rose-500/40 rounded text-xs hover:bg-rose-600/30 font-medium"
          >
            一键关闭
          </button>
        ) : (
          <button onClick={onCheckEnv} className="ml-1 text-slate-400 hover:text-slate-200 font-medium text-xs">
            体检
          </button>
        )}
      </div>

      {/* 右侧快捷操作 */}
      <div className="flex items-center gap-3">
        <button
          onClick={onRunMCCL}
          className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm text-slate-200 flex items-center gap-2 transition font-medium"
        >
          <Network className="w-4 h-4 text-slate-400" />
          <span>跑 MCCL 通信基准</span>
        </button>
        <button
          onClick={onRefresh}
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-medium text-white flex items-center gap-2 shadow-sm transition"
        >
          <RotateCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>刷新</span>
        </button>
      </div>

      {/* 添加新服务器 Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl text-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-400" /> 添加新算力服务器 (支持密码一键打通免密)
              </h3>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-slate-400 mb-1 font-medium">
                    主机 IP 地址 <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="例如: 192.7.9.55"
                    value={formData.ip}
                    onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">SSH 端口</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">SSH 用户名</label>
                  <input
                    type="text"
                    required
                    value={formData.user}
                    onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">SSH 密码 (用于自动打通免密)</label>
                  <input
                    type="password"
                    placeholder="例如: 123"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">显示名称 / 备注 (可选)</label>
                <input
                  type="text"
                  placeholder="例如: 55 · 海光DCU (8卡)"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">GPU 架构类型</label>
                  <select
                    value={formData.gpu_type}
                    onChange={(e) => setFormData({ ...formData, gpu_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none text-sm"
                  >
                    <option value="auto">自动探测 (推荐)</option>
                    <option value="hygon">海光 Hygon DCU (hy-smi)</option>
                    <option value="metax">沐曦 MetaX (mx-smi)</option>
                    <option value="nvidia">NVIDIA GPU (nvidia-smi)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">远程工作目录</label>
                  <input
                    type="text"
                    value={formData.workspace}
                    onChange={(e) => setFormData({ ...formData, workspace: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none font-mono text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={addingLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium shadow-sm transition flex items-center gap-2"
                >
                  {addingLoading ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>正在连接与打通...</span>
                    </>
                  ) : (
                    <span>一键添加并连接</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  )
}
