package transfer

import "time"

// TaskStatus 任务生命周期状态枚举
type TaskStatus string

const (
	StatusPending      TaskStatus = "PENDING"       // 排队中
	StatusSyncing      TaskStatus = "SYNCING"       // 传输中
	StatusInterrupted  TaskStatus = "INTERRUPTED"   // 意外中断 (支持断点续传)
	StatusVerifying    TaskStatus = "VERIFYING"     // 传输完成，权重完整性深度质检中
	StatusSuccess      TaskStatus = "SUCCESS"       // 传输与质检全通过，算力机就绪
	StatusVerifyFailed TaskStatus = "VERIFY_FAILED" // 传输退出但分片缺失或损坏
	StatusFailed       TaskStatus = "FAILED"        // 致命错误 (如认证失败、磁盘满)
)

// PreflightCheckResult 传输前空间与环境预检结果
type PreflightCheckResult struct {
	Allowed          bool   `json:"allowed"`           // 是否允许发起传输
	SourceServer     string `json:"source_server"`     // 源端存储服务器
	SourcePath       string `json:"source_path"`       // 源端模型路径
	TargetServer     string `json:"target_server"`     // 目标算力机
	TargetPath       string `json:"target_path"`       // 目标落盘路径
	ModelSizeBytes   int64  `json:"model_size_bytes"`  // 模型所需空间 (字节)
	ModelSizeHuman   string `json:"model_size_human"`  // 模型所需空间 (可读如 230 GB)
	TargetFreeBytes  int64  `json:"target_free_bytes"` // 目标磁盘剩余可用 (字节)
	TargetFreeHuman  string `json:"target_free_human"` // 目标磁盘剩余可用 (可读如 2.0 TB)
	TargetTotalHuman string `json:"target_total_human"`// 目标磁盘总容量
	MountPoint       string `json:"mount_point"`       // 目标落盘所在挂载点
	Message          string `json:"message"`           // 校验说明或拦截原因
}

// VerifyReport 权重完整性质检报告
type VerifyReport struct {
	Passed          bool     `json:"passed"`           // 是否全部通过
	TotalShards     int      `json:"total_shards"`     // 预期分片总数 (官方实际发布)
	FoundShards     int      `json:"found_shards"`     // 实际找到的分片数
	DeclaredShards  int      `json:"declared_shards"`  // 文件名标称切片数 (例如文件名 -of-00130 标称 130)
	MissingShards   []string `json:"missing_shards"`   // 缺失分片列表
	HasIndexFile    bool     `json:"has_index_file"`   // 是否包含 index.json
	HeaderIntact    bool     `json:"header_intact"`    // safetensors 头部解析是否完好
	FinalLayerFound bool     `json:"final_layer_found"`// 是否成功探测到最终层权重 (如 lm_head)
	TotalLayers     int      `json:"total_layers"`     // 实际探测到的 Transformer 隐藏层数
	ExpectedLayers  int      `json:"expected_layers"`  // config.json 中官方声明的隐藏层数
	TotalTensors    int      `json:"total_tensors"`    // 权重张量总数 (例如 96103)
	NamingAnomaly   bool     `json:"naming_anomaly"`   // 是否存在官方命名标称切片偏差 (如 130 标称 vs 125 实际)
	Details         string   `json:"details"`          // 质检明细
	VerifiedAt      string   `json:"verified_at"`      // 质检时间
}

// TransferTask 传输任务模型 (持久化存储于 transfer_tasks.json)
type TransferTask struct {
	ID              string                `json:"id"`
	PID             string                `json:"pid"`
	ModelName       string                `json:"model_name"`
	SourceServer    string                `json:"source_server"`
	SourcePath      string                `json:"source_path"`
	TargetServer    string                `json:"target_server"`
	TargetPath      string                `json:"target_path"`
	Status          TaskStatus            `json:"status"`
	Progress        int                   `json:"progress"` // 0 ~ 100
	Speed           string                `json:"speed"`
	ETA             string                `json:"eta"`
	TransferredDesc string                `json:"transferred_desc"`
	TotalSize       string                `json:"total_size"`
	LastLog         string                `json:"last_log"`
	ErrorMessage    string                `json:"error_message,omitempty"`
	Preflight       *PreflightCheckResult `json:"preflight,omitempty"`
	VerifyResult    *VerifyReport         `json:"verify_result,omitempty"`
	CreatedAt       time.Time             `json:"created_at"`
	UpdatedAt       time.Time             `json:"updated_at"`
	FinishedAt      *time.Time            `json:"finished_at,omitempty"`
}
