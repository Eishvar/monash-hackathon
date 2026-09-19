"""Render PDF pages to PNG for the vision LLM."""
import io


def render_pdf_pages(data: bytes, max_pages: int = 3, scale: float = 1.6) -> list[bytes]:
    """PNG bytes for the first pages of a PDF; [] if the file can't be opened (corrupt)."""
    try:
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(data)
        out = []
        for i in range(min(len(pdf), max_pages)):
            buf = io.BytesIO()
            pdf[i].render(scale=scale).to_pil().convert("RGB").save(buf, format="PNG")
            out.append(buf.getvalue())
        return out
    except Exception:
        return []
