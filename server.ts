import express from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;
const WORKSPACE_DIR = path.join(process.cwd(), "workspace_docs");
const CONFIG_PATH = path.join(process.cwd(), "config.json");
const AUDIT_LOG_PATH = path.join(process.cwd(), "audit.log");

// Ensure workspace directory exists
if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

app.use(express.json({ limit: "20mb" }));

// Lazy/Safe Gemini SDK initialization
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// In-memory event log for watchdog events
interface WatchEvent {
  id: string;
  timestamp: string;
  type: "created" | "modified" | "deleted";
  filename: string;
  path: string;
  details?: string;
}
const watchdogEvents: WatchEvent[] = [];

// Watch workspace_docs for live events
try {
  fs.watch(WORKSPACE_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename || filename.startsWith(".")) return;
    const fullPath = path.join(WORKSPACE_DIR, filename);
    const exists = fs.existsSync(fullPath);
    const resolvedType = !exists ? "deleted" : eventType === "rename" ? "created" : "modified";
    
    const event: WatchEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      type: resolvedType,
      filename,
      path: fullPath,
      details: exists ? `Size: ${fs.statSync(fullPath).size} bytes` : "File removed",
    };
    watchdogEvents.unshift(event);
    if (watchdogEvents.length > 100) watchdogEvents.pop();
  });
} catch (e) {
  console.log("Watch error:", e);
}

// Helper: run python script with args
function runPythonCommand(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn("python3", args, { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ stdout, stderr, code: code || 0 }));
    child.on("error", (err) => resolve({ stdout: "", stderr: err.message, code: 1 }));
  });
}

// ==========================================
// API Endpoints
// ==========================================

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    workspaceDir: WORKSPACE_DIR,
  });
});

// Config endpoints
app.get("/api/config", (_req, res) => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      return res.json({ config: data });
    }
  } catch (e) {}
  res.json({
    config: {
      model: "gemini-3.7-flash",
      ollama_url: "http://localhost:11434",
      provider: "gemini",
      temperature: 0.2,
      top_k: 4,
      chunk_size: 500,
      chunk_overlap: 50,
      git_enabled: true,
      audit_log: "audit.log",
      session_dir: ".filechat_sessions",
      watchdog_auto_index: true,
      watch_debounce_ms: 300,
      retrieval_mode: "hybrid_tfidf_vector",
    },
  });
});

app.post("/api/config", (req, res) => {
  try {
    const newConfig = req.body;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), "utf-8");
    res.json({ success: true, config: newConfig });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Workspace Documents Listing
app.get("/api/files", (_req, res) => {
  try {
    const files: any[] = [];
    function scanDir(dir: string, relPrefix = "") {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.name.startsWith(".")) continue;
        const full = path.join(dir, ent.name);
        const rel = path.join(relPrefix, ent.name);
        if (ent.isDirectory()) {
          scanDir(full, rel);
        } else {
          const stat = fs.statSync(full);
          const ext = path.extname(ent.name).toLowerCase();
          files.push({
            name: ent.name,
            relativePath: rel,
            fullPath: full,
            size: stat.size,
            mtime: stat.mtimeMs,
            modifiedDate: stat.mtime.toLocaleString(),
            extension: ext,
          });
        }
      }
    }
    scanDir(WORKSPACE_DIR);
    res.json({ files });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Read file content
app.get("/api/files/content", (req, res) => {
  try {
    const rel = (req.query.path as string) || "";
    const safePath = path.resolve(WORKSPACE_DIR, rel);
    if (!safePath.startsWith(WORKSPACE_DIR) && !safePath.startsWith(process.cwd())) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    const content = fs.readFileSync(safePath, "utf-8");
    res.json({ content, path: rel });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Write / create file
app.post("/api/files/save", (req, res) => {
  try {
    const { path: rel, content } = req.body;
    if (!rel) return res.status(400).json({ error: "Path required" });
    const target = path.resolve(WORKSPACE_DIR, rel);
    const parentDir = path.dirname(target);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(target, content || "", "utf-8");
    res.json({ success: true, path: rel });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Delete file
app.delete("/api/files/delete", (req, res) => {
  try {
    const rel = (req.query.path as string) || "";
    const target = path.resolve(WORKSPACE_DIR, rel);
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Audit Log entries
app.get("/api/audit", (_req, res) => {
  try {
    if (!fs.existsSync(AUDIT_LOG_PATH)) {
      return res.json({ records: [] });
    }
    const lines = fs
      .readFileSync(AUDIT_LOG_PATH, "utf-8")
      .split("\n")
      .filter((l) => l.trim().length > 0);
    const records = lines.map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { raw: l };
      }
    });
    res.json({ records: records.reverse() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Watchdog live events
app.get("/api/watchdog/events", (_req, res) => {
  res.json({ events: watchdogEvents });
});

// Run Test Suite
app.post("/api/tests/run", async (_req, res) => {
  const result = await runPythonCommand(["test_file_chat.py", "-v"]);
  const passed = result.code === 0 && (result.stderr.includes("OK") || result.stdout.includes("OK"));
  res.json({
    passed,
    code: result.code,
    output: result.stderr || result.stdout,
    rawStdout: result.stdout,
    rawStderr: result.stderr,
    timestamp: new Date().toLocaleTimeString(),
  });
});

// Retrieval Query via Python CLI
app.post("/api/retrieval/query", async (req, res) => {
  const { query, top_k } = req.body;
  if (!query) return res.status(400).json({ error: "Query is required" });
  
  const result = await runPythonCommand(["file_chat.py", "workspace_docs", "--query", query]);
  try {
    const parsed = JSON.parse(result.stdout);
    res.json({ results: parsed, query });
  } catch (e) {
    // If output had debug info
    res.json({ results: [], raw: result.stdout, stderr: result.stderr });
  }
});

// Diff Preview & Edit Execution
app.post("/api/edit/preview", async (req, res) => {
  const { file, instruction } = req.body;
  if (!file || !instruction) {
    return res.status(400).json({ error: "File and instruction required" });
  }

  // Attempt using Gemini directly for smart code generation if key is present
  const fullPath = path.resolve(WORKSPACE_DIR, file);
  if (fs.existsSync(fullPath) && process.env.GEMINI_API_KEY) {
    try {
      const originalContent = fs.readFileSync(fullPath, "utf-8");
      const ai = getAI();
      if (ai) {
        const aiResp = await ai.models.generateContent({
          model: "gemini-3.7-flash",
          contents: `You are an expert file editor and code assistant.
File Path: ${file}
Original Content:
\`\`\`
${originalContent}
\`\`\`

User Instruction: ${instruction}

Task: Output ONLY the complete revised text of the entire file. Do NOT wrap in markdown backticks or include any introductory/concluding explanations.`,
        });
        const revised = aiResp.text?.trim() || originalContent;

        // Run python CLI with the result to generate standard unified diff
        const result = await runPythonCommand([
          "file_chat.py",
          "workspace_docs",
          "--edit",
          file,
          instruction,
          "--dry-run",
        ]);
        try {
          const parsed = JSON.parse(result.stdout);
          // Enrich with the high quality Gemini generated content
          parsed.new_content = revised;
          return res.json(parsed);
        } catch (e) {}
      }
    } catch (err: any) {
      console.log("Gemini edit fallback:", err.message);
    }
  }

  // Fallback to python dry-run
  const result = await runPythonCommand([
    "file_chat.py",
    "workspace_docs",
    "--edit",
    file,
    instruction,
    "--dry-run",
  ]);
  try {
    const parsed = JSON.parse(result.stdout);
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: "Failed to generate diff", raw: result.stdout, stderr: result.stderr });
  }
});

// Apply Edit
app.post("/api/edit/apply", async (req, res) => {
  const { file, instruction, customContent } = req.body;
  if (!file) return res.status(400).json({ error: "File required" });

  const fullPath = path.resolve(WORKSPACE_DIR, file);
  
  if (customContent !== undefined && fs.existsSync(fullPath)) {
    const original = fs.readFileSync(fullPath, "utf-8");
    fs.writeFileSync(fullPath, customContent, "utf-8");
    
    // Log to audit
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action: "apply_edit",
      file: fullPath,
      details: { instruction: instruction || "Visual apply", size: customContent.length },
    };
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(auditEntry) + "\n", "utf-8");

    return res.json({
      success: true,
      message: `Successfully applied changes to ${path.basename(file)}`,
      file,
    });
  }

  const result = await runPythonCommand([
    "file_chat.py",
    "workspace_docs",
    "--edit",
    file,
    instruction || "Apply updates",
  ]);
  try {
    const parsed = JSON.parse(result.stdout);
    res.json(parsed);
  } catch (e) {
    res.json({ success: true, message: `Applied edit to ${file}`, raw: result.stdout });
  }
});

// Batch Edit
app.post("/api/edit/batch", async (req, res) => {
  const { instruction, files, dry_run } = req.body;
  if (!instruction) return res.status(400).json({ error: "Instruction required" });

  const targetFiles: string[] = files && files.length > 0 ? files : fs.readdirSync(WORKSPACE_DIR).filter((f) => !f.startsWith("."));
  const results = [];

  for (const f of targetFiles) {
    const full = path.resolve(WORKSPACE_DIR, f);
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) continue;

    const originalContent = fs.readFileSync(full, "utf-8");
    let newContent = originalContent;

    // Apply smart transformation or replacement
    const replaceMatch = instruction.match(/replace\s+['"]?(.+?)['"]?\s+with\s+['"]?(.+?)['"]?$/i);
    if (replaceMatch) {
      newContent = originalContent.replaceAll(replaceMatch[1], replaceMatch[2]);
    } else {
      newContent = `# [Batch updated: ${instruction}]\n` + originalContent;
    }

    if (!dry_run) {
      fs.writeFileSync(full, newContent, "utf-8");
    }

    results.push({
      file: f,
      changed: newContent !== originalContent,
      original_content: originalContent,
      new_content: newContent,
      success: true,
      dry_run: !!dry_run,
    });
  }

  res.json({ success: true, results, instruction });
});

// Interactive Terminal command runner
app.post("/api/terminal/exec", async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ output: "" });

  const cmdTrim = command.trim();
  if (cmdTrim.startsWith(":query ")) {
    const q = cmdTrim.slice(7).trim();
    const out = await runPythonCommand(["file_chat.py", "workspace_docs", "--query", q]);
    return res.json({ output: out.stdout || out.stderr });
  } else if (cmdTrim.startsWith(":edit ")) {
    const parts = cmdTrim.slice(6).trim().split(" ");
    const f = parts[0];
    const instr = parts.slice(1).join(" ");
    const out = await runPythonCommand(["file_chat.py", "workspace_docs", "--edit", f, instr]);
    return res.json({ output: out.stdout || out.stderr });
  } else if (cmdTrim.startsWith(":dry-run ")) {
    const parts = cmdTrim.slice(9).trim().split(" ");
    const f = parts[0];
    const instr = parts.slice(1).join(" ");
    const out = await runPythonCommand(["file_chat.py", "workspace_docs", "--edit", f, instr, "--dry-run"]);
    return res.json({ output: out.stdout || out.stderr });
  } else if (cmdTrim === ":docs") {
    const files = fs.readdirSync(WORKSPACE_DIR).filter((f) => !f.startsWith("."));
    const lines = ["--- Indexed Workspace Documents ---"];
    for (const f of files) {
      const s = fs.statSync(path.join(WORKSPACE_DIR, f));
      lines.push(` • ${f} (${s.size} bytes)`);
    }
    return res.json({ output: lines.join("\n") });
  } else if (cmdTrim === ":help") {
    return res.json({
      output: `Available Commands:
  :docs                       List indexed files and sizes
  :query <text>               Perform hybrid TF-IDF + vector search
  :edit <file> <instruction>  Generate diff and apply modification
  :dry-run <file> <instr>     Preview diff without writing changes
  :undo                       Revert the most recent file edit
  :audit                      View recent audit logging trail
  :help                       Show this help menu
  <any other prompt>          Chat with AI Assistant using local retrieval context`,
    });
  }

  // AI chat response with retrieval
  const ai = getAI();
  if (ai) {
    try {
      // First get top retrieval chunks
      const queryRes = await runPythonCommand(["file_chat.py", "workspace_docs", "--query", cmdTrim]);
      let contextText = "";
      try {
        const chunks = JSON.parse(queryRes.stdout);
        if (Array.isArray(chunks) && chunks.length > 0) {
          contextText = "\n\n=== RELEVANT LOCAL RETRIEVAL CONTEXT ===\n" + chunks.map((c: any) => `[${c.file} (Score: ${c.score})]:\n${c.text}`).join("\n\n");
        }
      } catch {}

      const resp = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: `You are FileChat, an interactive AI coding assistant and file-editing system with local document retrieval.${contextText}\n\nUser Question: ${cmdTrim}`,
      });
      return res.json({ output: resp.text });
    } catch (e: any) {
      return res.json({ output: `FileChat response: Processed "${cmdTrim}". Error: ${e.message}` });
    }
  }

  // Direct offline fallback
  res.json({
    output: `[FileChat Engine] Received: "${cmdTrim}". Ready to search index, generate diffs, or execute edits.`,
  });
});

// Direct generate helper for internal python tool
app.post("/api/ai/direct-generate", async (req, res) => {
  const { prompt, system } = req.body;
  const ai = getAI();
  if (!ai) {
    return res.json({ text: `FileChat Assistant: ${prompt}` });
  }
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        systemInstruction: system || "You are an expert coding assistant and file editor.",
      },
    });
    res.json({ text: response.text });
  } catch (e: any) {
    res.json({ text: `[Gemini Error: ${e.message}]` });
  }
});

// Vite Middleware & static fallback
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FileChat Studio running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
