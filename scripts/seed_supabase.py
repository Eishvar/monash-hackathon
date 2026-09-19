"""Load the dataset into Supabase (idempotent): emails table, attachments bucket, warm LLM cache.

    python scripts/seed_supabase.py

Prerequisite: run supabase/schema.sql once in the Supabase SQL editor.
"""
import json
import mimetypes
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sdoc.config import BUNDLE, cache_dir  # noqa: E402  (also loads .env)
from sdoc.db import SupabaseRepo  # noqa: E402
from sdoc.store import BUCKET, LocalStore  # noqa: E402


def main() -> None:
    from supabase import create_client

    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    repo = SupabaseRepo(client)
    try:
        client.table("emails").select("email_id").limit(1).execute()
    except Exception as exc:
        sys.exit(f"Tables are missing ({str(exc)[:120]}). Run supabase/schema.sql in the Supabase SQL editor first.")

    if BUCKET not in {b.name for b in client.storage.list_buckets()}:
        client.storage.create_bucket(BUCKET, options={"public": False})
        print(f"created private bucket {BUCKET!r}")

    emails = LocalStore(BUNDLE).emails()
    repo.upsert_emails(
        [
            {"email_id": e["email_id"], "sender": e.get("from"), "subject": e.get("subject"), "body": e.get("body"),
             "attachments": e.get("attachments", [])}
            for e in emails
        ]
    )
    print(f"upserted {len(emails)} emails")

    names = sorted({a for e in emails for a in e["attachments"]})
    bucket = client.storage.from_(BUCKET)

    def upload(name: str) -> None:
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        for attempt in range(4):  # the storage client is not thread-safe, so sequential; retry transient errors
            try:
                bucket.upload(name, (BUNDLE / name).read_bytes(), {"content-type": ctype, "upsert": "true"})
                return
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(1 + attempt)

    for i, name in enumerate(names, 1):
        upload(name)
        if i % 50 == 0:
            print(f"  uploaded {i}/{len(names)}")
    print(f"uploaded {len(names)} attachments")

    cached = sorted(cache_dir().glob("*.json"))
    for i in range(0, len(cached), 100):
        client.table("llm_cache").upsert(
            [{"key": p.stem, "response": json.loads(p.read_text(encoding="utf-8"))} for p in cached[i : i + 100]]
        ).execute()
    print(f"seeded {len(cached)} cached LLM responses (cloud runs start warm)")


if __name__ == "__main__":
    main()
