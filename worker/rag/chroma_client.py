import os
from typing import List, Dict, Any

_in_memory_client = None


class DummyCollection:
    """Fallback dummy collection if chromadb is unavailable or fails."""

    def __init__(self, name: str):
        self.name = name
        self._docs: List[Dict[str, Any]] = []

    def count(self) -> int:
        return len(self._docs)

    def upsert(self, documents: List[str], ids: List[str], **kwargs):
        for doc, doc_id in zip(documents, ids):
            self._docs.append({"id": doc_id, "document": doc})

    def query(self, query_texts: List[str], n_results: int = 3, **kwargs) -> Dict[str, List[List[Any]]]:
        found_docs = []
        found_dists = []
        q = (query_texts[0] if query_texts else "").lower()
        for d in self._docs:
            doc_text = d["document"]
            if any(w in doc_text.lower() for w in q.split() if len(w) > 3):
                found_docs.append(doc_text)
                found_dists.append(0.5)
                if len(found_docs) >= n_results:
                    break
        return {"documents": [found_docs], "distances": [found_dists]}


def get_chroma_client():
    global _in_memory_client
    host = os.getenv("CHROMA_HOST", "localhost")
    port = int(os.getenv("CHROMA_PORT", "8000"))

    try:
        import chromadb
        try:
            client = chromadb.HttpClient(host=host, port=port)
            client.heartbeat()
            return client
        except Exception:
            if _in_memory_client is None:
                _in_memory_client = chromadb.Client()
            return _in_memory_client
    except Exception as exc:
        print(f"[chroma_client] ChromaDB error: {exc}. Using fallback.")
        return None


def get_code_collection():
    client = get_chroma_client()
    if client is not None:
        try:
            return client.get_or_create_collection(name="code_collection")
        except Exception as exc:
            print(f"[chroma_client] Failed to get code_collection: {exc}")
    return DummyCollection("code_collection")


def get_cve_collection():
    client = get_chroma_client()
    collection = None
    if client is not None:
        try:
            collection = client.get_or_create_collection(name="cve_collection")
        except Exception as exc:
            print(f"[chroma_client] Failed to get cve_collection: {exc}")

    if collection is None:
        collection = DummyCollection("cve_collection")

    try:
        if collection.count() == 0:
            sample_cves = [
                ("eval(user_input) - Arbitrary code execution vulnerability via eval()", "cve_001"),
                ("exec(untrusted_code) - Code injection vulnerability via exec()", "cve_002"),
                ("child_process.exec(cmd) - Command injection vulnerability", "cve_003"),
                ("document.write(location.hash) - Cross-site scripting (XSS)", "cve_004"),
                ("innerHTML = untrusted - DOM-based XSS vulnerability", "cve_005"),
                ("cursor.execute('SELECT * FROM users WHERE name=' + name) - SQL injection", "cve_006"),
            ]
            collection.upsert(
                documents=[c[0] for c in sample_cves],
                ids=[c[1] for c in sample_cves],
            )
    except Exception:
        pass

    return collection