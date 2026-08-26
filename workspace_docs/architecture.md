# Architecture Overview

## System Components
The architecture consists of three primary layers:
1. **Presentation Layer**: React-based UI with interactive terminal and visual diff viewers.
2. **Retrieval Engine**: Hybrid FAISS vector store with fallback to TF-IDF token inverted index.
3. **Execution Pipeline**: Python CLI driver that executes patch applications, atomic writes, and git tracking.

## Incremental Indexing Strategy
When files are modified, the watchdog service detects file changes via OS inotify events.
Instead of rebuilding the entire corpus index, only affected document chunks are refreshed.
This guarantees sub-millisecond retrieval latency for workspaces with thousands of files.

## Fault Tolerance
Missing optional native libraries (such as faiss-cpu or scikit-learn) automatically fall back to pure-Python implementations with zero runtime crash.
