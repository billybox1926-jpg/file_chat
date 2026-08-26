#!/usr/bin/env python3
"""
Unit and Integration Test Suite for file_chat.py
Tests retrieval engine, incremental indexer, diff pipeline, undo/redo, batch editing,
audit logging, watchdog handlers, and config persistence.
"""

import os
import sys
import json
import time
import shutil
import tempfile
import threading
import unittest

# Import modules from file_chat
from file_chat import (
    chunk_text,
    IncrementalRetrievalEngine,
    EditOperation,
    UndoRedoManager,
    AuditLogger,
    DocumentWatchHandler,
    PollingWatchdog,
    FileChatCLI,
    DEFAULT_CONFIG,
    parse_replace_instruction
)

class TestFileChat(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="filechat_test_")
        self.session_dir = os.path.join(self.test_dir, ".filechat_sessions")
        self.audit_file = os.path.join(self.test_dir, "test_audit.log")
        self.config_file = os.path.join(self.test_dir, "test_config.json")
        
        with open(self.config_file, "w", encoding="utf-8") as f:
            json.dump(DEFAULT_CONFIG, f)

        # Create sample files
        self.file_a = os.path.join(self.test_dir, "doc_a.md")
        with open(self.file_a, "w", encoding="utf-8") as f:
            f.write("# Introduction to Vector Search\n\nVector databases use embeddings to find semantically similar text.\nHybrid search pairs BM25/TF-IDF with dense vector indices.")

        self.file_b = os.path.join(self.test_dir, "auth_service.py")
        with open(self.file_b, "w", encoding="utf-8") as f:
            f.write("def authenticate_user(username, password):\n    \"\"\"Validates user credentials.\"\"\"\n    if username == 'admin':\n        return True\n    return False\n")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_chunking_logic(self):
        sample_text = "Word " * 200
        chunks = chunk_text(sample_text, chunk_size=100, chunk_overlap=20)
        self.assertGreater(len(chunks), 1)
        for chunk, start, end in chunks:
            self.assertLessEqual(len(chunk), 120)
            self.assertGreaterEqual(end, start)

    def test_incremental_indexing(self):
        engine = IncrementalRetrievalEngine(chunk_size=150, chunk_overlap=30)
        
        # Initial indexing
        c1 = engine.add_or_update_file(self.file_a)
        self.assertGreater(c1, 0)
        self.assertEqual(len(engine.file_chunk_map), 1)
        
        # Add second file
        c2 = engine.add_or_update_file(self.file_b)
        self.assertGreater(c2, 0)
        self.assertEqual(len(engine.file_chunk_map), 2)
        total_chunks = len(engine.chunks)

        # Incrementally modify file_a
        with open(self.file_a, "w", encoding="utf-8") as f:
            f.write("# Updated Vector Document\n\nNow includes FAISS index clustering techniques and TF-IDF.")
        
        c1_updated = engine.add_or_update_file(self.file_a)
        self.assertEqual(len(engine.file_chunk_map), 2)
        
        # Search query for updated term
        results = engine.search("clustering", top_k=2)
        self.assertGreater(len(results), 0)
        self.assertIn("clustering", results[0]["text"].lower())

        # Test remove file
        engine.remove_file(self.file_b)
        self.assertNotIn(self.file_b, engine.file_chunk_map)
        self.assertEqual(len(engine.file_chunk_map), 1)

    def test_hybrid_search_scoring(self):
        engine = IncrementalRetrievalEngine(chunk_size=200, chunk_overlap=20)
        engine.add_or_update_file(self.file_a)
        engine.add_or_update_file(self.file_b)

        results = engine.search("authenticate user credentials", top_k=2)
        self.assertGreater(len(results), 0)
        self.assertEqual(results[0]["file_path"], self.file_b)
        self.assertGreater(results[0]["score"], 0)

    def test_diff_generation_and_stats(self):
        orig = "line 1\nline 2\nline 3\n"
        new = "line 1\nline 2 MODIFIED\nline 3\nline 4 ADDED\n"
        op = EditOperation("test.txt", orig, new, description="test edit")
        
        self.assertTrue(op.diff.startswith("--- a/test.txt"))
        stats = op.stats()
        self.assertGreaterEqual(stats["additions"], 2)
        self.assertGreaterEqual(stats["deletions"], 1)

    def test_dry_run_vs_apply_execution(self):
        cli = FileChatCLI(target_dir=self.test_dir, config_path=self.config_file)
        
        # Dry run should NOT change file on disk
        res_dry = cli.execute_edit("doc_a.md", "replace 'Vector' with 'Neural'", dry_run=True)
        self.assertTrue(res_dry["success"])
        self.assertTrue(res_dry["dry_run"])
        with open(self.file_a, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("Vector", content)

        # Apply edit SHOULD change file on disk
        res_apply = cli.execute_edit("doc_a.md", "replace 'Vector' with 'Neural'", dry_run=False)
        self.assertTrue(res_apply["success"])
        self.assertFalse(res_apply["dry_run"])
        with open(self.file_a, "r", encoding="utf-8") as f:
            updated_content = f.read()
        self.assertIn("Neural", updated_content)

    def test_undo_redo_pipeline(self):
        cli = FileChatCLI(target_dir=self.test_dir, config_path=self.config_file)
        with open(self.file_b, "r", encoding="utf-8") as f:
            initial_content = f.read()

        # Apply change
        cli.execute_edit("auth_service.py", "replace 'admin' with 'superuser'", dry_run=False)
        with open(self.file_b, "r", encoding="utf-8") as f:
            self.assertIn("superuser", f.read())

        # Undo
        reverted = cli.undo_mgr.undo()
        self.assertIsNotNone(reverted)
        with open(self.file_b, "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), initial_content)

        # Redo
        redone = cli.undo_mgr.redo()
        self.assertIsNotNone(redone)
        with open(self.file_b, "r", encoding="utf-8") as f:
            self.assertIn("superuser", f.read())

    def test_audit_logging(self):
        logger = AuditLogger(self.audit_file)
        logger.log("test_action", "sample.py", {"key": "val123"})
        records = logger.get_recent(5)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["action"], "test_action")
        self.assertEqual(records[0]["file"], "sample.py")
        self.assertEqual(records[0]["details"]["key"], "val123")

    def test_watchdog_event_handler(self):
        engine = IncrementalRetrievalEngine()
        events_received = []

        def callback(event, msg):
            events_received.append((event, msg))

        handler = DocumentWatchHandler(engine, on_change_callback=callback)
        handler.handle_event("created", self.file_a)
        self.assertEqual(len(events_received), 1)
        self.assertEqual(len(engine.file_chunk_map), 1)

        handler.handle_event("deleted", self.file_a)
        self.assertEqual(len(events_received), 2)
        self.assertEqual(len(engine.file_chunk_map), 0)

    def test_workspace_isolation_traversal_rejection(self):
        cli = FileChatCLI(target_dir=self.test_dir)
        # Attempt to edit a file outside target_dir
        res = cli.execute_edit("../../package.json", "replace x with y", dry_run=False)
        self.assertFalse(res["success"])
        self.assertIn("Access denied", res["error"])

        res_dry = cli.execute_edit("/etc/passwd", "modify content", dry_run=True)
        self.assertFalse(res_dry["success"])
        self.assertIn("Access denied", res_dry["error"])

    def test_replace_with_embedded_with(self):
        """Verify replacement when target string contains the word 'with'."""
        cli = FileChatCLI(target_dir=self.test_dir)
        original = "validate username with password credentials before login"
        instruction = "replace 'username with password' with 'credentials'"
        
        # Test parser output
        parsed = parse_replace_instruction(instruction)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed[0], "username with password")
        self.assertEqual(parsed[1], "credentials")
        
        # Test content generation
        revised = cli._generate_revised_content(original, instruction, "prompt", [])
        self.assertEqual(revised, "validate credentials credentials before login")

        # Test double quotes variant with multiple embedded 'with'
        instr_double = 'replace "connect with server with ssl" with "secure_connect()"'
        parsed_double = parse_replace_instruction(instr_double)
        self.assertIsNotNone(parsed_double)
        self.assertEqual(parsed_double[0], "connect with server with ssl")
        self.assertEqual(parsed_double[1], "secure_connect()")
        
        orig_double = "def init(): connect with server with ssl"
        rev_double = cli._generate_revised_content(orig_double, instr_double, "prompt", [])
        self.assertEqual(rev_double, "def init(): secure_connect()")

    def test_replace_with_trailing_text(self):
        """Verify replacement when instruction contains trailing notes or instructions."""
        cli = FileChatCLI(target_dir=self.test_dir)
        
        # Test quoted target & replacement with trailing comment
        instruction = "replace 'a' with 'b' and add comment"
        parsed = parse_replace_instruction(instruction)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed[0], "a")
        self.assertEqual(parsed[1], "b")
        
        original = "let x = 1; let y = 2;"
        instr2 = "replace 'x' with 'z' and add comment"
        revised = cli._generate_revised_content(original, instr2, "prompt", [])
        self.assertEqual(revised, "let z = 1; let y = 2;")

        # Test with trailing 'then' or 'where'
        instr3 = "replace 'oldMethod()' with 'newMethod()' then verify"
        parsed3 = parse_replace_instruction(instr3)
        self.assertIsNotNone(parsed3)
        self.assertEqual(parsed3[0], "oldMethod()")
        self.assertEqual(parsed3[1], "newMethod()")

    def test_replace_with_no_quotes(self):
        """Verify replacement for bare words without quotes and words containing 'with' like 'width'."""
        cli = FileChatCLI(target_dir=self.test_dir)
        original = "style: width = 100px;"
        instruction = "replace width with height"
        
        parsed = parse_replace_instruction(instruction)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed[0], "width")
        self.assertEqual(parsed[1], "height")
        
        revised = cli._generate_revised_content(original, instruction, "prompt", [])
        self.assertEqual(revised, "style: height = 100px;")

        # Bare words with trailing phrase
        instr_bare_trailing = "replace alpha with beta and update docs"
        parsed_bare_trailing = parse_replace_instruction(instr_bare_trailing)
        self.assertIsNotNone(parsed_bare_trailing)
        self.assertEqual(parsed_bare_trailing[0], "alpha")
        self.assertEqual(parsed_bare_trailing[1], "beta")

    def test_execute_edit_end_to_end_no_corruption(self):
        """Verify full execute_edit cycle on disk without corrupted replacement."""
        cli = FileChatCLI(target_dir=self.test_dir)
        
        # Test editing file_a with target containing 'with'
        instr = "replace 'BM25/TF-IDF with dense vector indices' with 'neural search algorithms'"
        res = cli.execute_edit(os.path.basename(self.file_a), instr, dry_run=False)
        self.assertTrue(res["success"], f"Edit failed: {res.get('error')}")
        
        with open(self.file_a, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("neural search algorithms", content)
        self.assertNotIn("BM25/TF-IDF with dense vector indices", content)

    def test_polling_watchdog_thread_safety_and_events(self):
        """Verify that PollingWatchdog captures file events under concurrent access without race conditions."""
        watch_dir = tempfile.mkdtemp(prefix="watchdog_test_")
        try:
            indexer = IncrementalRetrievalEngine()
            captured_events = []
            event_lock = threading.Lock()

            def on_change(entry, msg):
                with event_lock:
                    captured_events.append((entry.get("path"), msg))

            handler = DocumentWatchHandler(indexer, on_change_callback=on_change)
            watchdog = PollingWatchdog(watch_dir, handler, interval=0.05)
            
            # Start watchdog
            watchdog.start()
            self.assertTrue(watchdog.running)

            # Perform concurrent file additions and modifications
            def worker(worker_id):
                for i in range(5):
                    f_path = os.path.join(watch_dir, f"file_{worker_id}_{i}.txt")
                    with open(f_path, "w", encoding="utf-8") as f:
                        f.write(f"Initial content from worker {worker_id} - {i}\n")
                    time.sleep(0.02)
                    with open(f_path, "a", encoding="utf-8") as f:
                        f.write(f"Appended update {i}\n")

            threads = [threading.Thread(target=worker, args=(w,)) for w in range(3)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()

            # Allow watchdog loop to pick up events
            time.sleep(0.3)

            # Test stopping watchdog
            watchdog.stop()
            self.assertFalse(watchdog.running)

            # Verify events were captured and indexed
            with event_lock:
                self.assertGreater(len(captured_events), 0)
            self.assertGreater(len(indexer.chunks), 0)
        finally:
            shutil.rmtree(watch_dir, ignore_errors=True)

    def test_polling_watchdog_no_event_loss_under_concurrency(self):
        """Every concurrently created file must be reported exactly once (no dropped events)."""
        watch_dir = tempfile.mkdtemp(prefix="watchdog_loss_")
        try:
            created = set()
            lock = threading.Lock()

            def on_change(entry, msg):
                if entry.get("type") == "created":
                    with lock:
                        created.add(entry.get("path"))

            handler = DocumentWatchHandler(
                IncrementalRetrievalEngine(), on_change_callback=on_change
            )
            watchdog = PollingWatchdog(watch_dir, handler, interval=0.05)
            watchdog.start()

            n_workers, n_files = 4, 10

            def worker(wid):
                for i in range(n_files):
                    with open(os.path.join(watch_dir, f"w{wid}_{i}.txt"), "w", encoding="utf-8") as f:
                        f.write("payload")
                    time.sleep(0.01)

            threads = [threading.Thread(target=worker, args=(w,)) for w in range(n_workers)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()

            time.sleep(0.6)
            watchdog.stop()

            on_disk = {os.path.join(watch_dir, f) for f in os.listdir(watch_dir)}
            self.assertEqual(len(on_disk), n_workers * n_files)
            # No file may go unreported — this is the regression the race caused.
            self.assertEqual(on_disk - created, set())
        finally:
            shutil.rmtree(watch_dir, ignore_errors=True)

    def test_polling_watchdog_start_is_idempotent(self):
        """Repeated start() must not spawn redundant polling threads."""
        watch_dir = tempfile.mkdtemp(prefix="watchdog_idem_")
        try:
            handler = DocumentWatchHandler(IncrementalRetrievalEngine())
            watchdog = PollingWatchdog(watch_dir, handler, interval=0.05)

            baseline = threading.active_count()
            for _ in range(4):
                watchdog.start()
            time.sleep(0.1)
            self.assertEqual(threading.active_count() - baseline, 1)

            first_thread = watchdog.thread
            watchdog.start()
            self.assertIs(watchdog.thread, first_thread)

            watchdog.stop()
            time.sleep(0.2)
            self.assertFalse(watchdog.running)
            self.assertFalse(first_thread.is_alive())
        finally:
            shutil.rmtree(watch_dir, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
