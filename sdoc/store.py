"""Where attachments and raw emails come from: the local bundle or Supabase Storage."""
import json
from pathlib import Path
from typing import Protocol

BUCKET = "attachments"


class AttachmentStore(Protocol):
    def read(self, name: str) -> bytes: ...
    def write(self, name: str, data: bytes, content_type: str) -> None: ...
    def delete(self, names: list[str]) -> None: ...


class LocalStore:
    """The dataset bundle on disk (`name` is e.g. 'attachments/email_004_SI.txt')."""

    def __init__(self, root: Path):
        self.root = root

    def read(self, name: str) -> bytes:
        return (self.root / name).read_bytes()

    def write(self, name: str, data: bytes, content_type: str) -> None:
        raise NotImplementedError("the local bundle is read-only")

    def delete(self, names: list[str]) -> None:
        raise NotImplementedError("the local bundle is read-only")

    def emails(self) -> list[dict]:
        return [json.loads(p.read_text(encoding="utf-8")) for p in sorted((self.root / "inbox").glob("email_*.json"))]


class SupabaseStore:
    def __init__(self, client, bucket: str = BUCKET):
        self.client, self.bucket = client, bucket  # `client` may be a per-thread handle: resolve on every call

    def read(self, name: str) -> bytes:
        return self.client.storage.from_(self.bucket).download(name)

    def write(self, name: str, data: bytes, content_type: str) -> None:
        self.client.storage.from_(self.bucket).upload(name, data, {"content-type": content_type, "upsert": "true"})

    def delete(self, names: list[str]) -> None:
        if names:
            self.client.storage.from_(self.bucket).remove(names)


class MemoryStore:
    """Tests."""

    def __init__(self, files: dict[str, bytes] | None = None):
        self.files = files or {}

    def read(self, name: str) -> bytes:
        try:
            return self.files[name]
        except KeyError:
            raise FileNotFoundError(name) from None

    def write(self, name: str, data: bytes, content_type: str) -> None:
        self.files[name] = data

    def delete(self, names: list[str]) -> None:
        for n in names:
            self.files.pop(n, None)
