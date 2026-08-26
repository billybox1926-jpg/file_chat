# Production Deployment Protocol

## Pre-flight Checklist
1. Run full unit test suite: `python3 test_file_chat.py`.
2. Inspect dry-run diff previews before applying batch edits across repositories.
3. Validate session snapshots and audit log write permissions.
4. Verify Ollama or Gemini API credentials in environment or config.json.

## Recovery Procedures
In the event of an unintended diff application:
- Issue the `:undo` command in interactive mode to revert the latest patch snapshot.
- Or use `git checkout` / `git revert` if git commits were enabled during edit execution.
