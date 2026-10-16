"""SQLite scan history and durable, bounded work queue."""

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from time import time


def now():
    return datetime.now(timezone.utc).isoformat()


class QueueFull(Exception):
    pass


class Storage:
    def __init__(self, path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("""CREATE TABLE IF NOT EXISTS scans (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, url TEXT NOT NULL,
                status TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, max_pages INTEGER NOT NULL,
                max_depth INTEGER NOT NULL, pages TEXT NOT NULL DEFAULT '[]',
                error TEXT, stop_reason TEXT, pages_scanned INTEGER NOT NULL DEFAULT 0,
                findings_count INTEGER NOT NULL DEFAULT 0,
                score INTEGER NOT NULL DEFAULT 0,
                stack TEXT NOT NULL DEFAULT 'html',
                source TEXT NOT NULL DEFAULT 'crawler',
                ai_prompt TEXT NOT NULL DEFAULT '')""")
            for col, decl in (
                ("score", "INTEGER NOT NULL DEFAULT 0"),
                ("stack", "TEXT NOT NULL DEFAULT 'html'"),
                ("source", "TEXT NOT NULL DEFAULT 'crawler'"),
                ("ai_prompt", "TEXT NOT NULL DEFAULT ''"),
            ):
                try:
                    db.execute(f"ALTER TABLE scans ADD COLUMN {col} {decl}")
                except sqlite3.OperationalError:
                    pass
            db.execute("CREATE INDEX IF NOT EXISTS scan_owner ON scans(owner)")
            db.execute("""CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY, url TEXT NOT NULL, score INTEGER NOT NULL,
                stack TEXT NOT NULL, scan_snapshot TEXT NOT NULL,
                created_at TEXT NOT NULL, expires_at TEXT NOT NULL)""")
            db.execute(
                "CREATE TABLE IF NOT EXISTS admissions (created_at REAL NOT NULL)"
            )

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def serialize(row, detail=True):
        result = dict(row)
        result.pop("owner", None)
        if detail:
            result["pages"] = json.loads(result.pop("pages"))
        return result

    def create(self, owner, url, max_pages, max_depth):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            pending = db.execute(
                "SELECT owner FROM scans WHERE status IN ('queued', 'running')"
            ).fetchall()
            if len(pending) >= 20 or sum(r["owner"] == owner for r in pending) >= 3:
                raise QueueFull()
            # This independent ledger survives history deletion and cookie rotation.
            admission_time = time()
            db.execute(
                "DELETE FROM admissions WHERE created_at <= ?", (admission_time - 600,)
            )
            if db.execute("SELECT count(*) FROM admissions").fetchone()[0] >= 30:
                raise QueueFull()
            db.execute("INSERT INTO admissions VALUES (?)", (admission_time,))
            # Bound disk consumption while preserving all active jobs.
            db.execute("""DELETE FROM scans WHERE id IN (
                SELECT id FROM scans WHERE status IN ('completed','failed')
                ORDER BY created_at DESC LIMIT -1 OFFSET 479)""")
            scan_id, timestamp = uuid.uuid4().hex, now()
            db.execute(
                """INSERT INTO scans
                (id,owner,url,status,created_at,updated_at,max_pages,max_depth)
                VALUES (?,?,?,'queued',?,?,?,?)""",
                (scan_id, owner, url, timestamp, timestamp, max_pages, max_depth),
            )
        return self.get(scan_id, owner)

    def get(self, scan_id, owner):
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM scans WHERE id=? AND owner=?", (scan_id, owner)
            ).fetchone()
        return self.serialize(row) if row else None

    def list(self, owner):
        with self.connect() as db:
            rows = db.execute(
                "SELECT id,url,status,created_at,updated_at,max_pages,max_depth,error,"
                "stop_reason,pages_scanned,findings_count,score,stack,source FROM scans WHERE owner=? "
                "ORDER BY created_at DESC LIMIT 100",
                (owner,),
            ).fetchall()
        return [self.serialize(row, detail=False) for row in rows]

    def create_completed(self, owner, url, max_pages, max_depth, result):
        pages = (result or {}).get("pages", [])
        scan_id, timestamp = uuid.uuid4().hex, now()
        with self.connect() as db:
            db.execute(
                """INSERT INTO scans
                (id,owner,url,status,created_at,updated_at,max_pages,max_depth,
                 pages,error,stop_reason,pages_scanned,findings_count,
                 score,stack,source,ai_prompt)
                VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?)""",
                (
                    scan_id,
                    owner,
                    url,
                    "completed",
                    timestamp,
                    timestamp,
                    max_pages,
                    max_depth,
                    json.dumps(pages),
                    None,
                    result.get("stop_reason") if result else None,
                    len(pages),
                    sum(len(p.get("findings", [])) for p in pages),
                    result.get("score", 0),
                    result.get("stack", "html"),
                    result.get("source", "relay"),
                    result.get("ai_prompt", ""),
                ),
            )
        return self.get(scan_id, owner)

    def create_report(self, scan_id_owner, scan, expires_days=90):
        import secrets
        from datetime import timedelta

        token = secrets.token_urlsafe(16)
        snapshot = {k: v for k, v in scan.items() if k not in {"owner"}}
        snapshot.pop("owner", None)
        now_ts = now()
        expires = (
            __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
            + timedelta(days=expires_days)
        ).isoformat()
        with self.connect() as db:
            db.execute(
                """INSERT INTO reports (id,url,score,stack,scan_snapshot,created_at,expires_at)
                VALUES (?,?,?,?,?,?,?)""",
                (
                    token,
                    scan["url"],
                    scan.get("score", 0),
                    scan.get("stack", "html"),
                    json.dumps(snapshot),
                    now_ts,
                    expires,
                ),
            )
        return token, expires

    def get_report(self, report_id):
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM reports WHERE id=?", (report_id,)
            ).fetchone()
        if not row:
            return None
        rowd = dict(row)
        # expiry check
        from datetime import datetime, timezone

        try:
            expires = datetime.fromisoformat(rowd["expires_at"])
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > expires:
                return None
        except ValueError:
            pass
        rowd["scan_snapshot"] = json.loads(rowd["scan_snapshot"])
        return rowd

    def delete(self, scan_id, owner):
        with self.connect() as db:
            return (
                db.execute(
                    """DELETE FROM scans WHERE id=? AND owner=?
                AND status IN ('completed','failed')""",
                    (scan_id, owner),
                ).rowcount
                > 0
            )

    def recover(self):
        with self.connect() as db:
            db.execute(
                "UPDATE scans SET status='queued', pages='[]', pages_scanned=0, "
                "findings_count=0, updated_at=? "
                "WHERE status='running'",
                (now(),),
            )

    def claim(self):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT * FROM scans WHERE status='queued' ORDER BY created_at LIMIT 1"
            ).fetchone()
            if not row:
                return None
            db.execute(
                "UPDATE scans SET status='running',updated_at=? WHERE id=?",
                (now(), row["id"]),
            )
        return self.serialize(row)

    def progress(self, scan_id, pages):
        with self.connect() as db:
            db.execute(
                "UPDATE scans SET pages=?,pages_scanned=?,findings_count=?,updated_at=? "
                "WHERE id=?",
                (
                    json.dumps(pages),
                    len(pages),
                    sum(len(page.get("findings", [])) for page in pages),
                    now(),
                    scan_id,
                ),
            )

    def finish(self, scan_id, result=None, error=None):
        result = result or {}
        pages = result.get("pages", [])
        with self.connect() as db:
            db.execute(
                """UPDATE scans SET status=?,pages=?,error=?,stop_reason=?,updated_at=?,
                pages_scanned=?,findings_count=?,score=?,stack=?,source=?,ai_prompt=? WHERE id=?""",
                (
                    "failed" if error else "completed",
                    json.dumps(pages),
                    error,
                    result.get("stop_reason"),
                    now(),
                    len(pages),
                    sum(len(page.get("findings", [])) for page in pages),
                    result.get("score", 0),
                    result.get("stack", "html"),
                    result.get("source", "crawler"),
                    result.get("ai_prompt", ""),
                    scan_id,
                ),
            )
