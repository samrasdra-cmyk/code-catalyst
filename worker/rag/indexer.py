"""
Clones (or reuses an already-cloned) repo, splits source files into
function/class-sized chunks, and stores them in the ChromaDB code
collection so the Security agent can later do similarity search
against the CVE pattern collection.
"""

import ast
import os
from typing import List, Tuple

from .chroma_client import get_code_collection

SUPPORTED_EXTENSIONS = (".py", ".js", ".ts", ".jsx", ".tsx")


def _chunk_python_file(source: str) -> List[str]:
    """Split a Python file into per-function/class source chunks using ast."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return [source]  # fall back to indexing the whole file as one chunk

    chunks = []
    lines = source.splitlines()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            start = node.lineno - 1
            end = getattr(node, "end_lineno", start + 1)
            chunk = "\n".join(lines[start:end])
            if chunk.strip():
                chunks.append(chunk)
    return chunks or [source]


def _chunk_js_file(source: str) -> List[str]:
    """
    Lightweight heuristic chunker for JS/TS (no tree-sitter binary
    dependency): split on top-level function/class/const-arrow
    declarations. Good enough for RAG chunk granularity.
    """
    import re

    pattern = re.compile(
        r"(?:^|\n)(?:export\s+)?(?:async\s+)?(?:function\s+\w+|class\s+\w+|"
        r"const\s+\w+\s*=\s*(?:async\s*)?\()"
    )
    indices = [m.start() for m in pattern.finditer(source)]
    if not indices:
        return [source]

    chunks = []
    for i, start in enumerate(indices):
        end = indices[i + 1] if i + 1 < len(indices) else len(source)
        chunk = source[start:end].strip()
        if chunk:
            chunks.append(chunk)
    return chunks


def chunk_file(path: str, source: str) -> List[str]:
    if path.endswith(".py"):
        return _chunk_python_file(source)
    return _chunk_js_file(source)


def index_repo(local_path: str) -> Tuple[int, int]:
    """
    Walks local_path, chunks every supported source file, and upserts
    the chunks into ChromaDB. Returns (files_indexed, chunks_indexed).
    """
    collection = get_code_collection()
    files_indexed = 0
    chunks_indexed = 0

    for root, _dirs, filenames in os.walk(local_path):
        if "/.git" in root or "node_modules" in root:
            continue
        for filename in filenames:
            if not filename.endswith(SUPPORTED_EXTENSIONS):
                continue
            full_path = os.path.join(root, filename)
            try:
                with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                    source = f.read()
            except OSError:
                continue

            chunks = chunk_file(full_path, source)
            if not chunks:
                continue

            rel_path = os.path.relpath(full_path, local_path)
            ids = [f"{rel_path}:{i}" for i in range(len(chunks))]
            collection.upsert(documents=chunks, ids=ids)

            files_indexed += 1
            chunks_indexed += len(chunks)

    return files_indexed, chunks_indexed
