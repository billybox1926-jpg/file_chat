# FileChat

A local-first document retrieval and file-editing assistant. Combines hybrid search (TF-IDF + vector similarity) over a document corpus with diff-based editing, undo/redo, audit logging, and live filesystem watching — available both as a Python CLI/REPL and as a React web workbench.

- **`file_chat.py`** — the engine and CLI. Indexing, retrieval, diff generation, undo stack, audit log, AI providers.
- **`server.ts`** — an Express + Vite server that wraps the CLI in a REST API and serves the UI.
- **`src/`** — the FileChat Studio React frontend.

## Features

- **Hybrid retrieval** — 60% TF-IDF lexical scoring blended with 40% vector similarity. Uses FAISS when installed, falls back to pure-Python cosine similarity otherwise.
- **Incremental indexing** — re-indexes a single changed file without rebuilding the whole corpus.
- **Diff-based edits** — every change is previewable as a unified diff before it touches disk (`--dry-run`).
- **Undo / redo** — snapshot stack with edits persisted to `.filechat_sessions/snapshots.jsonl`.
- **Audit trail** — every dry-run and applied edit appended as JSONL to `audit.log`.
- **Live watching** — polling watchdog auto-reindexes files as they change.
- **Batch editing** — apply one transformation across many files at once.
- **Pluggable AI** — Gemini, Ollama, or a deterministic offline fallback.
- **Workspace isolation** — all file access is confined to `workspace_docs/`; traversal, URL-encoded escapes, null bytes, and escaping symlinks are rejected.

## Requirements

- **Python 3.10+** — the engine runs on the standard library alone.
- **Node.js 20+** — only needed for the web UI. Developed against Node 22.

All Python dependencies are optional and degrade gracefully when absent:

| Package | Enables | Without it |
|---|---|---|
| `numpy` | array math for the vector index | pure-Python fallback |
| `faiss-cpu` | fast approximate vector search | pure-Python cosine similarity |
| `watchdog` | native filesystem events | built-in polling watchdog |
| `pypdf` | text extraction from PDFs | PDFs indexed as a placeholder |

```bash
pip install numpy faiss-cpu watchdog pypdf   # all optional
```

## Quick start

### CLI

```bash
# Interactive REPL against ./workspace_docs
python file_chat.py -i

# One-off retrieval query (prints JSON)
python file_chat.py workspace_docs --query "rate limit"

# Preview an edit without writing
python file_chat.py workspace_docs --edit api_service.py "replace '8080' with '9090'" --dry-run

# Apply it
python file_chat.py workspace_docs --edit api_service.py "replace '8080' with '9090'"
```

> **Note:** on Windows the interpreter is usually `python`, not `python3`.

### Web UI

```bash
npm install
npm run dev          # http://localhost:3000
```

Set `GEMINI_API_KEY` to enable AI-assisted editing — copy `.env.example` to `.env` and fill it in. Without a key the server falls back to the deterministic offline engine.

## CLI reference

### Flags

| Flag | Description |
|---|---|
| `directory` | Target document directory (default: `workspace_docs`) |
| `-i`, `--interactive` | Launch the interactive REPL |
| `-c`, `--config PATH` | Path to config file (default: `config.json`) |
| `--edit FILE INSTRUCTION` | Run a single edit |
| `--dry-run` | Preview the diff without applying it |
| `--query TEXT` | Run one retrieval search and print JSON |
| `--test-suite` | Run internal self-tests |

### REPL commands

| Command | Description |
|---|---|
| `:docs` | List indexed files and chunk counts |
| `:query <text>` | Hybrid TF-IDF + vector search |
| `:edit <file> <instruction>` | Generate a diff and apply it |
| `:dry-run <file> <instruction>` | Preview a diff without writing |
| `:undo` | Revert the most recent edit |
| `:redo` | Re-apply a reverted edit |
| `:audit` | Show the recent audit trail |
| `:help` | Show the command list |
| `:exit`, `:quit` | Leave the REPL |

Anything else is treated as a chat prompt, answered with retrieved document context.

## Configuration

`config.json` in the working directory; missing keys fall back to the defaults below.

| Key | Default | Description |
|---|---|---|
| `provider` | `gemini` | `gemini`, `ollama`, or `offline` |
| `model` | `gemini-3.7-flash` | Model name passed to the provider |
| `ollama_url` | `http://localhost:11434` | Ollama API base URL |
| `temperature` | `0.2` | Sampling temperature |
| `top_k` | `4` | Chunks retrieved per query |
| `chunk_size` | `500` | Characters per chunk |
| `chunk_overlap` | `50` | Overlap between adjacent chunks |
| `git_enabled` | `true` | Auto-commit applied edits |
| `audit_log` | `audit.log` | Audit trail path |
| `session_dir` | `.filechat_sessions` | Undo snapshot directory |
| `watchdog_auto_index` | `true` | Start the watcher on launch |
| `watch_debounce_ms` | `300` | Watcher debounce interval |
| `retrieval_mode` | `hybrid_tfidf_vector` | Retrieval strategy |

## HTTP API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Server status and key presence |
| `GET` `POST` | `/api/config` | Read / write configuration |
| `GET` | `/api/files` | List workspace documents |
| `GET` | `/api/files/content` | Read one file |
| `POST` | `/api/files/save` | Create or overwrite a file |
| `DELETE` | `/api/files/delete` | Delete a file |
| `POST` | `/api/retrieval/query` | Hybrid search |
| `POST` | `/api/edit/preview` | Generate a diff (no write) |
| `POST` | `/api/edit/apply` | Apply an edit |
| `POST` | `/api/edit/batch` | Multi-file transformation |
| `POST` | `/api/terminal/exec` | Run a REPL command |
| `GET` | `/api/audit` | Audit records |
| `GET` | `/api/watchdog/events` | Recent filesystem events |
| `POST` | `/api/tests/run` | Run the Python test suite |

Every path-accepting endpoint validates against the workspace root and returns `403` for anything that escapes it.

## Development

```bash
npm test                                    # TypeScript security + API tests (40 tests)
npm run lint                                # tsc --noEmit
python -m pytest test_file_chat.py -v       # Python engine tests (14 tests)
npm run build                               # production bundle
npm start                                   # serve the build
```

`npm test` sets `NODE_ENV=test` via `cross-env` so it works identically on Windows, macOS, and Linux. That flag is required — it suppresses the filesystem watcher and the `app.listen` call, without which the test process never exits.

### Project layout

```
file_chat.py              Engine + CLI
test_file_chat.py         Python test suite
server.ts                 Express API + Vite dev server
src/
  App.tsx                 Root component and tab shell
  components/             Terminal, diff, explorer, retrieval, watchdog, batch, tests, audit
  hooks/                  Keyboard shortcut manager
  utils/security.ts       Workspace path validation, instruction parsing
  types.ts                Shared types
tests/, __tests__/        TypeScript test suites
workspace_docs/           Default document corpus
config.json               Runtime configuration
```

### Keyboard shortcuts

`Alt` + `1`–`8` switch tabs. `Ctrl` + `Z` triggers file-level undo.

## Security

All filesystem access is confined to `workspace_docs/`. `src/utils/security.ts` rejects parent traversal, URL-encoded and double-encoded escapes, backslash variants, null-byte injection, and symlinks resolving outside the workspace. Never point the workspace at a directory holding secrets — the corpus is fully readable through the API.

## License

[MIT](LICENSE) © 2026 Billy Box
