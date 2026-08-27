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
  status: 'READY' | 'WARMING_UP' | 'LOADING_WEIGHTS' | 'INIT' | 'FAILED' | 'STOPPED' | 'LOADING' | 'RUNNING'
  status_detail?: string
  ping_ms?: number
  uptime?: string
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

export interface LocalModelAsset {
  name: string
  server: string
  server_ip: string
  path: string
  model_type: string
  architectures: string[]
  torch_dtype: string
  quant_method: string
  max_position: number
  time: string
  type: string
}

export interface HubModelItem {
  id: string
  name: string
  owner: string
  description: string
  downloads: number
  updated_at: string
  file_size: number
  tags: string[]
  local_status: string
  local_path: string
  local_meta?: LocalModelAsset
  download_cmd: string
  rsync_cmd: string
}

export interface DownloadTask {
  pid: string
  model_id: string
  local_dir: string
  local_path: string
  dir_size: string
  total_size?: string
  progress: number
  speed?: string
  eta?: string
  last_log: string
  status: string
}

export interface RsyncTask {
  pid: string
  model_name: string
  source_server: string
  source_path: string
  target_server: string
  target_path: string
  progress: number
  speed: string
  eta: string
  transferred: string
  total_size: string
  last_log: string
  status: string
}

