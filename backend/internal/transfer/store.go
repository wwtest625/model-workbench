package transfer

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

// TaskStore 持久化传输任务数据库 (JSON 格式原子存储)
type TaskStore struct {
	filePath string
	mu       sync.RWMutex
}

var defaultStore *TaskStore
var storeOnce sync.Once

func GetTaskStore() *TaskStore {
	storeOnce.Do(func() {
		dataDir := "/root/metax-workbench/data"
		_ = os.MkdirAll(dataDir, 0755)
		defaultStore = &TaskStore{
			filePath: filepath.Join(dataDir, "transfer_tasks.json"),
		}
	})
	return defaultStore
}

func (s *TaskStore) loadUnlocked() (map[string]*TransferTask, error) {
	if _, err := os.Stat(s.filePath); os.IsNotExist(err) {
		return make(map[string]*TransferTask), nil
	}

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return nil, fmt.Errorf("读取传输任务文件失败: %w", err)
	}

	if len(data) == 0 {
		return make(map[string]*TransferTask), nil
	}

	var taskMap map[string]*TransferTask
	if err := json.Unmarshal(data, &taskMap); err != nil {
		// 容错: 尝试按列表反序列化
		var list []*TransferTask
		if err2 := json.Unmarshal(data, &list); err2 == nil {
			taskMap = make(map[string]*TransferTask)
			for _, t := range list {
				taskMap[t.ID] = t
			}
			return taskMap, nil
		}
		return make(map[string]*TransferTask), nil
	}
	return taskMap, nil
}

func (s *TaskStore) saveUnlocked(taskMap map[string]*TransferTask) error {
	data, err := json.MarshalIndent(taskMap, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化传输任务失败: %w", err)
	}

	tmpFile := s.filePath + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return fmt.Errorf("写入临时任务文件失败: %w", err)
	}
	return os.Rename(tmpFile, s.filePath)
}

// UpsertTask 保存或更新任务记录
func (s *TaskStore) UpsertTask(task *TransferTask) error {
	if task == nil || task.ID == "" {
		return fmt.Errorf("任务对象或 ID 不能为空")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	taskMap, err := s.loadUnlocked()
	if err != nil {
		return err
	}

	taskMap[task.ID] = task
	return s.saveUnlocked(taskMap)
}

// GetTask 获取指定任务
func (s *TaskStore) GetTask(id string) (*TransferTask, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	taskMap, err := s.loadUnlocked()
	if err != nil {
		return nil, err
	}

	task, exists := taskMap[id]
	if !exists {
		return nil, fmt.Errorf("任务不存在: %s", id)
	}
	return task, nil
}

// ListTasks 列出所有任务 (按创建时间倒序)
func (s *TaskStore) ListTasks() ([]TransferTask, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	taskMap, err := s.loadUnlocked()
	if err != nil {
		return nil, err
	}

	list := make([]TransferTask, 0, len(taskMap))
	for _, t := range taskMap {
		if t != nil {
			list = append(list, *t)
		}
	}

	sort.Slice(list, func(i, j int) bool {
		return list[i].CreatedAt.After(list[j].CreatedAt)
	})

	return list, nil
}

// DeleteTask 删除指定任务记录
func (s *TaskStore) DeleteTask(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	taskMap, err := s.loadUnlocked()
	if err != nil {
		return err
	}

	delete(taskMap, id)
	return s.saveUnlocked(taskMap)
}
