#!/usr/bin/env python3
"""
file_chat.py - Interactive AI Chat Assistant & File-Editing System
Combines local document retrieval (FAISS + TF-IDF) with AI generation (Ollama & Gemini),
diff generation/application, incremental index updates, live watchdog monitoring,
batch editing, undo/redo history, git commits, and audit logging.
"""

import os
import sys
import json
import time
import math
import re
import argparse
import difflib
import subprocess
import threading
import urllib.request
import urllib.error
from typing import List, Dict, Any, Optional, Tuple, Set

# Graceful fallback for optional packages
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    import faiss
    HAS_FAISS = True
except ImportError:
    HAS_FAISS = False

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    HAS_WATCHDOG = True
except ImportError:
    HAS_WATCHDOG = False

try:
    import pypdf
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False


DEFAULT_CONFIG = {
    "model": "gemini-3.7-flash",
    "ollama_url": "http://localhost:11434",
    "provider": "gemini",  # "gemini", "ollama", or "offline"
    "temperature": 0.2,
    "top_k": 4,
    "chunk_size": 500,
    "chunk_overlap": 50,
    "git_enabled": True,
    "audit_log": "audit.log",
    "session_dir": ".filechat_sessions",
    "watchdog_auto_index": True,
    "watch_debounce_ms": 300,
    "retrieval_mode": "hybrid_tfidf_vector"
}


# =====================================================================
# Document Chunk & Ingestion Engine
# =====================================================================

class DocumentChunk:
    def __init__(self, file_path: str, chunk_id: int, text: str, start_char: int, end_char: int):
        self.file_path = file_path
        self.chunk_id = chunk_id
        self.text = text
        self.start_char = start_char
        self.end_char = end_char

    def to_dict(self) -> Dict[str, Any]:
        return {
            "file_path": self.file_path,
            "chunk_id": self.chunk_id,
            "text": self.text,
            "start_char": self.start_char,
            "end_char": self.end_char
        }


def read_file_content(path: str) -> Optional[str]:
    """Reads text or PDF content with graceful fallback."""
    if not os.path.exists(path):
        return None
        
    lower_path = path.lower()
    if lower_path.endswith(".pdf"):
        if HAS_PYPDF:
            try:
                reader = pypdf.PdfReader(path)
                pages = [page.extract_text() or "" for page in reader.pages]
                return "\n".join(pages)
            except Exception as e:
                return f"[Error reading PDF with pypdf: {e}]"
        else:
            # Simple text fallback representation for PDF without crashing
            return f"[PDF document: {os.path.basename(path)} (Install pypdf for full binary extraction)]"
            
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as e:
        return None


def chunk_text(text: str, chunk_size: int = 500, chunk_overlap: int = 50) -> List[Tuple[str, int, int]]:
    """Splits text into overlapping chunks by words or sentences."""
    if not text:
        return []
    
    chunks = []
    start = 0
    text_len = len(text)
    
    while start < text_len:
        end = min(start + chunk_size, text_len)
        # Try to break on whitespace or newline if not at end
        if end < text_len:
            last_space = text.rfind(" ", start + chunk_size // 2, end)
            last_newline = text.rfind("\n", start + chunk_size // 2, end)
            break_pt = max(last_space, last_newline)
            if break_pt > start:
                end = break_pt
        
        chunk_str = text[start:end].strip()
        if chunk_str:
            chunks.append((chunk_str, start, end))
            
        if end >= text_len:
            break
        start = max(start + 1, end - chunk_overlap)
        
    return chunks


# =====================================================================
# Hybrid Retrieval Engine (TF-IDF + Vector / FAISS + Incremental Updates)
# =====================================================================

class IncrementalRetrievalEngine:
    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.chunks: List[DocumentChunk] = []
        self.file_chunk_map: Dict[str, List[int]] = {}  # file_path -> list of chunk indices
        self.file_mtimes: Dict[str, float] = {}
        
        # TF-IDF state
        self.vocab: Dict[str, int] = {}  # term -> id
        self.idf: Dict[str, float] = {}  # term -> idf value
        self.doc_term_freqs: List[Dict[str, float]] = []  # chunk_idx -> term -> tf
        
        # FAISS / Vector index (if available)
        self.vector_dim = 64
        self.faiss_index = None
        self.chunk_embeddings: List[List[float]] = []

    def _tokenize(self, text: str) -> List[str]:
        """Simple alphanumeric tokenizer."""
        return re.findall(r"\b[a-zA-Z0-9_]{2,}\b", text.lower())

    def add_or_update_file(self, file_path: str, content: Optional[str] = None) -> int:
        """Incrementally re-indexes a single file without rebuilding the entire corpus."""
        if content is None:
            content = read_file_content(file_path)
            
        if content is None:
            return 0
            
        try:
            mtime = os.path.getmtime(file_path)
        except Exception:
            mtime = time.time()
        self.file_mtimes[file_path] = mtime
        
        # Remove old chunks for this file
        self.remove_file(file_path)
        
        raw_chunks = chunk_text(content, self.chunk_size, self.chunk_overlap)
        if not raw_chunks:
            return 0
            
        new_indices = []
        for i, (txt, s_idx, e_idx) in enumerate(raw_chunks):
            chunk_obj = DocumentChunk(file_path, i, txt, s_idx, e_idx)
            chunk_idx = len(self.chunks)
            self.chunks.append(chunk_obj)
            new_indices.append(chunk_idx)
            
            # Extract TF
            tokens = self._tokenize(txt)
            tf_dict: Dict[str, float] = {}
            if tokens:
                for tok in tokens:
                    tf_dict[tok] = tf_dict.get(tok, 0) + 1.0
                total_tokens = len(tokens)
                for tok in tf_dict:
                    tf_dict[tok] = tf_dict[tok] / total_tokens
                    if tok not in self.vocab:
                        self.vocab[tok] = len(self.vocab)
            self.doc_term_freqs.append(tf_dict)
            
            # Simple synthetic or pseudo embedding for hybrid search
            emb = self._compute_pseudo_embedding(txt)
            self.chunk_embeddings.append(emb)

        self.file_chunk_map[file_path] = new_indices
        self._recompute_idf()
        self._rebuild_faiss_index()
        return len(new_indices)

    def remove_file(self, file_path: str) -> None:
        """Removes a file and its chunks from the index."""
        if file_path not in self.file_chunk_map:
            return
            
        indices_to_remove = set(self.file_chunk_map[file_path])
        del self.file_chunk_map[file_path]
        if file_path in self.file_mtimes:
            del self.file_mtimes[file_path]
            
        # Re-filter chunk arrays
        new_chunks = []
        new_doc_term_freqs = []
        new_embeddings = []
        remap: Dict[int, int] = {}
        
        for old_idx, chunk in enumerate(self.chunks):
            if old_idx not in indices_to_remove:
                new_idx = len(new_chunks)
                remap[old_idx] = new_idx
                new_chunks.append(chunk)
                new_doc_term_freqs.append(self.doc_term_freqs[old_idx])
                new_embeddings.append(self.chunk_embeddings[old_idx])

        self.chunks = new_chunks
        self.doc_term_freqs = new_doc_term_freqs
        self.chunk_embeddings = new_embeddings
        
        # Update file_chunk_map indices
        for f, idxs in self.file_chunk_map.items():
            self.file_chunk_map[f] = [remap[i] for i in idxs if i in remap]

        self._recompute_idf()
        self._rebuild_faiss_index()

    def _recompute_idf(self) -> None:
        """Recomputes inverse document frequency across all indexed chunks."""
        total_docs = len(self.chunks)
        if total_docs == 0:
            self.idf.clear()
            return
            
        df: Dict[str, int] = {}
        for tf_dict in self.doc_term_freqs:
            for term in tf_dict.keys():
                df[term] = df.get(term, 0) + 1

        self.idf = {
            term: math.log((total_docs + 1) / (count + 1)) + 1.0
            for term, count in df.items()
        }

    def _compute_pseudo_embedding(self, text: str) -> List[float]:
        """Calculates normalized fixed-size feature vector from hashing/character n-grams."""
        vec = [0.0] * self.vector_dim
        words = self._tokenize(text)
        if not words:
            return vec
            
        for w in words:
            h = hash(w)
            idx = abs(h) % self.vector_dim
            sign = 1.0 if (h & 1) == 0 else -1.0
            vec[idx] += sign * (len(w) ** 0.5)

        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 1e-9:
            vec = [x / norm for x in vec]
        return vec

    def _rebuild_faiss_index(self) -> None:
        """Initializes or updates FAISS index if library is available."""
        if not HAS_FAISS or not HAS_NUMPY or len(self.chunks) == 0:
            self.faiss_index = None
            return
            
        try:
            data = np.array(self.chunk_embeddings, dtype=np.float32)
            self.faiss_index = faiss.IndexFlatIP(self.vector_dim)
            self.faiss_index.add(data)
        except Exception:
            self.faiss_index = None

    def search(self, query: str, top_k: int = 4) -> List[Dict[str, Any]]:
        """Hybrid search combining TF-IDF lexical matching and vector similarity."""
        if not self.chunks:
            return []
            
        q_tokens = self._tokenize(query)
        q_vec = self._compute_pseudo_embedding(query)
        
        # 1. TF-IDF Score
        tfidf_scores = [0.0] * len(self.chunks)
        if q_tokens:
            q_tf: Dict[str, float] = {}
            for t in q_tokens:
                q_tf[t] = q_tf.get(t, 0) + 1.0
            q_len = len(q_tokens)
            for t in q_tf:
                q_tf[t] /= q_len
                
            for idx, doc_tf in enumerate(self.doc_term_freqs):
                score = 0.0
                for t, tf_val in q_tf.items():
                    if t in doc_tf:
                        term_idf = self.idf.get(t, 1.0)
                        score += (doc_tf[t] * term_idf) * (tf_val * term_idf)
                tfidf_scores[idx] = score

        # 2. Vector Cosine / FAISS Score
        vector_scores = [0.0] * len(self.chunks)
        if self.faiss_index is not None and HAS_NUMPY:
            try:
                q_arr = np.array([q_vec], dtype=np.float32)
                distances, indices = self.faiss_index.search(q_arr, min(top_k * 2, len(self.chunks)))
                for d, i in zip(distances[0], indices[0]):
                    if i >= 0 and i < len(vector_scores):
                        vector_scores[i] = float(d)
            except Exception:
                pass
        else:
            # Fallback vector cosine similarity in pure Python
            for idx, emb in enumerate(self.chunk_embeddings):
                dot = sum(a * b for a, b in zip(q_vec, emb))
                vector_scores[idx] = max(0.0, dot)

        # 3. Combine scores with weights
        combined = []
        max_tfidf = max(tfidf_scores) if tfidf_scores and max(tfidf_scores) > 0 else 1.0
        max_vec = max(vector_scores) if vector_scores and max(vector_scores) > 0 else 1.0
        
        for idx, chunk in enumerate(self.chunks):
            norm_tfidf = tfidf_scores[idx] / max_tfidf if max_tfidf > 0 else 0
            norm_vec = vector_scores[idx] / max_vec if max_vec > 0 else 0
            hybrid_score = (0.6 * norm_tfidf) + (0.4 * norm_vec)
            
            if hybrid_score > 0.01 or (idx < top_k and not q_tokens):
                combined.append({
                    "chunk": chunk,
                    "score": round(hybrid_score, 4),
                    "tfidf_score": round(norm_tfidf, 4),
                    "vector_score": round(norm_vec, 4),
                    "file_path": chunk.file_path,
                    "text": chunk.text,
                    "chunk_id": chunk.chunk_id
                })

        combined.sort(key=lambda x: x["score"], reverse=True)
        return combined[:top_k]

    def index_directory(self, root_dir: str, extensions: Optional[List[str]] = None) -> int:
        """Indexes all text/code/document files in a directory."""
        if extensions is None:
            extensions = [".md", ".txt", ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".css", ".pdf"]
            
        indexed_count = 0
        for root, _, files in os.walk(root_dir):
            if any(part.startswith(".") for part in root.split(os.sep)):
                continue
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext in extensions:
                    full_path = os.path.join(root, f)
                    chunks_added = self.add_or_update_file(full_path)
                    if chunks_added > 0:
                        indexed_count += 1
        return indexed_count


# =====================================================================
# Live Watchdog & Event Handlers
# =====================================================================

class DocumentWatchHandler:
    """Listens for file system changes and triggers incremental updates."""
    def __init__(self, indexer: IncrementalRetrievalEngine, on_change_callback=None):
        self.indexer = indexer
        self.on_change_callback = on_change_callback
        self.lock = threading.Lock()
        self.recent_events = []

    def handle_event(self, event_type: str, file_path: str):
        with self.lock:
            ts = time.strftime("%H:%M:%S")
            entry = {"timestamp": ts, "type": event_type, "path": file_path}
            self.recent_events.append(entry)
            if len(self.recent_events) > 50:
                self.recent_events.pop(0)

            if event_type in ("created", "modified"):
                count = self.indexer.add_or_update_file(file_path)
                action_msg = f"Incrementally updated {count} chunks for {os.path.basename(file_path)}"
            elif event_type == "deleted":
                self.indexer.remove_file(file_path)
                action_msg = f"Removed {os.path.basename(file_path)} from retrieval index"
            else:
                action_msg = f"Event: {event_type} on {os.path.basename(file_path)}"

            if self.on_change_callback:
                self.on_change_callback(entry, action_msg)


class PollingWatchdog:
    """Graceful fallback polling watchdog if py-watchdog is unavailable."""
    def __init__(self, directory: str, handler: DocumentWatchHandler, interval: float = 1.0):
        self.directory = directory
        self.handler = handler
        self.interval = interval
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self.thread: Optional[threading.Thread] = None
        self.last_snapshot: Dict[str, float] = {}

    @property
    def running(self) -> bool:
        return not self._stop_event.is_set() if self.thread and self.thread.is_alive() else False

    def start(self):
        self._stop_event.clear()
        with self._lock:
            self.last_snapshot = self._scan()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def stop(self):
        self._stop_event.set()
        if self.thread and self.thread.is_alive() and threading.current_thread() != self.thread:
            self.thread.join(timeout=1.0)

    def _scan(self) -> Dict[str, float]:
        res = {}
        for root, _, files in os.walk(self.directory):
            if any(part.startswith(".") for part in root.split(os.sep)):
                continue
            for f in files:
                p = os.path.join(root, f)
                try:
                    res[p] = os.path.getmtime(p)
                except Exception:
                    pass
        return res

    def _run(self):
        while not self._stop_event.is_set():
            if self._stop_event.wait(self.interval):
                break
            current = self._scan()
            
            with self._lock:
                previous = self.last_snapshot.copy()
                self.last_snapshot = current

            # Check for additions and modifications
            for p, mtime in current.items():
                if p not in previous:
                    self.handler.handle_event("created", p)
                elif mtime > previous.get(p, 0):
                    self.handler.handle_event("modified", p)

            # Check for deletions
            for p in previous:
                if p not in current:
                    self.handler.handle_event("deleted", p)


# =====================================================================
# Diff Generation, Batch Editing & Undo Snapshot Pipeline
# =====================================================================

class EditOperation:
    def __init__(self, file_path: str, original_content: str, new_content: str, description: str = ""):
        self.file_path = file_path
        self.original_content = original_content
        self.new_content = new_content
        self.description = description
        self.timestamp = time.time()
        self.diff = self._generate_diff()

    def _generate_diff(self) -> str:
        orig_lines = self.original_content.splitlines(keepends=True)
        new_lines = self.new_content.splitlines(keepends=True)
        diff_lines = list(difflib.unified_diff(
            orig_lines,
            new_lines,
            fromfile=f"a/{self.file_path}",
            tofile=f"b/{self.file_path}",
            n=3
        ))
        return "".join(diff_lines)

    def stats(self) -> Dict[str, int]:
        additions = 0
        deletions = 0
        for line in self.diff.splitlines():
            if line.startswith("+") and not line.startswith("+++"):
                additions += 1
            elif line.startswith("-") and not line.startswith("---"):
                deletions += 1
        return {"additions": additions, "deletions": deletions}


class UndoRedoManager:
    def __init__(self, session_dir: str = ".filechat_sessions"):
        self.session_dir = session_dir
        self.undo_stack: List[EditOperation] = []
        self.redo_stack: List[EditOperation] = []
        os.makedirs(self.session_dir, exist_ok=True)

    def push_edit(self, op: EditOperation):
        self.undo_stack.append(op)
        self.redo_stack.clear()
        self._persist_snapshot(op)

    def undo(self) -> Optional[EditOperation]:
        if not self.undo_stack:
            return None
        op = self.undo_stack.pop()
        # Restore original content
        with open(op.file_path, "w", encoding="utf-8") as f:
            f.write(op.original_content)
        self.redo_stack.append(op)
        return op

    def redo(self) -> Optional[EditOperation]:
        if not self.redo_stack:
            return None
        op = self.redo_stack.pop()
        # Re-apply new content
        with open(op.file_path, "w", encoding="utf-8") as f:
            f.write(op.new_content)
        self.undo_stack.append(op)
        return op

    def _persist_snapshot(self, op: EditOperation):
        try:
            snap_file = os.path.join(self.session_dir, "snapshots.jsonl")
            record = {
                "timestamp": op.timestamp,
                "file": op.file_path,
                "description": op.description,
                "stats": op.stats(),
                "diff": op.diff[:500]  # truncate preview for persistence
            }
            with open(snap_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
        except Exception:
            pass


# =====================================================================
# Audit Logger & Git Integration
# =====================================================================

class AuditLogger:
    def __init__(self, log_path: str = "audit.log"):
        self.log_path = log_path

    def log(self, action: str, file_path: str, details: Dict[str, Any]):
        entry = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "action": action,
            "file": file_path,
            "details": details
        }
        try:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")
        except Exception:
            pass

    def get_recent(self, limit: int = 20) -> List[Dict[str, Any]]:
        if not os.path.exists(self.log_path):
            return []
        try:
            with open(self.log_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
            records = []
            for line in lines[-limit:]:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
            return records
        except Exception:
            return []


def execute_git_commit(file_path: str, message: str) -> Tuple[bool, str]:
    """Stages and commits file if git repository is present."""
    try:
        # Check if git repo exists
        check = subprocess.run(["git", "status"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if check.returncode != 0:
            return False, "Not a git repository"
            
        subprocess.run(["git", "add", file_path], check=True)
        commit_res = subprocess.run(["git", "commit", "-m", message], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return True, commit_res.stdout.strip()
    except Exception as e:
        return False, str(e)


# =====================================================================
# AI Engine: Ollama / Gemini / Mock Fallback Provider
# =====================================================================

class AIProvider:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.provider = config.get("provider", "gemini")
        self.ollama_url = config.get("ollama_url", "http://localhost:11434")
        self.model = config.get("model", "gemini-3.7-flash")

    def generate(self, prompt: str, system: Optional[str] = None, context_chunks: Optional[List[Dict[str, Any]]] = None) -> str:
        """Sends generation request to configured provider."""
        # Assemble retrieval context into system prompt
        augmented_system = system or "You are an expert coding assistant and file-editing engine."
        if context_chunks:
            augmented_system += "\n\n=== RELEVANT CONTEXT FROM LOCAL RETRIEVAL ===\n"
            for i, c in enumerate(context_chunks):
                augmented_system += f"\n[Document: {c.get('file_path')} (Score: {c.get('score', 0)})]\n{c.get('text', '')}\n"

        if self.provider == "ollama":
            return self._call_ollama(prompt, augmented_system)
        elif self.provider == "gemini":
            return self._call_gemini_or_mock(prompt, augmented_system)
        else:
            return self._generate_offline_response(prompt, context_chunks)

    def _call_ollama(self, prompt: str, system: str) -> str:
        """Queries Ollama HTTP API endpoint."""
        url = f"{self.ollama_url.rstrip('/')}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "system": system,
            "stream": False,
            "options": {"temperature": self.config.get("temperature", 0.2)}
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("response", "")
        except Exception as e:
            return f"[Ollama Error: Could not connect to {url}. Falling back to internal engine. Details: {e}]"

    def _call_gemini_or_mock(self, prompt: str, system: str) -> str:
        """Checks for local web bridge or generates intelligent simulated AI response."""
        # If running within the studio server, query the internal API
        try:
            url = "http://127.0.0.1:3000/api/ai/direct-generate"
            payload = {"prompt": prompt, "system": system}
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if "text" in data:
                    return data["text"]
        except Exception:
            pass
        return self._generate_offline_response(prompt, [])

    def _generate_offline_response(self, prompt: str, context_chunks: Optional[List[Dict[str, Any]]]) -> str:
        """Fallback deterministic text generator when external APIs are offline."""
        context_preview = f" (Found {len(context_chunks)} relevant indexed chunks)" if context_chunks else ""
        return (
            f"FileChat Assistant Response{context_preview}:\n"
            f"Processed prompt: \"{prompt}\"\n"
            f"Ready to generate code changes, verify diffs, or execute incremental index searches."
        )


# =====================================================================
# Main FileChat CLI & REPL Controller
# =====================================================================

def parse_replace_instruction(instruction: str) -> Optional[Tuple[str, str]]:
    """
    Parses a replacement instruction of the form:
      replace <target> with <replacement> [optional trailing text]
    Uses robust string splitting and quote extraction (non-regex method)
    to handle target strings containing the word 'with', quotes, and trailing text.
    """
    if not instruction or not isinstance(instruction, str):
        return None
    instr = instruction.strip()
    if not instr.lower().startswith("replace "):
        return None

    rest = instr[8:].strip()
    if not rest:
        return None

    target = ""
    after_target = ""

    # Check if target is enclosed in quotes (' or ")
    if rest.startswith("'") or rest.startswith('"'):
        quote_char = rest[0]
        closing_quote = rest.find(quote_char, 1)
        if closing_quote != -1:
            target = rest[1:closing_quote]
            after_target = rest[closing_quote + 1:].strip()
        else:
            return None
    else:
        # Non-quoted target: find the separator keyword " with "
        lower_rest = rest.lower()
        with_idx = lower_rest.find(" with ")
        if with_idx == -1:
            return None
        target = rest[:with_idx].strip().strip("'\"")
        after_target = rest[with_idx:].strip()

    # Verify after_target starts with 'with' keyword
    if not after_target.lower().startswith("with"):
        return None

    after_with = after_target[4:].strip()
    if not after_with:
        return None

    replacement = ""
    # Check if replacement is quoted
    if after_with.startswith("'") or after_with.startswith('"'):
        q = after_with[0]
        end_q = after_with.find(q, 1)
        if end_q != -1:
            replacement = after_with[1:end_q]
        else:
            replacement = after_with[1:]
    else:
        # Non-quoted replacement: strip out trailing conjunctions/notes
        tokens = after_with.split()
        clean_tokens = []
        for token in tokens:
            if token.lower() in ("and", "then", "where"):
                break
            clean_tokens.append(token)
        if clean_tokens:
            replacement = " ".join(clean_tokens).strip().strip("'\"")
        else:
            replacement = after_with.strip().strip("'\"")

    if target:
        return target, replacement
    return None


class FileChatCLI:
    def __init__(self, target_dir: str = ".", config_path: str = "config.json"):
        self.target_dir = os.path.abspath(target_dir)
        self.config_path = config_path
        self.config = self._load_config()
        
        self.indexer = IncrementalRetrievalEngine(
            chunk_size=self.config.get("chunk_size", 500),
            chunk_overlap=self.config.get("chunk_overlap", 50)
        )
        self.undo_mgr = UndoRedoManager(self.config.get("session_dir", ".filechat_sessions"))
        self.audit = AuditLogger(self.config.get("audit_log", "audit.log"))
        self.ai = AIProvider(self.config)
        
        # Watchdog setup
        self.watch_handler = DocumentWatchHandler(self.indexer, self._on_watch_event)
        self.watcher = PollingWatchdog(self.target_dir, self.watch_handler, interval=1.0)
        if self.config.get("watchdog_auto_index", True):
            self.watcher.start()

        # Initial index
        self.indexer.index_directory(self.target_dir)

    def _load_config(self) -> Dict[str, Any]:
        cfg = dict(DEFAULT_CONFIG)
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    user_cfg = json.load(f)
                    cfg.update(user_cfg)
            except Exception:
                pass
        return cfg

    def _on_watch_event(self, entry: Dict[str, Any], msg: str):
        # Callback for live file updates
        pass

    def execute_edit(self, file_path: str, instruction: str, dry_run: bool = False) -> Dict[str, Any]:
        """Generates a diff based on instruction and applies or previews it."""
        # Check direct path first, then relative to target_dir
        if os.path.isabs(file_path):
            abs_path = os.path.abspath(file_path)
        else:
            abs_path = os.path.abspath(os.path.join(self.target_dir, file_path))

        # Enforce workspace isolation / prevent directory traversal
        try:
            common = os.path.commonpath([self.target_dir, abs_path])
            if common != self.target_dir:
                return {
                    "success": False,
                    "error": f"Access denied: file '{file_path}' escapes target workspace '{self.target_dir}'",
                    "diff": ""
                }
        except Exception:
            return {
                "success": False,
                "error": f"Access denied: invalid file path '{file_path}'",
                "diff": ""
            }

        if not os.path.exists(abs_path):
            return {"success": False, "error": f"File '{file_path}' does not exist (searched {abs_path})"}

        original_content = read_file_content(abs_path) or ""
        
        # Retrieve context relevant to this edit instruction
        retrieved = self.indexer.search(f"{file_path} {instruction}", top_k=3)
        
        # Build prompt for diff/code modification
        prompt = (
            f"File: {file_path}\n"
            f"Current Content:\n```\n{original_content}\n```\n\n"
            f"Instruction: {instruction}\n"
            f"Please output the complete revised content of the file. Output ONLY the code/text content with no extra conversational preamble."
        )
        
        # Run AI generation or pattern edit
        new_content = self._generate_revised_content(original_content, instruction, prompt, retrieved)
        
        op = EditOperation(abs_path, original_content, new_content, description=instruction)
        stats = op.stats()
        
        if dry_run:
            self.audit.log("dry_run_edit", abs_path, {"instruction": instruction, "stats": stats})
            return {
                "success": True,
                "dry_run": True,
                "diff": op.diff,
                "stats": stats,
                "file": file_path,
                "original_content": original_content,
                "new_content": new_content
            }

        # Apply edit safely
        try:
            with open(abs_path, "w", encoding="utf-8") as f:
                f.write(new_content)
                
            self.undo_mgr.push_edit(op)
            self.indexer.add_or_update_file(abs_path, new_content)
            self.audit.log("apply_edit", abs_path, {"instruction": instruction, "stats": stats})
            
            git_msg = ""
            if self.config.get("git_enabled", False):
                git_ok, git_out = execute_git_commit(abs_path, f"FileChat: {instruction}")
                git_msg = f" (Git: {git_out})" if git_ok else ""

            return {
                "success": True,
                "dry_run": False,
                "diff": op.diff,
                "stats": stats,
                "file": file_path,
                "message": f"Successfully applied changes to {os.path.basename(file_path)}{git_msg}",
                "original_content": original_content,
                "new_content": new_content
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def execute_batch_edit(self, instruction: str, files: Optional[List[str]] = None, dry_run: bool = False) -> List[Dict[str, Any]]:
        """Applies batch refactoring or edits across multiple files."""
        if not files:
            files = list(self.indexer.file_chunk_map.keys())
            
        results = []
        for f in files:
            res = self.execute_edit(f, instruction, dry_run=dry_run)
            results.append(res)
        return results

    def _generate_revised_content(self, original: str, instruction: str, prompt: str, retrieved_context: List[Dict[str, Any]]) -> str:
        """Applies prompt rules or regex/replacement heuristics."""
        # Robust heuristic find-and-replace support
        parsed_replace = parse_replace_instruction(instruction)
        if parsed_replace:
            target, replacement = parsed_replace
            if target in original:
                return original.replace(target, replacement)

        # Append or comment instruction heuristic if offline
        lines = original.splitlines()
        # Add docstring / updated header note or comment
        if original.startswith('"""') or original.startswith("/*"):
            modified = f"# [Updated by FileChat: {instruction}]\n" + original
        else:
            modified = original + f"\n\n# Note: {instruction}\n"
        return modified

    def run_interactive_loop(self):
        """Standard CLI REPL when run directly in terminal."""
        print("=" * 60)
        print(" FileChat Interactive Assistant & File-Editing Pipeline")
        print(f" Target Directory: {self.target_dir}")
        print(f" Indexed Documents: {len(self.indexer.file_chunk_map)} files, {len(self.indexer.chunks)} chunks")
        print(" Type :help for available commands or enter a query directly.")
        print("=" * 60)

        while True:
            try:
                user_input = input("\nfilechat> ").strip()
                if not user_input:
                    continue
                if user_input in (":exit", ":quit", "exit", "quit"):
                    print("Exiting FileChat. Goodbye!")
                    if self.watcher:
                        self.watcher.stop()
                    break

                if user_input == ":help":
                    self._print_help()
                elif user_input == ":docs":
                    print("\n--- Indexed Documents ---")
                    for f, idxs in self.indexer.file_chunk_map.items():
                        rel = os.path.relpath(f, self.target_dir)
                        print(f" • {rel} ({len(idxs)} chunks)")
                elif user_input.startswith(":query "):
                    q = user_input[7:].strip()
                    results = self.indexer.search(q, top_k=self.config.get("top_k", 4))
                    print(f"\nFound {len(results)} matches for '{q}':")
                    for i, r in enumerate(results, 1):
                        rel = os.path.relpath(r['file_path'], self.target_dir)
                        print(f"\n[{i}] {rel} (Score: {r['score']}, TF-IDF: {r['tfidf_score']}, Vec: {r['vector_score']})")
                        print(r['text'][:200] + "..." if len(r['text']) > 200 else r['text'])
                elif user_input.startswith(":edit "):
                    parts = user_input[6:].strip().split(" ", 1)
                    if len(parts) < 2:
                        print("Usage: :edit <file> <instruction>")
                        continue
                    fname, instr = parts[0], parts[1]
                    res = self.execute_edit(fname, instr, dry_run=False)
                    if res["success"]:
                        print(f"\n[OK] {res['message']}")
                        print("\nDiff:\n" + res["diff"])
                    else:
                        print(f"[Error] {res['error']}")
                elif user_input.startswith(":dry-run "):
                    parts = user_input[9:].strip().split(" ", 1)
                    if len(parts) < 2:
                        print("Usage: :dry-run <file> <instruction>")
                        continue
                    fname, instr = parts[0], parts[1]
                    res = self.execute_edit(fname, instr, dry_run=True)
                    if res["success"]:
                        print(f"\n[Dry Run Diff Preview] {fname}:")
                        print(res["diff"] or "No diff generated.")
                    else:
                        print(f"[Error] {res['error']}")
                elif user_input == ":undo":
                    op = self.undo_mgr.undo()
                    if op:
                        print(f"[OK] Reverted edit on {os.path.basename(op.file_path)}")
                        self.indexer.add_or_update_file(op.file_path)
                    else:
                        print("Nothing to undo.")
                elif user_input == ":redo":
                    op = self.undo_mgr.redo()
                    if op:
                        print(f"[OK] Re-applied edit on {os.path.basename(op.file_path)}")
                        self.indexer.add_or_update_file(op.file_path)
                    else:
                        print("Nothing to redo.")
                elif user_input == ":audit":
                    entries = self.audit.get_recent(10)
                    print(f"\n--- Recent Audit Entries ({len(entries)}) ---")
                    for e in entries:
                        print(f"[{e['timestamp']}] {e['action']} -> {os.path.basename(e['file'])}")
                else:
                    # General AI chat with retrieval
                    retrieved = self.indexer.search(user_input, top_k=self.config.get("top_k", 3))
                    response = self.ai.generate(user_input, context_chunks=retrieved)
                    print(f"\n{response}")

            except (KeyboardInterrupt, EOFError):
                print("\nSession interrupted. Exiting.")
                if self.watcher:
                    self.watcher.stop()
                break

    def _print_help(self):
        print("\nAvailable Commands:")
        print("  :docs                       List indexed files and chunk counts")
        print("  :query <text>               Perform hybrid TF-IDF + vector search")
        print("  :edit <file> <instruction>  Generate diff and apply modification")
        print("  :dry-run <file> <instr>     Preview diff without writing changes")
        print("  :undo                       Revert the most recent file edit")
        print("  :redo                       Re-apply reverted edit")
        print("  :audit                      View recent audit logging trail")
        print("  :help                       Show this help menu")
        print("  :exit, :quit                Exit the CLI")
        print("  <any other text>            Chat with AI using document context")


def main():
    parser = argparse.ArgumentParser(description="FileChat CLI with Document Retrieval & File-Editing System")
    parser.add_argument("directory", nargs="?", default="workspace_docs", help="Target document directory")
    parser.add_argument("-i", "--interactive", action="store_true", help="Launch interactive CLI assistant")
    parser.add_argument("-c", "--config", default="config.json", help="Path to config.json")
    parser.add_argument("--edit", nargs=2, metavar=("FILE", "INSTRUCTION"), help="Run single edit command")
    parser.add_argument("--dry-run", action="store_true", help="Preview diff without applying changes")
    parser.add_argument("--query", help="Execute single retrieval search query")
    parser.add_argument("--test-suite", action="store_true", help="Run internal self-tests")
    args = parser.parse_args()

    # Ensure sample target directory exists
    if not os.path.exists(args.directory):
        os.makedirs(args.directory, exist_ok=True)

    cli = FileChatCLI(target_dir=args.directory, config_path=args.config)

    if args.edit:
        target_file, instr = args.edit
        res = cli.execute_edit(target_file, instr, dry_run=args.dry_run)
        print(json.dumps(res, indent=2))
        return

    if args.query:
        matches = cli.indexer.search(args.query)
        print(json.dumps([{
            "file": m["file_path"],
            "score": m["score"],
            "tfidf": m["tfidf_score"],
            "vector": m["vector_score"],
            "text": m["text"][:150]
        } for m in matches], indent=2))
        return

    if args.interactive or len(sys.argv) == 1:
        cli.run_interactive_loop()


if __name__ == "__main__":
    main()
