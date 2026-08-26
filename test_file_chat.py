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
import unittest

# Import modules from file_chat
from file_chat import (
    chunk_text,
    IncrementalRetrievalEngine,
    EditOperation,
    UndoRedoManager,
    AuditLogger,
    DocumentWatchHandler,
    FileChatCLI,
    DEFAULT_CONFIG
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


if __name__ == "__main__":
    unittest.main()
