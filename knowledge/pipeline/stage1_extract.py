"""
Stage 1 - Source processing: inventory, text extraction and cleaning.

  python -I knowledge/pipeline/stage1_extract.py

Inputs : Database/ (user-supplied sources), knowledge/processing/_raw/ (unzipped JIDHAT + OCR output)
Outputs: knowledge/processing/stage1_extracted/<doc_id>.md   clean text with page markers + source header
         knowledge/processing/source_inventory.json            one record per source document
         knowledge/processing/STAGE1_REPORT.md                 human-readable summary for the gate review

Text PDFs are read with pdftotext (poppler). Scanned PDFs must first be OCR'd with ocr_windows.ps1
into _raw/ocr/jidhat-<NN>.txt. Nothing is summarised or rewritten here: cleaning only removes layout noise.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import unicodedata
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "Database"
RAW = ROOT / "knowledge" / "processing" / "_raw"
JIDHAT_DIR = RAW / "jidhat" / "PDF-JIDHAT-Halaman-1-3"
OUT = ROOT / "knowledge" / "processing" / "stage1_extracted"
TODAY = date.today().isoformat()

# Relevance to Mawacara AI (everyday etiquette for tourists/newcomers in Canggu). Decided per document,
# with the reason recorded so the gate reviewer can overrule it.
JIDHAT_RELEVANCE = {
    "01": ("high", "Defines Desa Adat, awig-awig, pararem, krama tamiu/tamiu and their obligations"),
    "02": ("high", "Implementing rules for Desa Adat incl. krama tamiu/tamiu duties and customary sanctions"),
    "03": ("high", "Single-use plastic restrictions (waste etiquette)"),
    "04": ("low", "Marketing of local agricultural/industrial products - business policy"),
    "05": ("high", "Source-based waste sorting (household waste etiquette)"),
    "06": ("medium", "Use of Balinese language/script; Bulan Bahasa Bali - cultural context"),
    "07": ("low", "Local plants for offerings and greening - indirect cultural context"),
    "08": ("low", "Clean energy policy - not etiquette"),
    "09": ("medium", "Protection of lakes, springs, rivers and sea - environmental conduct, sacred waters"),
    "10": ("high", "Protection of temples, pratima and religious symbols"),
    "11": ("low", "Sub-district (kecamatan) administration"),
    "12": ("low", "Regional financial management"),
    "13": ("low", "Village law implementing regulation - administrative"),
    "14": ("low", "Presidential circular on lifetime e-KTP - administrative"),
    "15": ("low", "Tariffs for use of regional assets"),
    "16": ("low", "100-year development plan - policy vision, not conduct rules"),
    "17": ("low", "Village credit institutions (LPD) - finance"),
    "18": ("low", "Circular on playing the national anthem - institutional, not visitor conduct"),
    "19": ("low", "Desa Adat business entities (BUPDA) - finance/governance"),
    "20": ("medium", "Subak irrigation system - context for rice-field conduct"),
    "21": ("low", "National Village Law - administrative"),
    "22": ("low", "1945 Constitution - too general for etiquette answers"),
    "23": ("medium", "Law on Bali Province - legal basis incl. culture and levy context"),
    "24": ("medium", "Sipandu Beradat integrated security incl. Desa Adat role (pecalang, newcomers)"),
}


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def pdftotext_pages(pdf: Path) -> list[str]:
    # Non-zero exit is normal for image-only PDFs; an empty result then routes the file to OCR.
    out = subprocess.run(["pdftotext", "-q", "-enc", "UTF-8", str(pdf), "-"], capture_output=True, check=False)
    pages = out.stdout.decode("utf-8", "replace").split("\f")
    return pages[:-1] if pages and not pages[-1].strip() else pages


def ocr_pages(txt: Path) -> list[str]:
    return txt.read_text(encoding="utf-8").split("\f")


# ---------------------------------------------------------------- cleaning

PAGE_NUM = re.compile(r"^\s*[-–—]?\s*(\d{1,3}|[ivxlc]{1,6})\s*[-–—]?\s*$", re.I)
TOC_LINE = re.compile(r"\.{6,}\s*\d*\s*$")
# "Pasal 5" starts a new article only when it is a heading, not a cross-reference such as
# "Pasal 13 ayat (5)," or "Pasal 7 dan Pasal 8".
PASAL_HEADING = r"(?:Pasal|PASAL)\s+\d+[A-Z]?(?!\s*(?:ayat|huruf|angka|,|;|dan\b|sampai|s\.d\.|sd\b|jo\b|tentang|\)))"
STRUCT = re.compile(
    rf"^(BAB\s+[IVXLC]+|Bagian\s+\w+|Paragraf\s+\d+|{PASAL_HEADING}|\(\d+\)|\d+\.\s|[a-z]\.\s|RUJUKAN:|Menimbang|Mengingat|MEMUTUSKAN|Menetapkan)",
)
# Balinese-script glyphs in a Latin font come out as noise like ">n\un×etÐ`"; drop tokens carrying those code points.
GLYPH_NOISE = re.compile(r"\S*[×ÐÞþÿøØµ¶¤\\`¬¦]\S*")


def normalise(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    s = s.replace("", "•").replace("•", "•").replace("­", "")
    s = re.sub(r"[ \t]+", " ", s)
    return s


def repeated_lines(pages: list[str]) -> set[str]:
    """Short lines appearing on >=40% of pages are running headers/footers."""
    if len(pages) < 4:
        return set()
    counts = Counter()
    for p in pages:
        counts.update({ln.strip() for ln in p.splitlines() if 0 < len(ln.strip()) <= 90})
    return {ln for ln, c in counts.items() if c >= max(3, 0.4 * len(pages)) and not PAGE_NUM.match(ln)}


def clean_page(text: str, drop: set[str], stats: Counter) -> str:
    lines = []
    for raw in normalise(text).splitlines():
        ln = raw.strip()
        if not ln:
            lines.append("")
            continue
        if ln in drop:
            stats["header_footer_lines"] += 1
            continue
        if PAGE_NUM.match(ln):
            stats["page_number_lines"] += 1
            continue
        if TOC_LINE.search(ln):
            stats["toc_lines"] += 1
            continue
        ln, n = GLYPH_NOISE.subn("", ln)
        stats["glyph_noise_tokens"] += n
        ln = re.sub(r"\s{2,}", " ", ln).strip()
        if not ln or re.fullmatch(r"[>\"“”(\s]*", ln):
            continue
        lines.append(ln)

    # Re-flow wrapped lines while keeping structural starts (BAB/Pasal/ayat/huruf) on their own line.
    out: list[str] = []
    for ln in lines:
        if not ln:
            if out and out[-1] != "":
                out.append("")
            continue
        if out and out[-1] and not STRUCT.match(ln) and not re.search(r"[.:;!?]$", out[-1]):
            if out[-1].endswith("-") and ln[:1].islower():
                out[-1] = out[-1][:-1] + ln
            else:
                out[-1] += " " + ln
        else:
            out.append(ln)
    text = "\n".join(out).strip()
    # Inline structure markers produced by text-flowing PDFs (e.g. "... Desa Adat Pasal 3 Ruang lingkup").
    text = re.sub(rf"(?<=[.;:])\s+(?=(BAB\s+[IVXLC]+\s|{PASAL_HEADING}\s))", "\n\n", text)
    text = re.sub(r"(?<=[^\n])\s+(?=BAB\s+[IVXLC]+\s+[A-Z]{3})", "\n\n", text)
    text = re.sub(r"(?<=[.;:])\s+(?=\(\d+\)\s)", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text)


def ocr_quality(text: str) -> float:
    """Share of word tokens that look like real words (letters, optional hyphen). Rough OCR health signal."""
    toks = re.findall(r"\S+", text)
    if not toks:
        return 0.0
    good = sum(1 for t in toks if re.fullmatch(r"[\(\[\"']?[A-Za-zÀ-ÿ]+(-[A-Za-zÀ-ÿ]+)?[\.,;:\)\]\"']*|\d+[\.,)]?|\(\d+\)", t))
    return round(good / len(toks), 3)


def process_pdf_doc(rec: dict, pages: list[str]) -> str:
    stats: Counter = Counter()
    drop = repeated_lines([normalise(p) for p in pages])
    body = []
    for i, p in enumerate(pages, start=1):
        cleaned = clean_page(p, drop, stats)
        if cleaned:
            body.append(f"<!-- page {i} -->\n{cleaned}")
    text = "\n\n".join(body)
    rec["extraction"].update(
        pages=len(pages),
        pages_with_text=len(body),
        chars_raw=sum(len(p) for p in pages),
        chars_clean=len(text),
        removed=dict(stats),
        removed_header_footer_samples=sorted(drop)[:8],
        word_shape_score=ocr_quality(text),
    )
    return text


# ---------------------------------------------------------------- sources

def jidhat_records() -> list[tuple[dict, list[str] | None]]:
    idx = (JIDHAT_DIR / "Daftar-Dokumen.txt").read_text(encoding="utf-8-sig")
    entries = re.findall(
        r"(\d\d)\. (.+?)\nHalaman daftar: \d+\nBerkas: (.+?\.pdf)\nURL: (\S+)\nStatus: (\w+)\nHalaman PDF: (\d+)\nUkuran: \d+ bytes\nSHA-256: ([0-9a-f]{64})",
        idx,
    )
    out = []
    for num, title, fname, url, status, npages, digest in entries:
        pdf = JIDHAT_DIR / fname
        real = sha256(pdf)
        rel, why = JIDHAT_RELEVANCE[num]
        ocr_file = RAW / "ocr" / f"jidhat-{num}.txt"
        text_pages = pdftotext_pages(pdf)
        scanned = sum(len(p.strip()) for p in text_pages) < 200
        rec = {
            "doc_id": f"JIDHAT-{num}",
            "group": "A. JIDHAT Provinsi Bali (official legal documents)",
            "title": re.sub(r"\s+", " ", title).strip(),
            "publisher": "Pemerintah Provinsi Bali - JIDHAT (Jaringan Informasi Hukum Desa Adat)",
            "source_url": url,
            "listing_url": "https://jidhat.baliprov.go.id/hukum-negara",
            "retrieved_at": "2026-11-04",
            "local_file": str(pdf.relative_to(ROOT)).replace("\\", "/"),
            "sha256": real,
            "sha256_matches_index": real == digest,
            "pages_declared": int(npages),
            "source_type_hint": "OFFICIAL",
            "relevance": rel,
            "relevance_reason": why,
            "extraction": {"method": "ocr:windows-en-US" if scanned else "pdftotext"},
            "notes": [],
        }
        if scanned and not ocr_file.exists():
            rec["extraction"]["method"] = "pending-ocr"
            out.append((rec, None))
            continue
        pages = ocr_pages(ocr_file) if scanned else text_pages
        if scanned:
            rec["notes"].append("Scanned PDF: text produced by OCR (English engine). Spelling errors are expected; verify quotes against the PDF.")
        out.append((rec, pages))
    return out


def canggu_records() -> list[tuple[dict, list[str] | None]]:
    pararem = DB / "Psw73vxwlisjkXj1gfvz9zalLC3tvCWgE1huf5t2.pdf"
    awig_tr = DB / "Awig-Awig-Desa-Adat-Canggu-Terjemahan-Indonesia.pdf"
    awig_src = DB / "awig awig canggu.pdf"
    recs = [
        ({
            "doc_id": "CANGGU-PARAREM-03-2025",
            "group": "B. Desa Adat Canggu (customary documents)",
            "title": "Pararem Desa Adat Canggu Nomor 3 Tahun 2025 tentang Pengelolaan Sampah di Wewidangan Desa Adat Canggu",
            "publisher": "Desa Adat Canggu, Kecamatan Kuta Utara, Kabupaten Badung (published on JIDHAT Provinsi Bali)",
            "source_url": "https://jidhat.baliprov.go.id/storage/perarem/Psw73vxwlisjkXj1gfvz9zalLC3tvCWgE1huf5t2.pdf",
            "retrieved_at": TODAY,
            "local_file": str(pararem.relative_to(ROOT)).replace("\\", "/"),
            "sha256": sha256(pararem),
            "sha256_matches_index": True,
            "source_type_hint": "OFFICIAL (customary - pararem)",
            "relevance": "high",
            "relevance_reason": "Canggu-specific customary rules on waste; applies to krama adat, krama tamiu, tamiu and businesses",
            "extraction": {"method": "pdftotext"},
            "notes": ["Source URL confirmed on 2026-11-04 by downloading it from JIDHAT and matching SHA-256 with the local file."],
        }, pdftotext_pages(pararem)),
        ({
            "doc_id": "CANGGU-AWIG-2012-ID",
            "group": "B. Desa Adat Canggu (customary documents)",
            "title": "Awig-Awig Desa Adat Canggu (naskah 2012)",
            "publisher": "Unknown translator (file supplied by the Mawacara AI team); source text: Desa Adat Canggu",
            "source_url": None,
            "retrieved_at": None,
            "local_file": str(awig_tr.relative_to(ROOT)).replace("\\", "/"),
            "sha256": sha256(awig_tr),
            "sha256_matches_index": None,
            "derived_from": "CANGGU-AWIG-2012-BAN",
            "source_type_hint": "OFFICIAL source text, UNOFFICIAL translation",
            "relevance": "high",
            "relevance_reason": "Only Canggu-specific customary text; includes krama tamiu/tamiu, temple and ceremony provisions",
            "extraction": {"method": "pdftotext"},
            "notes": [
                "The document itself says it is an unofficial translation made via OCR of the Latin-script Balinese text; uncertain terms are marked in the text.",
                "Naskah 2012 (ditetapkan 1985, disempurnakan 2001 dan 2012). Whether this is the edition currently in force is NOT confirmed.",
                "Each page carries 'RUJUKAN: PDF SUMBER HALAMAN n | Halaman tercetak m' - kept as the citation anchor to the original scan.",
            ],
        }, pdftotext_pages(awig_tr)),
        ({
            "doc_id": "CANGGU-AWIG-2012-BAN",
            "group": "B. Desa Adat Canggu (customary documents)",
            "title": "Awig-Awig Desa Adat Canggu (naskah 2012) - naskah asli berbahasa/aksara Bali (hasil pindai)",
            "publisher": "Desa Adat Canggu",
            "source_url": None,
            "retrieved_at": None,
            "local_file": str(awig_src.relative_to(ROOT)).replace("\\", "/"),
            "sha256": sha256(awig_src),
            "sha256_matches_index": None,
            "source_type_hint": "OFFICIAL (customary - awig-awig)",
            "relevance": "reference",
            "relevance_reason": "Original scan; used as the citation target for CANGGU-AWIG-2012-ID page references",
            "extraction": {"method": "not-extracted"},
            "notes": ["122 scanned pages in Balinese (Latin and Balinese script). Not OCR'd: the Windows OCR engine has no Balinese model and the Indonesian translation already exists."],
        }, None),
    ]
    return recs


# Research packs supplied by the team share one JSON schema (structured/<name>.json).
PACKS = [
    ("bali_cultural_knowledge_pilot", "cultural_knowledge.json", "C. Bali cultural knowledge pilot (prior desk research, English)"),
    # "...knowledge 2" is a superset of "...knowledge" (same 6 entries, byte-identical, plus 3 Canggu entries),
    # so only the expanded pack is ingested to avoid duplicate chunks.
    ("bali_public_behavior_traffic_knowledge 2", "public_behavior_traffic_knowledge.json", "D. Public behavior & traffic knowledge pack, expanded with Canggu entries (desk research, English)"),
]


def pilot_records() -> list[tuple[dict, str]]:
    out = []
    for folder, fname, group in PACKS:
        out += pack_records(DB / folder, fname, group)
    return out


def pack_records(base: Path, fname: str, group: str) -> list[tuple[dict, str]]:
    data = json.loads((base / "structured" / fname).read_text(encoding="utf-8"))
    entries = data if isinstance(data, list) else data.get("entries") or data.get("records") or list(data.values())[0]
    out = []
    for e in entries:
        c = e.get("content", {})
        parts = [f"# {e['title']}"]
        for key, label in [("definition", "Definition"), ("cultural_context", "Cultural context"),
                           ("historical_background", "Background"), ("significance", "Significance")]:
            if c.get(key):
                parts.append(f"## {label}\n{c[key]}")
        if c.get("common_situations"):
            parts.append("## Common situations\n" + "\n".join(f"- {x}" for x in c["common_situations"]))
        vg = c.get("visitor_guidance") or {}
        if vg.get("do"):
            parts.append("## Do\n" + "\n".join(f"- {x}" for x in vg["do"]))
        if vg.get("dont"):
            parts.append("## Don't\n" + "\n".join(f"- {x}" for x in vg["dont"]))
        for key, label in [("common_misconceptions", "Misconceptions"), ("regional_variations", "Regional variations")]:
            if c.get(key):
                parts.append(f"## {label}\n" + "\n".join(f"- {x}" for x in c[key]))
        if c.get("additional_notes"):
            parts.append(f"## Notes\n{c['additional_notes']}")
        ver = e.get("verification", {})
        srcs = e.get("sources", [])
        rec = {
            "doc_id": f"PILOT-{e['id']}",
            "group": group,
            "title": e["title"],
            "pack_category": e.get("category"),
            "pack_subcategory": e.get("subcategory"),
            "pack_scope_note": (e.get("location") or {}).get("scope"),
            "pack_village": (e.get("location") or {}).get("village"),
            "publisher": "Mawacara AI team research pilot (compiled from the web sources listed)",
            "source_url": srcs[0]["url"] if srcs else None,
            "all_source_urls": [{"url": s.get("url"), "publisher": s.get("publisher"), "type": s.get("source_type")} for s in srcs],
            "retrieved_at": "2026-11-04",
            "local_file": str((base / "structured" / fname).relative_to(ROOT)).replace("\\", "/"),
            "sha256": None,
            "source_type_hint": "Mixed: summary written by the research pilot from official and secondary sources",
            "pilot_verification": {k: ver.get(k) for k in ("status", "confidence", "local_expert_review_required")},
            "relevance": "high" if e["id"] in ("CULT-002", "CULT-003", "CULT-004") or e["id"].startswith(("PB-", "TE-")) else "medium",
            "relevance_reason": "Cultural context for etiquette answers",
            "extraction": {"method": "json-structured", "pages": None},
            "notes": ["Already a summary, not a primary text. Every claim must be traced to its listed source before being labelled OFFICIAL."],
        }
        out.append((rec, "\n\n".join(parts)))
    return out


# ---------------------------------------------------------------- main

def header(rec: dict) -> str:
    keep = ["doc_id", "title", "group", "publisher", "source_url", "local_file", "sha256", "source_type_hint", "relevance"]
    lines = ["---"] + [f"{k}: {json.dumps(rec.get(k), ensure_ascii=False)}" for k in keep]
    lines += [f"extraction_method: {json.dumps(rec['extraction']['method'])}", f"extracted_at: \"{TODAY}\"", "---", ""]
    return "\n".join(lines)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    inventory = []
    for rec, pages in jidhat_records() + canggu_records():
        if pages is not None:
            text = process_pdf_doc(rec, pages)
            (OUT / f"{rec['doc_id']}.md").write_text(header(rec) + text + "\n", encoding="utf-8")
            rec["output_file"] = f"knowledge/processing/stage1_extracted/{rec['doc_id']}.md"
        inventory.append(rec)
    for rec, text in pilot_records():
        rec["extraction"].update(chars_clean=len(text))
        (OUT / f"{rec['doc_id']}.md").write_text(header(rec) + text + "\n", encoding="utf-8")
        rec["output_file"] = f"knowledge/processing/stage1_extracted/{rec['doc_id']}.md"
        inventory.append(rec)

    (OUT.parent / "source_inventory.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8")
    write_report(inventory)
    print(f"{len(inventory)} source records; {sum(1 for r in inventory if r.get('output_file'))} extracted")


def write_report(inv: list[dict]) -> None:
    rows = []
    for r in inv:
        ex = r["extraction"]
        rows.append(
            f"| {r['doc_id']} | {r['title'][:70]} | {r['relevance']} | {ex['method']} | "
            f"{ex.get('pages', '—') or '—'} | {ex.get('chars_clean', '—')} | {ex.get('word_shape_score', '—')} | "
            f"{'✅' if r.get('sha256_matches_index') else ('—' if r.get('sha256_matches_index') is None else '❌')} |"
        )
    by_group = Counter(r["group"] for r in inv)
    md = [
        "# Stage 1 report - source processing (generated)",
        "",
        f"Generated by `knowledge/pipeline/stage1_extract.py` on {TODAY}.",
        "",
        "## Groups",
        "",
        *[f"- **{g}**: {n} documents" for g, n in sorted(by_group.items())],
        "",
        "## Documents",
        "",
        "`word_shape_score` = share of tokens that look like normal words/numbers; a rough OCR health signal (text PDFs are usually ≥0.9).",
        "",
        "| doc_id | title | relevance | method | pages | clean chars | word shape | SHA-256 vs index |",
        "|---|---|---|---|---|---|---|---|",
        *rows,
        "",
    ]
    (OUT.parent / "STAGE1_REPORT.md").write_text("\n".join(md), encoding="utf-8")


if __name__ == "__main__":
    main()
