"""Shared project document store: files from engineers, permits and e-mail, versioned and searchable.

* Files are stored once by content hash (blobs/ab/abcdef...), never modified or deleted -> audit-safe.
* Every document has a doc_key (file name without revision/date tokens) and a revision parsed from the name,
  so 'A-101_revB.pdf' followed by 'A-101_revC.pdf' marks rev C as latest and rev B as superseded.
* Same content again -> duplicate (logged, not stored twice). Same doc_key + same revision + different content
  -> conflict: both kept, a person decides. Unknown senders -> pending until approved.
* Full-text search (SQLite FTS5) over file name, title, e-mail subject/body, extracted text and metadata,
  with a small multilingual synonym table (en/fi/sv/de/zh).
Pure standard library; pypdf (optional) adds PDF text, engine/ (optional) adds DXF/IFC content."""
import os, re, io, json, time, hashlib, sqlite3, threading, zipfile, unicodedata

ALLOWED_EXT = {".pdf", ".dwg", ".dxf", ".ifc", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".docx", ".xlsx",
               ".doc", ".xls", ".txt", ".csv", ".md", ".zip", ".eml"}
MAX_BYTES = int(os.environ.get("DOCS_MAX_BYTES", 200 * 1024 * 1024))

DISCIPLINE = [  # (label, regex on name/subject/text)
    ("structural",   r"(?<![^\W\d_])RAK(?![^\W\d_])|(?<![^\W\d_])S[-_]?\d{3}|rakenne|structur|statik|tragwerk"),
    ("hvac",         r"(?<![^\W\d_])LVI(?![^\W\d_])|(?<![^\W\d_])M[-_]?\d{3}|HVAC|ilmanvaihto|ventilat|plumbing|lüftung"),
    ("electrical",   r"(?<![^\W\d_])S[ÄA]H(?![^\W\d_])|(?<![^\W\d_])E[-_]?\d{3}|sähkö|electric|elektro"),
    ("fire",         r"(?<![^\W\d_])PALO(?![^\W\d_])|paloteknin|fire ?(?:safety|plan|report)|brandschutz|sprinkler"),
    ("architecture", r"(?<![^\W\d_])ARK(?![^\W\d_])|(?<![^\W\d_])A[-_]?\d{3}|arkkitehti|architect|pohjapiirustus|floor ?plan|grundriss"),
]
PERMIT = [
    ("building_permit",    r"rakennuslupa|building ?permit|baugenehmigung|bygglov"),
    ("action_permit",      r"toimenpidelupa"),
    ("demolition_permit",  r"purkulupa|demolition"),
    ("landscape_permit",   r"maisematyölupa|landscape ?permit"),
    ("permit_other",       r"\blupa\b|\bpermit\b|genehmigung|tillstånd"),
]
SYNONYMS = [  # one group = interchangeable search words
    {"plan", "floorplan", "pohjapiirustus", "pohja", "grundriss", "planritning", "平面图", "平面"},
    {"permit", "lupa", "rakennuslupa", "genehmigung", "bygglov", "许可", "施工许可"},
    {"fire", "palo", "brand", "消防"},
    {"structural", "rakenne", "statik", "结构"},
    {"electrical", "sähkö", "elektro", "电气"},
    {"hvac", "lvi", "ilmanvaihto", "暖通"},
    {"section", "leikkaus", "schnitt", "剖面"},
    {"elevation", "julkisivu", "ansicht", "立面"},
    {"latest", "newest", "uusin", "neueste", "最新"},
    {"toilet", "wc", "马桶", "卫生间"},
]

def _now(): return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def safe_name(name):
    """Keep only the base name, drop control/path characters; never trust a name from an e-mail."""
    name = unicodedata.normalize("NFC", os.path.basename((name or "").replace("\\", "/"))).strip()
    name = re.sub(r"[\x00-\x1f<>:\"/\\|?*]", "_", name).lstrip(".")
    return name[:180] or "unnamed"

REV_PATTERNS = [
    ("letter", re.compile(r"[ _\-.(]rev(?:ision)?[ _\-.]?([A-Z]{1,2})(?=$|[ _\-.)])", re.I)),
    ("num",    re.compile(r"[ _\-.(]rev(?:ision)?[ _\-.]?(\d{1,3})(?=$|[ _\-.)])", re.I)),
    ("num",    re.compile(r"[ _\-.(]v(?:er)?[ _\-.]?(\d{1,3})(?=$|[ _\-.)])", re.I)),
    ("num",    re.compile(r"[ _\-.(]r(\d{1,3})(?=$|[ _\-.)])", re.I)),
    ("letter", re.compile(r"[ _\-.(]muutos[ _\-.]?([A-Z]{1,2})(?=$|[ _\-.)])", re.I)),
]
DATE_RX = re.compile(r"(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])")

def parse_revision(filename):
    """-> (doc_key, rev_label, rev_kind, rev_rank). rev_rank compares only within the same rev_kind."""
    stem = os.path.splitext(safe_name(filename))[0]
    label, kind, rank, rest = None, "none", 0, stem
    for k, rx in REV_PATTERNS:
        m = rx.search(rest)
        if m:
            label, kind = m.group(1).upper(), k
            rank = int(label) if k == "num" else sum((ord(ch) - 64) * 26 ** i for i, ch in enumerate(reversed(label)))
            rest = rest[:m.start()] + rest[m.end():]
            break
    d = DATE_RX.search(rest)
    if d:
        if kind == "none": label, kind, rank = "-".join(d.groups()), "date", int("".join(d.groups()))
        rest = rest[:d.start()] + rest[d.end():]
    key = re.sub(r"[^0-9a-zåäöü]+", "-", rest.lower()).strip("-") or stem.lower()
    return key, label, kind, rank

def classify(text, table):
    for label, rx in table:
        if re.search(rx, text or "", re.I | re.M): return label
    return None

def extract_text(path, ext, limit=200_000):
    """Best-effort searchable text. Never raises."""
    try:
        if ext in (".txt", ".csv", ".md"):
            return open(path, "rb").read(limit).decode("utf-8", "replace")
        if ext == ".pdf":
            try: from pypdf import PdfReader
            except ImportError: return ""
            r = PdfReader(path); out = []
            for p in r.pages[:40]:
                out.append(p.extract_text() or "")
                if sum(map(len, out)) > limit: break
            return "\n".join(out)[:limit]
        if ext in (".docx", ".xlsx"):
            z = zipfile.ZipFile(path)
            names = ["word/document.xml"] if ext == ".docx" else ["xl/sharedStrings.xml"]
            xml = " ".join(z.read(n).decode("utf-8", "replace") for n in names if n in z.namelist())
            return re.sub(r"<[^>]+>", " ", xml)[:limit]
        if ext == ".dxf":   # drawing texts: room names, numbers, title block
            from engine.dxf import read_entities
            return " ".join(e.get("text", "") for e in read_entities(path) if e.get("type") in ("TEXT", "MTEXT"))[:limit]
        if ext == ".ifc":   # model summary: storeys, spaces, element counts
            from engine import ifc
            M = ifc.load(path)
            parts = ["storeys: " + ", ".join(s["name"] or "" for s in M["storeys"]),
                     "spaces: " + ", ".join((s.get("long") or s.get("name") or "") for s in M["spaces"][:500])]
            cnt = {}
            for e in M["elements"]: cnt[e["cls"]] = cnt.get(e["cls"], 0) + 1
            parts.append("elements: " + ", ".join(f"{k} {v}" for k, v in sorted(cnt.items())))
            return "\n".join(parts)[:limit]
    except Exception:
        return ""
    return ""

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents(
  id INTEGER PRIMARY KEY, project TEXT, doc_key TEXT, title TEXT, filename TEXT, ext TEXT,
  sha256 TEXT, size INTEGER, rev_label TEXT, rev_kind TEXT, rev_rank INTEGER,
  discipline TEXT, permit TEXT, status TEXT, uploaded_by TEXT, uploaded_at TEXT, source TEXT,
  message_id TEXT, email_subject TEXT, note TEXT, supersedes INTEGER);
CREATE INDEX IF NOT EXISTS ix_key ON documents(project, doc_key);
CREATE INDEX IF NOT EXISTS ix_sha ON documents(project, sha256);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, ts TEXT, actor TEXT, action TEXT, doc_id INTEGER, detail TEXT);
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(filename, title, subject, body, content, meta, tokenize='unicode61');
"""
# status: latest | superseded | conflict | pending | rejected

class DocsStore:
    def __init__(self, root=None):
        self.root = os.path.abspath(root or os.environ.get("DOCS_ROOT", os.path.expanduser("~/.cache/trace-docs")))
        os.makedirs(os.path.join(self.root, "blobs"), exist_ok=True)
        self.db = sqlite3.connect(os.path.join(self.root, "index.sqlite"), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        self.lock = threading.RLock()

    # ---------- internals
    def _blob(self, sha):
        return os.path.join(self.root, "blobs", sha[:2], sha)

    def _log(self, actor, action, doc_id=None, **detail):
        self.db.execute("INSERT INTO events(ts,actor,action,doc_id,detail) VALUES(?,?,?,?,?)",
                        (_now(), actor, action, doc_id, json.dumps(detail, ensure_ascii=False)))

    def _row(self, doc_id):
        r = self.db.execute("SELECT * FROM documents WHERE id=?", (doc_id,)).fetchone()
        return dict(r) if r else None

    # ---------- write
    def add(self, data, filename, *, actor="unknown", source="web", project="default", title=None,
            doc_key=None, revision=None, message_id=None, email_subject=None, email_body=None,
            note=None, pending=False):
        """Store one file. -> {"status": stored|duplicate|conflict|pending|rejected, "document": {...},
        "superseded": [...], "reason": str}"""
        name = safe_name(filename); ext = os.path.splitext(name)[1].lower()
        if ext not in ALLOWED_EXT:
            with self.lock: self._log(actor, "rejected", None, filename=name, reason="file type not allowed"); self.db.commit()
            return {"status": "rejected", "document": None, "superseded": [], "reason": f"file type {ext or '(none)'} not allowed"}
        if len(data) > MAX_BYTES:
            return {"status": "rejected", "document": None, "superseded": [], "reason": f"file larger than {MAX_BYTES} bytes"}
        sha = hashlib.sha256(data).hexdigest()
        with self.lock:
            dup = self.db.execute("SELECT id FROM documents WHERE project=? AND sha256=? AND status!='rejected' ORDER BY id LIMIT 1",
                                  (project, sha)).fetchone()
            if dup:
                self._log(actor, "duplicate", dup["id"], filename=name, source=source, message_id=message_id); self.db.commit()
                return {"status": "duplicate", "document": self._row(dup["id"]), "superseded": [],
                        "reason": "identical content already filed"}
            p = self._blob(sha); os.makedirs(os.path.dirname(p), exist_ok=True)
            if not os.path.exists(p):
                with open(p, "wb") as f: f.write(data)
            key, label, kind, rank = parse_revision(name)
            if doc_key: key = re.sub(r"[^0-9a-zåäöü]+", "-", doc_key.lower()).strip("-")
            if revision:
                label = str(revision).upper()
                kind, rank = ("num", int(label)) if label.isdigit() else ("letter", sum((ord(c) - 64) * 26 ** i for i, c in enumerate(reversed(label))))
            text = extract_text(p, ext)
            own = " ".join(filter(None, [name, title]))                     # the file's own name decides first,
            more = " ".join(filter(None, [(text or "")[:4000], email_subject]))  # then its content, then the mail
            disc = classify(own, DISCIPLINE) or classify(more, DISCIPLINE)
            perm = classify(own, PERMIT) or classify(more, PERMIT)

            # ---- version decision against the current latest of this doc_key
            cur = self.db.execute("SELECT * FROM documents WHERE project=? AND doc_key=? AND status IN ('latest','conflict') ORDER BY id DESC",
                                  (project, key)).fetchall()
            superseded, status, reason, supersedes = [], "latest", "new document", None
            if pending:
                status, reason = "pending", "sender not on the allow-list: waiting for approval"
            elif cur:
                top = dict(cur[0])
                same_kind = top["rev_kind"] == kind and kind != "none"
                if same_kind and rank < top["rev_rank"]:
                    status, reason = "superseded", f"older revision {label} arrived after {top['rev_label']}"
                elif same_kind and rank == top["rev_rank"]:
                    status, reason = "conflict", f"revision {label} already filed with different content"
                    self.db.execute("UPDATE documents SET status='conflict' WHERE id=?", (top["id"],))
                elif same_kind or kind == "none" or top["rev_kind"] == "none" or top["rev_kind"] != kind:
                    # higher revision, or no comparable revision: the newest upload wins, flagged in the reason
                    reason = (f"revision {label} supersedes {top['rev_label']}" if same_kind else
                              "no comparable revision in the name: newest upload marked latest")
                    for r in cur:
                        self.db.execute("UPDATE documents SET status='superseded' WHERE id=?", (r["id"],))
                        superseded.append({"id": r["id"], "filename": r["filename"], "revision": r["rev_label"]})
                    supersedes = top["id"]
            cols = dict(project=project, doc_key=key, title=title or os.path.splitext(name)[0], filename=name, ext=ext,
                        sha256=sha, size=len(data), rev_label=label, rev_kind=kind, rev_rank=rank, discipline=disc,
                        permit=perm, status=status, uploaded_by=actor, uploaded_at=_now(), source=source,
                        message_id=message_id, email_subject=email_subject, note=note, supersedes=supersedes)
            cur_ = self.db.execute(f"INSERT INTO documents({','.join(cols)}) VALUES({','.join('?' * len(cols))})", list(cols.values()))
            did = cur_.lastrowid
            meta = " ".join(filter(None, [key, label, disc, perm, actor, source, project]))
            self.db.execute("INSERT INTO docs_fts(rowid,filename,title,subject,body,content,meta) VALUES(?,?,?,?,?,?,?)",
                            (did, name, cols["title"], email_subject or "", (email_body or "")[:20000], text or "", meta))
            self._log(actor, "filed", did, filename=name, status=status, reason=reason, source=source,
                      message_id=message_id, superseded=[s["id"] for s in superseded])
            self.db.commit()
            return {"status": "stored" if status in ("latest", "superseded") else status,
                    "document": self._row(did), "superseded": superseded, "reason": reason}

    def resolve(self, doc_id, action, actor="unknown"):
        """A person settles a pending/conflict item: action = approve | make_latest | reject."""
        with self.lock:
            d = self._row(doc_id)
            if not d: return None
            if action == "reject":
                self.db.execute("UPDATE documents SET status='rejected' WHERE id=?", (doc_id,))
            else:   # approve / make_latest: this one becomes latest, the rest of its doc_key superseded
                self.db.execute("UPDATE documents SET status='superseded' WHERE project=? AND doc_key=? AND status IN ('latest','conflict') AND id!=?",
                                (d["project"], d["doc_key"], doc_id))
                self.db.execute("UPDATE documents SET status='latest' WHERE id=?", (doc_id,))
            self._log(actor, action, doc_id); self.db.commit()
            return self._row(doc_id)

    # ---------- read
    def get(self, doc_id): return self._row(doc_id)

    def path(self, doc_id):
        """Absolute blob path, guaranteed inside the store (no traversal possible: path comes from the hash)."""
        d = self._row(doc_id)
        if not d or not re.fullmatch(r"[0-9a-f]{64}", d["sha256"] or ""): return None
        p = os.path.realpath(self._blob(d["sha256"]))
        return p if p.startswith(os.path.realpath(self.root) + os.sep) and os.path.exists(p) else None

    def versions(self, doc_key, project="default"):
        rows = self.db.execute("SELECT * FROM documents WHERE project=? AND doc_key=? ORDER BY id", (project, doc_key)).fetchall()
        return [dict(r) for r in rows]

    def events(self, limit=50, doc_id=None):
        q = "SELECT * FROM events" + (" WHERE doc_id=?" if doc_id else "") + " ORDER BY id DESC LIMIT ?"
        rows = self.db.execute(q, ((doc_id, limit) if doc_id else (limit,))).fetchall()
        return [{**dict(r), "detail": json.loads(r["detail"] or "{}")} for r in rows]

    def list(self, project="default", status=None, limit=100):
        q = "SELECT * FROM documents WHERE project=?" + (" AND status=?" if status else "") + " ORDER BY id DESC LIMIT ?"
        return [dict(r) for r in self.db.execute(q, (project, status, limit) if status else (project, limit)).fetchall()]

    @staticmethod
    def _terms(q):
        toks = [t for t in re.findall(r"[\w一-鿿]+", (q or "").lower()) if len(t) > 1 or re.match(r"[一-鿿]", t)]
        out = []
        for t in toks:
            out.append(t)
            for g in SYNONYMS:
                if t in g: out.extend(x for x in g if x != t)
        return list(dict.fromkeys(out))

    def search(self, q, *, project="default", latest_only=True, discipline=None, permit=None, limit=10):
        """-> [{document..., "score", "matched_in": [...], "snippet"}]. 'latest' in the query also forces latest_only."""
        terms = self._terms(q)
        if not terms: return []
        fts = " OR ".join('"' + t.replace('"', '') + '"*' for t in terms)
        where, args = ["docs_fts MATCH ?", "d.project=?"], [fts, project]
        if latest_only: where.append("d.status IN ('latest','conflict','pending')")   # pending shown, flagged
        if discipline: where.append("d.discipline=?"); args.append(discipline)
        if permit: where.append("d.permit=?"); args.append(permit)
        sql = f"""SELECT d.*, bm25(docs_fts, 10.0, 8.0, 1.0, 0.3, 2.0, 6.0) AS score,
                  snippet(docs_fts, -1, '[', ']', ' … ', 12) AS snip,
                  f.filename AS f_fn, f.title AS f_ti, f.subject AS f_su, f.body AS f_bo, f.content AS f_co, f.meta AS f_me
                  FROM docs_fts f JOIN documents d ON d.id=f.rowid WHERE {' AND '.join(where)}
                  ORDER BY score LIMIT ?"""
        try: rows = self.db.execute(sql, args + [limit]).fetchall()
        except sqlite3.OperationalError: return []
        out = []
        for r in rows:
            r = dict(r)
            fields = {"filename": r.pop("f_fn"), "title": r.pop("f_ti"), "email subject": r.pop("f_su"),
                      "email body": r.pop("f_bo"), "file content": r.pop("f_co"), "metadata": r.pop("f_me")}
            r["matched_in"] = [k for k, v in fields.items() if v and any(t in v.lower() for t in terms)]
            r["snippet"] = r.pop("snip"); r["score"] = round(-r["score"], 4)
            out.append(r)
        return out
