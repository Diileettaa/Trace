"""E-mail intake: people CC the project mailbox, attachments are filed into the DocsStore automatically.

Two modes, same code path (ingest_message):
* demo / tests : feed .eml files              python -m agent.mail_ingest --eml tests/fixtures/emails/*.eml
* live mailbox : poll a dedicated IMAP inbox  python -m agent.mail_ingest --poll [--loop 60]
  env: DOCS_IMAP_HOST (default imap.gmail.com), DOCS_IMAP_USER, DOCS_IMAP_PASSWORD (an app password),
       DOCS_ALLOWED_SENDERS ("alice@firm.fi,@firm.fi"), DOCS_SEND_RECEIPTS=1 to reply with a filing receipt.
Credentials come only from the environment and are never logged or returned.

Safety: the mail body is stored as searchable text, never treated as instructions. Senders outside the
allow-list are filed as 'pending' (a person approves). Inline signature images are skipped. Links in the body
are recorded but not fetched (they usually need the sender's login)."""
import os, re, sys, email, imaplib, smtplib, argparse, json
from email import policy
from email.utils import parseaddr, getaddresses, make_msgid
from email.message import EmailMessage

INLINE_IMAGE_MAX = 60 * 1024          # small inline images are logos / signatures
PROJECT_TAG = re.compile(r"\[(?:project|proj|projekti|项目)\s*[:=]\s*([\w.\-]+)\]", re.I)
LINK = re.compile(r"https?://[^\s<>\"')\]]+")

def _allowed(sender, allow=None):
    allow = allow if allow is not None else [a.strip().lower() for a in os.environ.get("DOCS_ALLOWED_SENDERS", "").split(",") if a.strip()]
    if not allow: return True                    # no list configured: accept all (demo); set one for live use
    s = (sender or "").lower()
    return any(s == a or (a.startswith("@") and s.endswith(a)) for a in allow)

def _body_text(msg):
    part = msg.get_body(preferencelist=("plain", "html"))
    if part is None: return ""
    try: txt = part.get_content()
    except Exception: txt = (part.get_payload(decode=True) or b"").decode("utf-8", "replace")
    if part.get_content_type() == "text/html":
        txt = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", txt, flags=re.S | re.I)
        txt = re.sub(r"<[^>]+>", " ", txt)
    return re.sub(r"[ \t]+", " ", txt).strip()

def _attachments(msg, depth=0):
    """Yield (filename, bytes, content_type, inline) including files inside forwarded messages."""
    for part in msg.walk():
        ctype = part.get_content_type()
        if ctype == "message/rfc822" and depth < 3:
            for inner in part.iter_parts():
                yield from _attachments(inner, depth + 1)
            continue
        if part.is_multipart(): continue
        disp = (part.get_content_disposition() or "").lower()
        name = part.get_filename()
        if not name and disp != "attachment": continue
        data = part.get_payload(decode=True) or b""
        yield name or "attachment.bin", data, ctype, disp == "inline"

def _seen_table(store):
    store.db.execute("CREATE TABLE IF NOT EXISTS mail_seen(message_id TEXT PRIMARY KEY, ts TEXT, sender TEXT, subject TEXT, result TEXT)")

def ingest_message(raw, store, *, project=None, allow=None):
    """Parse one RFC 822 message and file its attachments. Returns a receipt dict (also stored)."""
    msg = email.message_from_bytes(raw, policy=policy.default)
    sender = parseaddr(msg.get("From", ""))[1].lower()
    mid = (msg.get("Message-ID") or "").strip() or make_msgid()
    subject = str(msg.get("Subject", "") or "")
    with store.lock:
        _seen_table(store)
        prev = store.db.execute("SELECT result FROM mail_seen WHERE message_id=?", (mid,)).fetchone()
    if prev:
        return {**json.loads(prev[0]), "status": "already_processed"}
    m = PROJECT_TAG.search(subject)
    project = project or (m.group(1) if m else os.environ.get("DOCS_PROJECT", "default"))
    body = _body_text(msg)
    ok_sender = _allowed(sender, allow)
    recipients = [a for _, a in getaddresses(msg.get_all("To", []) + msg.get_all("Cc", []))]
    filed, skipped = [], []
    for name, data, ctype, inline in _attachments(msg):
        if inline and ctype.startswith("image/") and len(data) < INLINE_IMAGE_MAX:
            skipped.append({"filename": name, "reason": "inline image (signature/logo)"}); continue
        r = store.add(data, name, actor=sender or "unknown", source="email", project=project,
                      message_id=mid, email_subject=subject, email_body=body, pending=not ok_sender,
                      note=f"from {sender} to {', '.join(recipients)[:300]}")
        d = r["document"] or {}
        filed.append({"filename": name, "status": r["status"], "reason": r["reason"], "id": d.get("id"),
                      "doc_key": d.get("doc_key"), "revision": d.get("rev_label"),
                      "superseded": [s["filename"] for s in r["superseded"]]})
    receipt = {"status": "processed", "message_id": mid, "from": sender, "subject": subject, "project": project,
               "sender_allowed": ok_sender, "filed": filed, "skipped": skipped,
               "links_not_fetched": sorted(set(LINK.findall(body)))[:20]}
    if not filed:
        receipt["note"] = "no attachments to file"
    with store.lock:
        store._log(sender or "unknown", "email", None, message_id=mid, subject=subject, files=len(filed),
                   sender_allowed=ok_sender)
        store.db.execute("INSERT OR REPLACE INTO mail_seen VALUES(?,datetime('now'),?,?,?)",
                         (mid, sender, subject, json.dumps(receipt, ensure_ascii=False)))
        store.db.commit()
    receipt["text"] = receipt_text(receipt)
    return receipt

def receipt_text(r):
    lines = [f"Filed from '{r['subject']}' (project {r['project']}):"]
    for f in r["filed"]:
        s = f"- {f['filename']}: {f['status']}"
        if f.get("revision"): s += f", revision {f['revision']}"
        if f.get("superseded"): s += f", replaces {', '.join(f['superseded'])}"
        if f["status"] in ("conflict", "pending", "rejected"): s += f" ({f['reason']})"
        lines.append(s)
    if not r["filed"]: lines.append("- no attachments found")
    if r.get("links_not_fetched"):
        lines.append("Links in the mail were not downloaded; please upload those files directly if they belong in the archive.")
    if not r["sender_allowed"]:
        lines.append("Your address is not on the project list yet, so the files wait for approval.")
    return "\n".join(lines)

# ---------------- live mailbox
def _cred():
    host = os.environ.get("DOCS_IMAP_HOST", "imap.gmail.com")
    user, pw = os.environ.get("DOCS_IMAP_USER"), os.environ.get("DOCS_IMAP_PASSWORD")
    if not (user and pw):
        raise RuntimeError("set DOCS_IMAP_USER and DOCS_IMAP_PASSWORD (app password) in the environment")
    return host, user, pw

def send_receipt(receipt, original_subject, to_addr):
    """Reply to an allow-listed sender with the filing receipt. Off unless DOCS_SEND_RECEIPTS=1."""
    if os.environ.get("DOCS_SEND_RECEIPTS") != "1" or not receipt.get("sender_allowed") or not to_addr: return False
    _, user, pw = _cred()
    m = EmailMessage()
    m["From"], m["To"] = user, to_addr
    m["Subject"] = "Re: " + re.sub(r"^(re:\s*)+", "", original_subject or "", flags=re.I)
    m["In-Reply-To"] = m["References"] = receipt["message_id"]
    m.set_content(receipt["text"])
    with smtplib.SMTP_SSL(os.environ.get("DOCS_SMTP_HOST", "smtp.gmail.com"), 465, timeout=30) as s:
        s.login(user, pw); s.send_message(m)
    return True

def poll_imap(store, folder="INBOX", limit=50):
    """Fetch unseen messages, file them, mark them seen. -> list of receipts."""
    host, user, pw = _cred()
    out = []
    M = imaplib.IMAP4_SSL(host, timeout=60)
    try:
        M.login(user, pw)
        M.select(folder)
        typ, data = M.uid("SEARCH", None, "UNSEEN")
        for uid in (data[0].split() if data and data[0] else [])[:limit]:
            typ, msgdata = M.uid("FETCH", uid, "(BODY.PEEK[])")
            raw = next((p[1] for p in msgdata if isinstance(p, tuple)), None)
            if raw is None: continue
            try:
                r = ingest_message(raw, store)
                if r["status"] == "processed":
                    try: r["receipt_sent"] = send_receipt(r, r["subject"], r["from"])
                    except Exception as e: r["receipt_error"] = type(e).__name__
                out.append(r)
                M.uid("STORE", uid, "+FLAGS", "(\\Seen)")
            except Exception as e:     # one bad mail must not stop the mailbox
                out.append({"status": "error", "uid": uid.decode(), "error": type(e).__name__ + ": " + str(e)[:200]})
    finally:
        try: M.logout()
        except Exception: pass
    return out

def main():
    from agent.docs_store import DocsStore
    ap = argparse.ArgumentParser()
    ap.add_argument("--eml", nargs="*"); ap.add_argument("--poll", action="store_true")
    ap.add_argument("--loop", type=int, default=0, help="poll every N seconds")
    ap.add_argument("--root"); ap.add_argument("--project")
    a = ap.parse_args(); store = DocsStore(a.root)
    for p in a.eml or []:
        r = ingest_message(open(p, "rb").read(), store, project=a.project); print(r["text"] if "text" in r else r["status"])
    if a.poll:
        import time
        while True:
            for r in poll_imap(store): print(json.dumps({k: v for k, v in r.items() if k != "text"}, ensure_ascii=False))
            if not a.loop: break
            time.sleep(a.loop)

if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    main()
