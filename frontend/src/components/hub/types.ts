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
