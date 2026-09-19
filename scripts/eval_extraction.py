"""Validation without the answer key: does the LLM extraction agree with the deterministic parser?

    python scripts/eval_extraction.py [docs_per_format=2]

Samples SI/BL documents per format, runs the LLM extractor on the document text, and compares normalised values
with the rule parser's. Agreement = both normalise to the same key.
"""
import glob
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sdoc.config import BUNDLE, FIELDS  # noqa: E402
from sdoc.extract import evidence_ok, llm_extract  # noqa: E402
from sdoc.llm import OpenAICompatLLM  # noqa: E402
from sdoc.normalize import NORMALIZERS  # noqa: E402
from sdoc.parse import read_document  # noqa: E402


def main(per_format: int) -> None:
    llm = OpenAICompatLLM()
    agree = total = ungrounded = 0
    disagreements = []
    for ext in ("txt", "docx", "xlsx", "pdf"):
        files = sorted(glob.glob(str(BUNDLE / "attachments" / f"email_00*_*.{ext}")) + glob.glob(str(BUNDLE / "attachments" / f"email_1[0-4]*_*.{ext}")))
        for f in files[:per_format]:
            doc = read_document(f, Path(f).read_bytes())
            if doc.unreadable:
                continue
            out = llm_extract(llm, doc, "SI" if "_SI" in f else "BL")
            for name in FIELDS:
                fv = getattr(out, name)
                rule = NORMALIZERS[name](doc.fields[name])
                got = NORMALIZERS[name](fv.value) if evidence_ok(fv.value, fv.evidence, doc.text) else None
                ungrounded += fv.value is not None and got is None
                total += 1
                if got == rule:
                    agree += 1
                else:
                    disagreements.append((Path(f).name, name, doc.fields[name], fv.value))
    print(f"agreement {agree}/{total} = {agree / total:.1%}; ungrounded LLM values dropped: {ungrounded}")
    for d in disagreements[:10]:
        print("  diff:", d)
    print("usage:", llm.usage.as_dict())


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 2)
