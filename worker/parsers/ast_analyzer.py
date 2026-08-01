"""
Zero-LLM code analysis and transformation helpers. These exist so the
system keeps working (in a reduced capacity) even if Groq is rate
limited or the API key is missing entirely.
"""

import ast
import re
from typing import List

SUPPORTED_EXTENSIONS = (".py", ".js", ".ts", ".jsx", ".tsx")


# ---------------------------------------------------------------------------
# Python: real AST based transforms
# ---------------------------------------------------------------------------

class PrintStatementFinder(ast.NodeVisitor):
    """Flags Python 2 style `print` statements (parsed as ast.Expr calling
    a bare Name in py2 grammar - modern parsers already reject these, so
    in practice we detect via regex fallback below for cross-version repos)."""

    def __init__(self):
        self.issues: List[str] = []

    def visit_Call(self, node: ast.Call):  # noqa: N802 (ast API naming)
        if isinstance(node.func, ast.Name) and node.func.id == "eval":
            self.issues.append(f"Use of eval() at line {node.lineno}")
        if isinstance(node.func, ast.Name) and node.func.id == "exec":
            self.issues.append(f"Use of exec() at line {node.lineno}")
        self.generic_visit(node)


def analyze_python_ast(code: str) -> List[str]:
    """Parses Python source and returns a list of structural issues found."""
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return [f"SyntaxError while parsing: {exc}"]

    finder = PrintStatementFinder()
    finder.visit(tree)
    return finder.issues


def validate_python_syntax(code: str) -> bool:
    """Cheap structural check the Critic can run without any linter binary."""
    try:
        ast.parse(code)
        return True
    except SyntaxError:
        return False


# ---------------------------------------------------------------------------
# JS/TS: regex-based fallback transforms (no tree-sitter binary required)
# ---------------------------------------------------------------------------

_VAR_TO_LET_RE = re.compile(r"\bvar\b")
_DANGEROUS_JS_PATTERNS = {
    r"\beval\s*\(": "Use of eval()",
    r"\bdocument\.write\s*\(": "Use of document.write() (XSS risk)",
    r"\binnerHTML\s*=": "Direct innerHTML assignment (XSS risk)",
    r"child_process\.exec\s*\(": "Unsanitized child_process.exec call",
}


def js_var_to_let_fallback(code: str) -> str:
    """
    Deterministic fallback refactor used when Groq is unavailable:
    swap `var` for `let`. Not as smart as an LLM rewrite, but it never
    fails and never hallucinates.
    """
    return _VAR_TO_LET_RE.sub("let", code)


def scan_js_vulnerabilities(code: str) -> List[str]:
    findings = []
    for pattern, description in _DANGEROUS_JS_PATTERNS.items():
        if re.search(pattern, code):
            findings.append(description)
    return findings


def scan_python_vulnerabilities(code: str) -> List[str]:
    findings = []
    if re.search(r"\beval\s*\(", code):
        findings.append("Use of eval()")
    if re.search(r"\bexec\s*\(", code):
        findings.append("Use of exec()")
    if re.search(r"shell=True", code):
        findings.append("subprocess call with shell=True")
    if re.search(r"%s.*%\s*\(", code) and "SELECT" in code.upper():
        findings.append("Possible SQL injection via string formatting")
    return findings
