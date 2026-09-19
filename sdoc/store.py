"""Where attachments and raw emails come from: the local bundle or Supabase Storage."""
import json
from pathlib import Path
from typing import Protocol

BUCKET = "attachments"


class AttachmentStore(Protocol):
    def read(self, name: str) -> bytes: ...


class LocalStore:
    """The dataset bundle on disk (`name` is e.g. 'attachments/email_004_SI.txt')."""

    def __init__(self, root: Path):
        self.root = root

    def read(self, name: str) -> bytes:
        return (self.root / name).read_bytes()

    def emails(self) -> list[dict]:
        return [json.loads(p.read_text(encoding="utf-8")) for p in sorted((self.root / "inbox").glob("email_*.json"))]


class SupabaseStore:
    def __init__(self, client, bucket: str = BUCKET):
        self.bucket = client.storage.from_(bucket)

    def read(self, name: str) -> bytes:
        return self.bucket.download(name)


class MemoryStore:
    """Tests."""

    def __init__(self, files: dict[str, bytes] | None = None):
        self.files = files or {}

    def read(self, name: str) -> bytes:
        try:
            return self.files[name]
        except KeyError:
            raise FileNotFoundError(name) from None
