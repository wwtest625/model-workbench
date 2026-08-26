export interface HostConfig {
  id: string
  name: string
  ssh_alias: string
  workspace: string
  gpu_type: string
  api_port: number
  is_default: boolean
}

export interface EnvStatus {
  host_id: string
  host_name: string
  ssh_alias: string
  acs: string
  iommu: string
  cpu_governor: string
  auto_upgrade?: string
  gpu_type: string
  driver_ver: string
  raw: string
}

export interface GPUInfo {
  id: string
  name: string
  usage: number
  mem_used?: number
  mem_total?: number
  mem_pct?: number
  memUsed?: number
  memTotal?: number
  memPct?: number
  temp: number
  power: number
}

export interface ModelCard {
  name: string
  engine: string
  tp: number
  port: number
  script: string
  image: string
  status: 'RUNNING' | 'STOPPED'
  pid?: string
  service_name?: string
  container_name?: string
}

export interface LogFile {
  name: string
  size: string
  time: string
}

export interface ModalState {
  show: boolean
  type: 'script' | 'command' | 'logs'
  title: string
  modelName: string
  content: string
  loading?: boolean
}
