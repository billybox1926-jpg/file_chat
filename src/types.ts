export interface DocumentFile {
  name: string;
  relativePath: string;
  fullPath: string;
  size: number;
  mtime: number;
  modifiedDate: string;
  extension: string;
}

export interface RetrievalResult {
  file: string;
  score: number;
  tfidf: number;
  vector: number;
  text: string;
}

export interface DiffStats {
  additions: number;
  deletions: number;
}

export interface EditResponse {
  success: boolean;
  dry_run?: boolean;
  diff?: string;
  stats?: DiffStats;
  file?: string;
  message?: string;
  error?: string;
  original_content?: string;
  new_content?: string;
}

export interface WatchEvent {
  id: string;
  timestamp: string;
  type: "created" | "modified" | "deleted";
  filename: string;
  path: string;
  details?: string;
}

export interface AuditRecord {
  timestamp: string;
  action: string;
  file: string;
  details?: Record<string, any>;
  raw?: string;
}

export interface TestSuiteResult {
  passed: boolean;
  code: number;
  output: string;
  rawStdout: string;
  rawStderr: string;
  timestamp: string;
}

export interface ConfigData {
  model: string;
  ollama_url: string;
  provider: string;
  temperature: number;
  top_k: number;
  chunk_size: number;
  chunk_overlap: number;
  git_enabled: boolean;
  audit_log: string;
  session_dir: string;
  watchdog_auto_index: boolean;
  watch_debounce_ms: number;
  retrieval_mode: string;
  require_edit_confirmation?: boolean;
}
