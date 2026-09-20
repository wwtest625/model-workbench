import { DownloadTask, RsyncTask } from '../../types'

export type { DownloadTask, RsyncTask }

export interface LocalAsset {
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

export interface AggregatedModelAsset {
  key: string
  name: string
  locations: {
    server: string
    server_ip: string
    path: string
    type: 'MAIN' | 'ARCHIVE'
    time: string
  }[]
  hasMain: boolean
  hasArchive: boolean
  isDuplicate: boolean
  model_type: string
  architectures: string[]
  torch_dtype: string
  quant_method: string
  max_position: number
}

export interface HubModelItem {
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

export interface DistributeItem {
  name: string
  path?: string
  local_path?: string
  server?: string
  server_ip?: string
  local_status?: string
  local_meta?: LocalAsset
}

export interface DistributeModalState {
  open: boolean
  name: string
  sourceServer: string
  sourcePath: string
  targetServer: string
  targetPath: string
}

export interface LogModalState {
  open: boolean
  dir: string
  name: string
  logs: string
  loading: boolean
}

export interface RsyncLogModalState {
  open: boolean
  name: string
  logs: string
  loading: boolean
}

export interface PreflightCheckResult {
  allowed: boolean
  source_server: string
  source_path: string
  target_server: string
  target_path: string
  model_size_bytes: number
  model_size_human: string
  target_free_bytes: number
  target_free_human: string
  target_total_human: string
  mount_point: string
  message: string
}

export interface VerifyReport {
  passed: boolean
  total_shards: number
  found_shards: number
  declared_shards?: number
  total_layers?: number
  expected_layers?: number
  total_tensors?: number
  naming_anomaly?: boolean
  missing_shards: string[]
  has_index_file: boolean
  header_intact: boolean
  final_layer_found: boolean
  details: string
  verified_at: string
}

export interface TransferTaskItem {
  id: string
  pid: string
  model_name: string
  source_server: string
  source_path: string
  target_server: string
  target_path: string
  status: 'PENDING' | 'SYNCING' | 'INTERRUPTED' | 'VERIFYING' | 'SUCCESS' | 'VERIFY_FAILED' | 'FAILED'
  progress: number
  speed: string
  eta: string
  transferred_desc: string
  total_size: string
  last_log: string
  error_message?: string
  preflight?: PreflightCheckResult
  verify_result?: VerifyReport
  created_at: string
  updated_at: string
  finished_at?: string
}
