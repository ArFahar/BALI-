"""
Stage 2 - Knowledge structuring: split each in-scope document into knowledge units (one legal article /
awig-awig pawos / pilot entry) and attach metadata.

  python -I knowledge/pipeline/stage2_structure.py

Inputs : knowledge/processing/source_inventory.json, knowledge/processing/stage1_extracted/*.md
Outputs: knowledge/processing/stage2_structured/knowledge_documents.json   one record per document
         knowledge/processing/stage2_structured/knowledge_units.jsonl      one record per knowledge unit
         knowledge/processing/STAGE2_REPORT.md

Category and applicability are assigned by transparent keyword rules (listed below) so every decision can be
audited and corrected. Nothing is paraphrased: `content` is the cleaned source text of that article.
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROC = ROOT / "knowledge" / "processing"
IN_DIR = PROC / "stage1_extracted"
OUT = PROC / "stage2_structured"

# Gate 1 decision (2026-11-04): high + medium relevance, all Canggu documents, all pilot entries.
IN_SCOPE_RELEVANCE = {"high", "medium"}

# ---------------------------------------------------------------- document-level metadata (verified by hand)

DOC_META = {
    # doc_id: (location_scope, effective_date, date_note)
    "JIDHAT-01": ("bali", "2019-05-28", "Ditetapkan/diundangkan 28 Mei 2019"),
    "JIDHAT-02": ("bali", None, "Enactment date not found in the extracted text"),
    "JIDHAT-03": ("bali", "2018-12-21", "Ditetapkan/diundangkan 21 Desember 2018"),
    "JIDHAT-05": ("bali", "2019-11-05", "Ditetapkan/diundangkan 5 November 2019"),
    "JIDHAT-06": ("bali", "2018-09-26", "Ditetapkan/diundangkan 26 September 2018"),
    "JIDHAT-09": ("bali", "2020-05-29", "Ditetapkan/diundangkan 29 Mei 2020"),
    "JIDHAT-10": ("bali", "2020-05-29", "Ditetapkan/diundangkan 29 Mei 2020"),
    "JIDHAT-20": ("bali", "2012-12-17", "Ditetapkan/diundangkan 17 Desember 2012"),
    "JIDHAT-23": ("indonesia", "2023-05-04", "Diundangkan 4 Mei 2023 (national law about Bali Province)"),
    "JIDHAT-24": ("bali", None, "OCR reads 'diundangkan ... 30 sember 2025' (probably 30 Desember 2025) - confirm against the PDF"),
    "CANGGU-PARAREM-03-2025": ("canggu", "2025-02-25", "Ditetapkan 25 Februari 2025; teregistrasi 4 Juni 2025 (P/0408/0421/021/04/DPMA/2025)"),
    "CANGGU-AWIG-2012-ID": ("canggu", None, "Naskah edisi 2012 (ditetapkan 1985, disempurnakan 2001 dan 2012); current validity not confirmed"),
}

# ---------------------------------------------------------------- category rules

CATEGORIES = {
    "sacred_places": ["pura", "kahyangan", "pratima", "tempat suci", "kawasan suci", "pelinggih", "simbol keagamaan", "kesucian", "parahyangan", "setra", "sacred place", "temple"],
    "religious_etiquette": ["upacara", "upakara", "yadnya", "piodalan", "odalan", "nyepi", "sembahyang", "persembahyangan", "banten", "cuntaka", "sebel", "ngaben", "galungan", "kuningan", "canang", "ritual", "panca yadnya", "ceremony", "offering"],
    "environmental_etiquette": ["sampah", "plastik", "limbah", "danau", "mata air", "sungai", "laut", "pantai", "pencemaran", "lingkungan hidup", "subak", "sawah", "palemahan", "kebersihan", "tri hita karana"],
    "neighborhood_etiquette": ["krama tamiu", "tamiu", "pendatang", "melapor", "wajib lapor", "banjar", "ketertiban", "pecalang", "sadana", "iuran", "keamanan", "kependudukan", "bertempat tinggal", "sipandu", "pengamanan lingkungan"],
    "public_behavior": ["busana", "berpakaian", "kesopanan", "sopan", "ketertiban umum", "mabuk", "minuman keras", "kegaduhan", "keributan", "susila", "dress"],
    "traffic_etiquette": ["lalu lintas", "kendaraan", "parkir", "jalan raya", "helm"],
    "social_interaction": ["bahasa bali", "aksara bali", "sapaan", "menghormati", "wicara", "perselisihan", "sengketa", "sanksi adat", "pamidanda", "danda", "musyawarah", "paruman"],
}
# Background terms: useful to explain answers, not etiquette rules themselves.
CONTEXT_TERMS = ["desa adat", "awig-awig", "pararem", "prajuru", "bendesa", "krama desa adat", "krama adat", "wewidangan"]
# Sections dominated by these are internal governance/finance and are excluded from the knowledge base.
INTERNAL_TERMS = ["keuangan", "anggaran", "pendapatan", "padruwen", "lpd", "pemilihan prajuru", "masa bakti", "pengangkatan", "pemberhentian", "warisan", "waris", "ahli waris", "pewaris", "perkawinan", "kawin", "beristri", "bersuami", "istri", "anak angkat", "sentana", "perceraian", "hibah", "pajak", "retribusi", "laporan pertanggungjawaban", "harta",
                  # government/administrative actors and procedures - rules for officials, not for visitors
                  "pemerintah provinsi", "perangkat daerah", "gubernur", "bupati", "penghargaan", "insentif", "dana", "pembinaan", "pengawasan", "pencatatan", "pendokumentasian", "pendataan", "fasilitasi", "kerja sama", "kerjasama", "tata hubungan", "paiketan", "majelis desa adat", "lembaga adat", "prajuru desa adat", "rencana", "program", "evaluasi",
                  # subak / land / awig-awig amendment governance
                  "pekaseh", "kelian subak", "prajuru subak", "harta kekayaan", "status hak", "hak atas tanah", "perubahan dan penambahan awig", "produsen", "distributor"]
# A conduct rule must be phrased as an obligation, prohibition or sanction.
NORM = re.compile(r"\b(wajib|diwajibkan|dilarang|larangan|tidak boleh|tidak diperkenankan|harus|patut|hendaknya|sanksi|danda|pamidanda|kewajiban|swadharma|dikenakan)\b", re.I)
DEFINITIONS = re.compile(r"yang dimaksud dengan", re.I)

CATEGORY_LABEL = {
    "religious_etiquette": "Religious Etiquette",
    "sacred_places": "Sacred Places",
    "public_behavior": "Public Behavior",
    "neighborhood_etiquette": "Neighborhood Etiquette",
    "environmental_etiquette": "Environmental Etiquette",
    "traffic_etiquette": "Traffic Etiquette",
    "social_interaction": "Social Interaction",
    "customary_context": "Customary Context (background)",
}

# ---------------------------------------------------------------- applicability rules

APPLIES = [
    ("foreign_tourist", r"wisatawan (asing|mancanegara)|warga negara asing|\bWNA\b|foreign tourist"),
    ("domestic_tourist", r"wisatawan (nusantara|domestik)"),
    ("tamiu", r"\btamiu\b(?!\s*,?\s*dan)|\bTamiu\b"),
    ("krama_tamiu", r"krama tamiu"),
    ("krama_adat", r"krama (desa )?adat|krama desa\b|krama banjar"),
    ("business", r"badan usaha|pelaku usaha|lembaga|restoran|hotel|akomodasi|toko|pasar|warung"),
    ("everyone", r"setiap orang|setiap krama|masyarakat|siapa ?pun|semua pihak|everyone|visitor"),
]


def score_terms(text: str, terms: list[str]) -> int:
    return sum(len(re.findall(rf"(?<![a-z]){re.escape(t)}(?![a-z])", text)) for t in terms)


def classify(text: str, doc_id: str) -> tuple[str | None, dict[str, int], str]:
    low = text.lower()
    scores = {c: score_terms(low, terms) for c, terms in CATEGORIES.items()}
    scores = {c: s for c, s in scores.items() if s}
    internal = score_terms(low, INTERNAL_TERMS)
    context = score_terms(low, CONTEXT_TERMS)
    best = max(scores, key=scores.get) if scores else None
    best_score = scores.get(best, 0)
    if DEFINITIONS.search(text[:300]):
        # Glossary articles ("Dalam ... ini yang dimaksud dengan: ...") explain terms used in answers.
        return ("customary_context", scores, "glossary/definitions article") if context or "tamiu" in low else (None, scores, "glossary without customary terms")
    if not NORM.search(text):
        return None, scores, "no obligation/prohibition/sanction wording"
    if best and best_score >= 3:
        return best, scores, "normative text; strong etiquette signal"
    if best and best_score >= 2 and best_score > internal:
        return best, scores, "normative text; etiquette keywords dominate"
    if best and best_score == 1 and internal == 0 and len(text) < 2500:
        return best, scores, "normative text; single etiquette keyword, no administrative terms"
    return None, scores, ("internal governance/administration" if internal else "no etiquette signal")


def applicability(text: str, location_scope: str) -> list[str]:
    found = [name for name, rx in APPLIES if re.search(rx, text, re.I)]
    # Customary documents bind people inside the wewidangan; tamiu is the status of visitors and most newcomers.
    if not found:
        found = ["everyone"] if location_scope != "canggu" else ["krama_adat"]
    if "krama_tamiu" in found and "tamiu" in found and not re.search(r"\btamiu\b", re.sub(r"krama tamiu", "", text, flags=re.I), re.I):
        found.remove("tamiu")
    return found


# ---------------------------------------------------------------- splitting

PAGE = re.compile(r"<!-- page (\d+) -->")
PASAL = re.compile(r"^(Pasal|PASAL)\s+(\d+[A-Z]?)\b(.*)$", re.M)
BAB = re.compile(r"^(BAB\s+[IVXLC]+)\b\s*(.*)$", re.M)
RUJUKAN = re.compile(r"RUJUKAN: PDF SUMBER HALAMAN (\d+)(?: \| Halaman tercetak (\d+))?")


def body_of(md: str) -> str:
    return md.split("\n---\n", 1)[1] if md.startswith("---") else md


def page_at(text: str, pos: int) -> int | None:
    pages = [int(m.group(1)) for m in PAGE.finditer(text, 0, pos)]
    return pages[-1] if pages else None


def split_articles(doc_id: str, text: str) -> list[dict]:
    """Split on article headings; carry the enclosing BAB title; stop at the official explanation (PENJELASAN)."""
    # Awig-awig headings "Pasal 4 (Pawos 4)" can sit mid-paragraph after text flowing; put them on their own line.
    text = re.sub(r"[ \t]*(?=Pasal \d+ \(Pawos \d+\))", "\n", text)
    penj = re.search(r"^\s*PENJELASAN\b", text, re.M)
    main = text[: penj.start()] if penj else text
    # The awig-awig translation repeats "Pasal 20 (lanjutan)" / "Pasal 32 ayat (1) (lanjutan)" at page tops:
    # those are continuations of the same article, not new ones.
    heads = [m for m in PASAL.finditer(main) if "lanjutan" not in m.group(3)[:40]]
    units = []
    for i, m in enumerate(heads):
        start, end = m.start(), heads[i + 1].start() if i + 1 < len(heads) else len(main)
        chunk = main[start:end]
        bab = None
        for b in BAB.finditer(main, 0, start):
            bab = f"{b.group(1)} {b.group(2)}".strip()
        pdf_page = page_at(main, start)
        pdf_page_end = page_at(main, end) or pdf_page
        source_page = source_page_end = None
        if doc_id.startswith("CANGGU-AWIG"):
            # The page an article STARTS on is the last RUJUKAN anchor before its heading.
            before = list(RUJUKAN.finditer(main, 0, start))
            inside = list(RUJUKAN.finditer(main, start, end))
            source_page = int((before or inside)[-1].group(1)) if (before or inside) else None
            source_page_end = int(inside[-1].group(1)) if inside else source_page
        clean = PAGE.sub("", chunk)
        if doc_id.startswith("CANGGU-AWIG"):
            # After the last article the translation carries appendices (village map, meaning of the village emblem);
            # they are not provisions and must not become retrievable text of Pasal 88.
            cut = re.search(r"WILAYAH DESA ADAT CANGGU\s+Gambar peta|MAKNA LAMBANG DESA", clean)
            if cut:
                clean = clean[: cut.start()]
        clean = RUJUKAN.sub("", clean)
        clean = re.sub(r"(?m)^\s*(BAB\s+[IVXLC]+.*)$", "", clean)  # next chapter heading belongs to the next unit
        # Trailing sub-section headings ("Bagian Kedua ...", "Paragraf 4 ...") also belong to the next unit.
        clean = re.sub(r"(?:\n\s*(?:Bagian|Paragraf)\s+\S+[^\n]*)+\s*$", "", clean)
        # The awig-awig translation puts them inline: "... dikubur. Subbagian 2 - Pepohonan" / "| Bagian pendahuluan ...".
        clean = re.sub(r"\s*\|?\s*(?:Subbagian|Bagian)\s+(?:\d+|pendahuluan)\s*-?\s*[^.\n]*$", "", clean.rstrip())
        # Translation page-continuation markers: "Pasal 24 ayat (2) (lanjutan)" inside the same article.
        clean = re.sub(r"Pasal \d+(?: ayat \(\d+\))?(?: (?:huruf|angka) \w+)* \(lanjutan\)\s*", "", clean)
        clean = re.sub(r"\n{2,}", "\n", clean).strip()
        units.append({
            "article": f"Pasal {m.group(2)}",
            "chapter": bab,
            "page_number": source_page or pdf_page,
            "page_number_end": source_page_end or pdf_page_end,
            "page_ref_type": "original_scan_page" if source_page else "pdf_page",
            "translation_page": pdf_page if source_page else None,
            "content": clean,
        })
    # Same article number can repeat (e.g. amending regulations); keep order, disambiguate ids later.
    return units


def pilot_units(rec: dict, text: str) -> list[dict]:
    return [{"article": None, "chapter": None, "page_number": None, "page_number_end": None, "page_ref_type": None,
             "translation_page": None, "content": re.sub(r"\n{2,}", "\n", text).strip()}]


GLOSSARY_KEEP = sorted({t for terms in CATEGORIES.values() for t in terms} | set(CONTEXT_TERMS) | {"krama", "tamiu", "pecalang", "banjar"})


def filter_glossary(text: str) -> tuple[str, int, int]:
    """Keep only definitions whose term is customary/etiquette vocabulary; drop 'Provinsi adalah Provinsi Bali' etc."""
    body = re.sub(r"\s+", " ", text)
    head, _, rest = body.partition(":")
    items = re.split(r"\s(?=\d{1,2}\.\s+[A-Z])", " " + rest)
    items = [i.strip() for i in items if i.strip()]
    kept = [i for i in items if any(re.search(rf"(?<![a-z]){re.escape(t)}(?![a-z])", i.split(" adalah ")[0].lower()) for t in GLOSSARY_KEEP)]
    return (f"{head.strip()} (definisi terpilih):\n" + "\n".join(kept)) if kept else "", len(kept), len(items)


# ---------------------------------------------------------------- main

def main() -> None:
    inv = json.loads((PROC / "source_inventory.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    documents, units, excluded = [], [], []

    for rec in inv:
        did = rec["doc_id"]
        if did == "CANGGU-AWIG-2012-BAN":
            continue  # reference scan only; cited through CANGGU-AWIG-2012-ID
        in_scope = rec["relevance"] in IN_SCOPE_RELEVANCE or did.startswith(("CANGGU-", "PILOT-"))
        if not in_scope or not rec.get("output_file"):
            continue
        md = (ROOT / rec["output_file"]).read_text(encoding="utf-8")
        text = body_of(md)

        if did.startswith("PILOT-"):
            loc = "canggu" if "canggu" in (rec.get("pack_village") or "").lower() else "bali"
            eff, date_note = None, "Research-pack summary; dates belong to the listed web sources"
            source_type, validation = "GENERAL_ADVISORY", "UNVERIFIED"
            raw_units = pilot_units(rec, text)
        else:
            loc, eff, date_note = DOC_META[did]
            source_type, validation = "OFFICIAL", "UNDER_REVIEW"
            raw_units = split_articles(did, text)

        doc = {
            "document_id": did,
            "title": rec["title"],
            "publisher": rec["publisher"],
            "source_type": source_type,
            "source_subtype": ("customary_law" if did.startswith("CANGGU-") else
                               "research_summary" if did.startswith("PILOT-") else "government_regulation"),
            "source_url": rec.get("source_url"),
            "all_source_urls": rec.get("all_source_urls"),
            "location_scope": loc,
            "validation_status": validation,
            "validated_by": None,
            "effective_date": eff,
            "effective_date_note": date_note,
            "language": "en" if did.startswith("PILOT-") else "id",
            "sha256": rec.get("sha256"),
            "flags": [],
        }
        if did == "CANGGU-AWIG-2012-ID":
            doc["flags"] += ["UNOFFICIAL_TRANSLATION", "EDITION_2012_VALIDITY_UNCONFIRMED", "SOURCE_URL_UNKNOWN"]
        if rec["extraction"]["method"].startswith("ocr"):
            doc["flags"].append("OCR_TEXT")
        if did == "JIDHAT-24":
            doc["flags"].append("OCR_COLUMN_ORDER_ISSUES")
        pack_urls = [s.get("url") or "" for s in (rec.get("all_source_urls") or [])]
        if any("disparda.baliprov.go.id" in u for u in pack_urls):
            # SE Gubernur Bali 7/2025 PDF on disparda.baliprov.go.id returned HTTP 404 on 2026-11-04.
            doc["flags"].append("PRIMARY_URL_UNREACHABLE")
        if did in {f"PILOT-{x}" for x in ("PB-001", "PB-002", "PB-003", "TE-001", "TE-002", "TE-003")}:
            doc["flags"].append("SUMMARY_OF_FOREIGN_TOURIST_CIRCULAR")
        if (rec.get("pilot_verification") or {}).get("local_expert_review_required"):
            doc["flags"].append("LOCAL_REVIEW_REQUIRED")
        if did == "PILOT-PB-004":
            # Noise limits come from a 2022 coordination meeting and customary discussions, not a confirmed current rule.
            doc["flags"].append("HISTORICAL_2022_AGREEMENT")
        doc["pack_verification"] = rec.get("pilot_verification")
        documents.append(doc)

        seen = Counter()
        for u in raw_units:
            if len(u["content"]) < 40:
                continue
            cat, scores, why = classify(u["content"], did)
            if cat == "customary_context" and DEFINITIONS.search(u["content"][:300]):
                filtered, kept_n, total_n = filter_glossary(u["content"])
                if not filtered:
                    cat, why = None, "glossary with no customary/etiquette terms"
                else:
                    u = {**u, "content": filtered}
                    why = f"glossary filtered to {kept_n} of {total_n} definitions (customary/etiquette terms only)"
            if did.startswith("PILOT-"):
                cat = {"PILOT-CULT-001": "customary_context", "PILOT-CULT-002": "religious_etiquette",
                       "PILOT-CULT-003": "sacred_places", "PILOT-CULT-004": "customary_context",
                       "PILOT-CULT-005": "religious_etiquette"}.get(did) or rec.get("pack_category")
                why = "research-pack entry topic"
            seen[u["article"]] += 1
            suffix = f"-{seen[u['article']]}" if seen[u["article"]] > 1 else ""
            uid = f"{did}" + (f"::{u['article'].replace(' ', '-')}{suffix}" if u["article"] else "")
            record = {
                "unit_id": uid,
                "document_id": did,
                "title": rec["title"],
                "article": u["article"],
                "chapter": u["chapter"],
                "content": u["content"],
                "category": cat,
                "category_label": CATEGORY_LABEL.get(cat),
                "category_scores": scores,
                "category_reason": why,
                "location_scope": loc,
                "source_type": source_type,
                "applicable_to": (
                    # Research packs are English visitor guidance: the Indonesian legal-actor patterns do not apply to
                    # them. Packs summarising the foreign-tourist circular are tagged so they never read as binding everyone.
                    (["everyone", "foreign_tourist"] if "SUMMARY_OF_FOREIGN_TOURIST_CIRCULAR" in doc["flags"] else ["everyone"])
                    if did.startswith("PILOT-") else applicability(u["content"], loc)
                ),
                "validation_status": validation,
                "source_url": rec.get("source_url"),
                "effective_date": eff,
                "page_number": u["page_number"],
                "page_number_end": u["page_number_end"],
                "page_ref_type": u["page_ref_type"],
                "translation_page": u["translation_page"],
                "language": doc["language"],
                "flags": doc["flags"],
            }
            (units if cat else excluded).append(record)

    (OUT / "knowledge_documents.json").write_text(json.dumps(documents, ensure_ascii=False, indent=2), encoding="utf-8")
    with (OUT / "knowledge_units.jsonl").open("w", encoding="utf-8") as f:
        for u in units:
            f.write(json.dumps(u, ensure_ascii=False) + "\n")
    with (OUT / "excluded_units.jsonl").open("w", encoding="utf-8") as f:
        for u in excluded:
            f.write(json.dumps({k: u[k] for k in ("unit_id", "chapter", "category_reason", "category_scores")}, ensure_ascii=False) + "\n")
    report(documents, units, excluded)
    print(f"{len(documents)} documents, {len(units)} knowledge units, {len(excluded)} excluded")


def report(docs: list[dict], units: list[dict], excluded: list[dict]) -> None:
    per_doc = defaultdict(Counter)
    for u in units:
        per_doc[u["document_id"]][u["category"]] += 1
    ex_doc = Counter(u["document_id"] for u in excluded)
    cat_tot = Counter(u["category"] for u in units)
    app_tot = Counter(a for u in units for a in u["applicable_to"])
    lines = [
        "# Stage 2 report - knowledge structuring (generated)",
        "",
        "Unit = one article (Pasal / Pawos) or one pilot entry. Category and applicability come from keyword rules in",
        "`knowledge/pipeline/stage2_structure.py`; they are suggestions for review, not verified judgements.",
        "",
        "## Documents",
        "",
        "| document_id | source_type | scope | validation | effective_date | units kept | units excluded | flags |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for d in docs:
        kept = sum(per_doc[d["document_id"]].values())
        lines.append(f"| {d['document_id']} | {d['source_type']} | {d['location_scope']} | {d['validation_status']} | "
                     f"{d['effective_date'] or '—'} | {kept} | {ex_doc[d['document_id']]} | {', '.join(d['flags']) or '—'} |")
    lines += ["", "## Units per category", "", "| category | units |", "|---|---|"]
    lines += [f"| {CATEGORY_LABEL[c]} | {n} |" for c, n in cat_tot.most_common()]
    missing = [CATEGORY_LABEL[c] for c in CATEGORY_LABEL if c not in cat_tot]
    if missing:
        lines += ["", f"**Categories with no units:** {', '.join(missing)}"]
    lines += ["", "## Units per applicable_to", "", "| applicable_to | units |", "|---|---|"]
    lines += [f"| {a} | {n} |" for a, n in app_tot.most_common()]
    lines += ["", "## Units per document x category", "", "| document | categories |", "|---|---|"]
    lines += [f"| {d} | {', '.join(f'{CATEGORY_LABEL[c]}: {n}' for c, n in cs.most_common())} |" for d, cs in per_doc.items()]
    lines += ["", "## All kept units (for review)", "",
              "| unit_id | category | applicable_to | page | opening text |", "|---|---|---|---|---|"]
    for u in units:
        opening = re.sub(r"\s+", " ", u["content"])[:140].replace("|", "/")
        lines.append(f"| {u['unit_id']} | {u['category']} | {', '.join(u['applicable_to'])} | {u['page_number'] or '—'} | {opening} |")
    (PROC / "STAGE2_REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
