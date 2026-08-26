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
  onAddHost
}) => {
  const [showAddModal, setShowAddModal] = useState(false)
  const [newHost, setNewHost] = useState<Partial<HostConfig>>({
    id: '',
    name: '',
    ssh_alias: '',
    workspace: '/home/workspace',
    gpu_type: 'metax',
    api_port: 8000
  })

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newHost.id || !newHost.ssh_alias) return
    onAddHost(newHost as HostConfig)
    setShowAddModal(false)
    setNewHost({ id: '', name: '', ssh_alias: '', workspace: '/home/workspace', gpu_type: 'metax', api_port: 8000 })
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
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700"
              title="添加新服务器"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            {currentHost?.workspace || '/home/workspace'} · {envStatus?.driver_ver || 'MACA 集群'}
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
            onClick={async () => {
              if (!confirm('确认关闭系统自动更新配置（20auto-upgrades & 10periodic）？')) return
              try {
                await fetch('/api/v1/env/fix-auto-upgrade', { method: 'POST' })
                onCheckEnv()
              } catch (e: any) {
                console.error('修复失败:', e)
              }
            }}
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-bold text-sm text-slate-100 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-400" /> 添加新算力服务器 (模式自动复用)
            </h3>
            <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">唯一标识 (ID)</label>
                <input
                  type="text"
                  required
                  placeholder="例如: metax-148"
                  value={newHost.id}
                  onChange={(e) => setNewHost({ ...newHost, id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">显示名称</label>
                <input
                  type="text"
                  required
                  placeholder="例如: 148 · 沐曦 8卡集群"
                  value={newHost.name}
                  onChange={(e) => setNewHost({ ...newHost, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">SSH 别名 / IP</label>
                <input
                  type="text"
                  required
                  placeholder="例如: 192.2.0.148"
                  value={newHost.ssh_alias}
                  onChange={(e) => setNewHost({ ...newHost, ssh_alias: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">GPU 类型</label>
                  <select
                    value={newHost.gpu_type}
                    onChange={(e) => setNewHost({ ...newHost, gpu_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                  >
                    <option value="metax">沐曦 MetaX (mx-smi)</option>
                    <option value="hygon">海光 Hygon (hy-smi)</option>
                    <option value="nvidia">NVIDIA (nvidia-smi)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">默认 API 端口</label>
                  <input
                    type="number"
                    value={newHost.api_port}
                    onChange={(e) => setNewHost({ ...newHost, api_port: parseInt(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  取消
                </button>
                <button type="submit" className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold">
                  添加并连接
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  )
}
