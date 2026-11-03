# LocalNorm AI — Arsitektur & Workflow Sistem (Detail)

Dokumen ini menjelaskan seluruh sistem LocalNorm AI dari ujung ke ujung: komponen, alur data, alur RAG, basis pengetahuan, database, frontend, pengujian, dan deployment. Setiap diagram Mermaid diikuti keterangan. Status "terverifikasi / belum" di bagian akhir mengacu pada hasil yang benar-benar dijalankan pada 2026-11-03.

Daftar isi:

1. [Gambaran besar](#1-gambaran-besar)
2. [Tech stack](#2-tech-stack)
3. [Arsitektur sistem keseluruhan](#3-arsitektur-sistem-keseluruhan)
4. [Workflow end-to-end satu pertanyaan](#4-workflow-end-to-end-satu-pertanyaan-sequence-diagram)
5. [Pipeline RAG detail](#5-pipeline-rag-detail)
6. [Logika keputusan status & fallback](#6-logika-keputusan-status--fallback)
7. [Logika caveat (catatan peringatan)](#7-logika-caveat-catatan-peringatan)
8. [Mode generasi: LLM vs extractive](#8-mode-generasi-llm-vs-extractive)
9. [Workflow ingest basis pengetahuan](#9-workflow-ingest-basis-pengetahuan)
10. [Model data](#10-model-data)
11. [Workflow verifikasi konten](#11-workflow-verifikasi-konten)
12. [Arsitektur frontend](#12-arsitektur-frontend)
13. [Arsitektur modul backend](#13-arsitektur-modul-backend)
14. [Penanganan error](#14-penanganan-error)
15. [Workflow pengujian & evaluasi](#15-workflow-pengujian--evaluasi)
16. [Arsitektur deployment](#16-arsitektur-deployment)
17. [Status implementasi](#17-status-implementasi)

---

## 1. Gambaran besar

LocalNorm AI adalah asisten etika sosial-budaya untuk wisatawan dan pendatang di Canggu. Pengguna bertanya dalam bahasa Indonesia atau Inggris. Sistem **tidak menjawab dari "pengetahuan umum" model AI**, melainkan:

1. mencari dokumen yang relevan di **basis pengetahuan terkurasi** (13 skenario × 2 bahasa = 26 potongan/chunk),
2. menyaring hasil yang benar-benar relevan,
3. menyusun jawaban **hanya dari dokumen tersebut** (lewat Gemini bila ada API key, atau mengutip langsung bila tidak),
4. menempelkan **sumber, jenis sumber, status verifikasi, dan catatan peringatan**.

Jika tidak ada sumber yang mendukung, sistem menjawab jujur bahwa informasi tidak tersedia dan menyarankan bertanya ke pemilik akomodasi / kelian banjar.

```mermaid
flowchart LR
  Q["Pertanyaan pengguna<br/>EN / ID"] --> R["Cari di basis pengetahuan<br/>(semantic search)"]
  R --> F{"Ada sumber<br/>yang relevan?"}
  F -- Ya --> G["Susun jawaban<br/>HANYA dari sumber"]
  G --> A["Jawaban + sumber + label<br/>+ status verifikasi + catatan"]
  F -- Tidak --> N["Jawab jujur:<br/>informasi belum tersedia<br/>+ siapa yang bisa ditanya"]
```

---

## 2. Tech stack

```mermaid
flowchart TB
  subgraph FE["Frontend — folder web/"]
    direction LR
    FE1["React 18.3"] --- FE2["TypeScript 5.7"] --- FE3["Vite 6"] --- FE4["Tailwind CSS 4.1"] --- FE5["lucide-react (ikon)"]
  end
  subgraph BE["Backend — folder server/"]
    direction LR
    BE1["Node.js 20+"] --- BE2["Express 4.21"] --- BE3["TypeScript 5.7"] --- BE4["zod (validasi)"] --- BE5["express-rate-limit"] --- BE6["cors"]
  end
  subgraph AI["AI / RAG"]
    direction LR
    AI1["@huggingface/transformers 3.7<br/>(ONNX runtime, CPU)"] --- AI2["Xenova/multilingual-e5-small<br/>embedding 384 dimensi"] --- AI3["Gemini gemini-2.5-flash<br/>(opsional)"] --- AI4["gemini-embedding-001<br/>(opsional)"]
  end
  subgraph DB["Data"]
    direction LR
    DB1["knowledge/scenarios.json<br/>(sumber kebenaran)"] --- DB2["PostgreSQL 16 + pgvector<br/>(opsional)"] --- DB3["In-memory vector store<br/>+ cache disk"] --- DB4["pg (node-postgres)"]
  end
  subgraph QA["Testing"]
    direction LR
    QA1["Vitest 3.2"] --- QA2["Supertest"] --- QA3["Testing Library + jsdom"] --- QA4["Eval harness<br/>npm run eval"]
  end
  subgraph OPS["Infrastruktur"]
    direction LR
    OPS1["npm workspaces (monorepo)"] --- OPS2["Docker + docker-compose"] --- OPS3["Vercel (frontend)"] --- OPS4["Container host<br/>Render/Railway/Fly/Cloud Run"]
  end
  FE --> BE --> AI
  BE --> DB
```

| Lapisan | Teknologi | Peran | Alasan dipilih |
|---|---|---|---|
| UI | React 18 + TypeScript | Komponen tampilan, state chat | Standar industri, tipe aman |
| Build tool | Vite 6 | Dev server cepat, proxy `/api`, build produksi | Ringan, sesuai brief |
| Styling | Tailwind CSS 4 (`@theme` token) | Palet warna tanah, mobile-first | Konsisten, tanpa CSS terpisah banyak |
| Ikon | lucide-react | Ikon badge, tombol | Sesuai brief |
| API | Express 4 + TypeScript | 4 endpoint REST | Sederhana, matang |
| Validasi | zod | Validasi body request & file knowledge | Pesan error per field |
| Keamanan | express-rate-limit, cors | 30 req/menit/IP, origin dibatasi | Mencegah penyalahgunaan |
| Embedding | multilingual-e5-small via transformers.js | Mengubah teks EN/ID jadi vektor 384-d, berjalan lokal | Gratis, tanpa API key, mendukung bahasa Indonesia |
| LLM | Gemini (REST, JSON schema) | Menulis ulang jawaban dari sumber | Sesuai brief; opsional |
| Vector DB | PostgreSQL + pgvector (HNSW, cosine) | Penyimpanan & pencarian vektor skala besar | Sesuai brief |
| Vector fallback | MemoryVectorStore | Pencarian cosine di memori saat tanpa DB | MVP tetap jalan tanpa database |
| Test | Vitest, Supertest, Testing Library | Unit, API, UI | Satu runner untuk FE & BE |
| Deploy | Vercel + Docker | Frontend statis + container API | Sesuai brief |

---

## 3. Arsitektur sistem keseluruhan

```mermaid
flowchart LR
  subgraph Client["Browser pengguna (HP / laptop)"]
    UI["React SPA<br/>Landing → Setup → Chat"]
    LS[("localStorage<br/>bahasa + tipe pengguna")]
    UI <--> LS
  end

  subgraph Server["Backend Express — port 8787"]
    MW["Middleware<br/>CORS · JSON 16kB · rate limit"]
    RT["Routes<br/>/api/chat · /api/health<br/>/api/knowledge/categories · /api/feedback"]
    VAL["Validasi zod"]
    PIPE["RagPipeline"]
    HIST[("Riwayat percakapan<br/>di memori · 6 turn · maks 500")]
    MW --> RT --> VAL --> PIPE
    PIPE <--> HIST
  end

  subgraph RAG["Komponen RAG (bisa ditukar lewat interface)"]
    CLS["Classifier<br/>kategori · bahasa · lokasi · flag keamanan"]
    EMB["Embedder<br/>LocalEmbedder e5-small | GeminiEmbedder"]
    VS["VectorStore<br/>MemoryVectorStore | PgVectorStore"]
    LLM["LlmClient<br/>GeminiClient (opsional)"]
    EXT["Extractive generator<br/>(tanpa LLM)"]
    VD["validateDraft<br/>cek sitasi + bahasa"]
  end

  subgraph Data["Penyimpanan"]
    KB[("knowledge/scenarios.json")]
    CACHE[("server/.cache<br/>model + embedding")]
    PG[("PostgreSQL + pgvector<br/>knowledge_documents · feedback")]
    FB[("server/data/feedback.jsonl")]
  end

  EXTAPI["Google Gemini API"]

  UI -- "HTTPS JSON" --> MW
  PIPE --> CLS
  PIPE --> EMB
  PIPE --> VS
  PIPE --> LLM --> EXTAPI
  PIPE --> EXT
  LLM --> VD
  VS -.mode memory.-> CACHE
  VS -.mode pgvector.-> PG
  RT -- feedback --> FB
  RT -- "feedback (mode pgvector)" --> PG
  KB -- "npm run ingest" --> VS
```

**Keterangan:**

- **Client** hanya menyimpan preferensi (bahasa, tipe pengguna) di `localStorage`. Tidak ada akun, cookie, atau GPS.
- **Middleware** memasang CORS (hanya origin yang diizinkan), batas body 16 kB, dan rate limit 30 request/menit per IP.
- **RagPipeline** adalah otak sistem. Ia tidak tahu implementasi konkretnya; ia hanya memakai *interface* `Embedder`, `VectorStore`, `LlmClient`. File `bootstrap.ts` memilih implementasi berdasarkan environment variable:
  - tidak ada `DATABASE_URL` → `MemoryVectorStore` + feedback ke file JSONL,
  - ada `DATABASE_URL` → `PgVectorStore` + feedback ke tabel Postgres,
  - ada `GEMINI_API_KEY` → `GeminiClient` aktif, kalau tidak → mode extractive.
- **Riwayat percakapan** disimpan di memori server (bukan database) hanya untuk memahami pertanyaan lanjutan pendek seperti *"And my passenger?"*. Hilang saat server restart.
- **Gemini API** adalah satu-satunya layanan eksternal, dan hanya dipanggil bila API key valid dipasang.

---

## 4. Workflow end-to-end satu pertanyaan (sequence diagram)

```mermaid
sequenceDiagram
  autonumber
  actor U as Pengguna
  participant W as React SPA
  participant A as Express API
  participant P as RagPipeline
  participant C as Classifier
  participant E as Embedder (e5-small)
  participant V as VectorStore
  participant L as Gemini (opsional)
  participant X as Validator

  U->>W: Ketik "Apakah wajib pakai helm?"
  W->>W: Tampilkan bubble user + loading
  W->>A: POST /api/chat {message, language:"id", user_type, location:"canggu", conversation_id?}
  A->>A: Rate limit + validasi zod
  alt input tidak valid
    A-->>W: 400 VALIDATION_ERROR (detail per field)
  end
  A->>P: handle(request)
  P->>C: classify(message)
  C-->>P: kategori=traffic, flag lokasi & keamanan
  alt menyebut tempat di luar Bali
    P-->>A: fallback OUT_OF_SCOPE (tanpa sumber)
  end
  P->>P: Gabung dengan pertanyaan sebelumnya jika pesan < 5 kata
  P->>E: embedQuery("query: ...")
  E-->>P: vektor 384-d
  P->>V: search(vektor, bahasa=id, scope∈{canggu,badung,bali,indonesia}, status≠EXPIRED, k=4)
  V-->>P: 4 kandidat + skor cosine
  P->>P: Filter relevansi (skor ≥ 0.80 & kategori cocok, atau skor ≥ 0.86)
  alt tidak ada yang lolos
    P-->>A: fallback NO_MATCH / OFF_TOPIC + saran siapa yang ditanya
  else ada sumber
    opt GEMINI_API_KEY terpasang
      P->>L: system prompt + [S1..Sn] + pertanyaan
      L-->>P: JSON {answer, why, actions, used_source_ids}
      P->>X: validateDraft
      X-->>P: valid / ditolak
    end
    P->>P: Jika LLM tidak ada / error / ditolak → jawaban extractive dari sumber teratas
    P->>P: Tambah sumber, klasifikasi, caveat, status, confidence
    P-->>A: ChatResponse
  end
  A-->>W: 200 JSON
  W->>W: Render AnswerCard (panduan · alasan · tindakan · catatan · sumber)
  U->>W: Klik "Ya" (membantu)
  W->>A: POST /api/feedback
  A-->>W: 201 recorded
```

**Keterangan langkah penting:**

- **Langkah 4–5:** validasi terjadi sebelum AI dipanggil. Lokasi selain `canggu` langsung ditolak dengan pesan jelas.
- **Langkah 9:** pertanyaan lanjutan pendek diperkaya dengan pertanyaan sebelumnya agar pencarian tetap tepat sasaran.
- **Langkah 11–13:** pencarian selalu difilter bahasa yang dipilih, cakupan lokasi yang berlaku untuk Canggu, dan tidak pernah mengembalikan dokumen `EXPIRED`.
- **Langkah 14:** filter relevansi adalah penjaga utama melawan jawaban asal-asalan (lihat bagian 5).
- **Langkah 17–20:** jawaban LLM **tidak dipercaya begitu saja**; ia harus menyitir sumber yang benar-benar diambil dan berbahasa sesuai pilihan pengguna.

---

## 5. Pipeline RAG detail

```mermaid
flowchart TD
  IN["1 · Input<br/>message · language · user_type · location"] --> CL

  subgraph S2["2 · Klasifikasi intent & konteks (classifier.ts)"]
    CL["Hitung skor kata kunci EN/ID per kategori<br/>(8 kategori)"]
    LD["Deteksi bahasa<br/>(hitung kata penanda ID vs EN)"]
    LOC["Deteksi tempat<br/>luar Bali (Lombok, Jakarta…)<br/>area Bali lain (Ubud, Seminyak…)<br/>abaikan pola 'from/dari X'"]
    SAF["Flag keamanan<br/>asksCustomaryRule: awig-awig, pararem, denda adat<br/>fabricationAttempt: make up, invent, ignore your rules, karang"]
    CL --- LD --- LOC --- SAF
  end

  SAF --> OUT{"Tempat di<br/>luar Bali?"}
  OUT -- Ya --> FB1["Fallback OUT_OF_SCOPE"]
  OUT -- Tidak --> QP

  QP["3 · Query processing<br/>pesan < 5 kata → gabung dengan pertanyaan user sebelumnya"] --> EMB
  EMB["4a · Embedding query<br/>prefix 'query: ' · e5-small · normalisasi"] --> SR
  SR["4b · Vector search top-k = 4<br/>WHERE language = dipilih<br/>AND location ∈ {canggu, badung, bali, indonesia}<br/>AND status ≠ EXPIRED<br/>ORDER BY cosine"] --> RF

  RF["5 · Relevance filter<br/>lolos jika skor ≥ 0.80 DAN<br/>(kategori dokumen terdeteksi classifier ATAU skor ≥ 0.86)<br/>simpan maks 3 · dalam selisih 0.03 dari terbaik"] --> EMP{"Ada yang lolos?"}
  EMP -- Tidak --> FB2["Fallback NO_MATCH / OFF_TOPIC"]
  EMP -- Ya --> GEN

  GEN{"6 · LLM terpasang?"}
  GEN -- Ya --> LLMCALL["Gemini generateContent<br/>temperature 0.2 · JSON schema · timeout 20 dtk"]
  LLMCALL --> VAL{"8 · validateDraft<br/>jawaban ≥ 10 karakter?<br/>sitasi ⊆ sumber diambil?<br/>bahasa cocok?"}
  VAL -- Lolos --> ATTR
  VAL -- Gagal --> XT
  LLMCALL -. error / timeout .-> XT
  GEN -- Tidak --> XT["Extractive<br/>kutip content · why · actions<br/>dari dokumen teratas saja"]
  XT --> ATTR

  ATTR["7 · Source attribution<br/>SourceRef: id, judul, nama sumber, URL,<br/>jenis, status, tanggal, cakupan, applies_to, relevance"] --> CAV
  CAV["Caveat & status<br/>MATCHED jika skor teratas ≥ 0.84, selain itu WEAK_MATCH<br/>confidence: high hanya jika MATCHED & semua VERIFIED"] --> FIN["9 · Final response JSON"]
```

**Keterangan:**

| Tahap | File | Penjelasan |
|---|---|---|
| Klasifikasi | `rag/classifier.ts` | Berbasis aturan (bukan AI) agar deterministik dan bisa diuji. Menentukan kategori, bahasa, apakah menyebut tempat lain, dan apakah ada upaya meminta aturan adat atau mengarang. |
| Query processing | `rag/pipeline.ts` | Pertanyaan lanjutan pendek digabung dengan konteks sebelumnya. |
| Embedding | `rag/embeddings.ts` | Model e5 butuh awalan `query:` untuk pertanyaan dan `passage:` untuk dokumen. Vektor dinormalisasi sehingga cosine = dot product. |
| Vector search | `rag/vectorStore.ts`, `rag/pgVectorStore.ts` | Implementasi memori dan SQL punya semantik filter identik. |
| Relevance filter | `rag/pipeline.ts` (`filterRelevant`) | Skor e5 "terkompresi": pertanyaan tak terkait masih dapat ~0.82–0.84. Karena itu skor saja tidak cukup; kategori harus cocok dengan classifier, kecuali skornya sangat tinggi (≥ 0.86). |
| Generasi | `rag/llm.ts`, `rag/prompts.ts` | Prompt melarang menambah aturan, denda, tanggal, atau adat yang tidak ada di sumber. Pertanyaan user dibungkus sebagai "data, bukan instruksi". |
| Validasi | `validateDraft` | Menolak jawaban kosong, sitasi fiktif (mis. `S7` padahal hanya ada 3 sumber), tanpa sitasi, atau bahasa salah. |
| Atribusi | `toSourceRef` | Label jenis/status sumber diambil dari **metadata database**, bukan dari teks AI, sehingga AI tidak bisa "mengaku" sumbernya resmi. |

Semua ambang (0.80 / 0.84 / 0.86, top-k 4) bisa diatur lewat environment variable `RETRIEVAL_*`.

---

## 6. Logika keputusan status & fallback

```mermaid
flowchart TD
  S["Pertanyaan masuk"] --> A{"Menyebut tempat<br/>di luar Bali?"}
  A -- Ya --> OOS["retrieval_status = OUT_OF_SCOPE<br/>fallback_used = true<br/>sumber = []<br/>'Uji coba ini hanya mencakup Canggu, Bali…'"]
  A -- Tidak --> B{"Ada chunk lolos<br/>filter relevansi?"}
  B -- Tidak --> C{"Kategori terdeteksi<br/>ATAU minta aturan adat?"}
  C -- Ya --> NM["retrieval_status = NO_MATCH<br/>'Belum ada informasi terverifikasi… tidak akan menebak'<br/>+ tindakan: tanya host · kelian banjar · Desa Adat"]
  C -- Tidak --> OT["retrieval_status = OFF_TOPIC<br/>'LocalNorm hanya membahas etika sosial…'"]
  B -- Ya --> D{"Skor teratas ≥ 0.84?"}
  D -- Ya --> M["retrieval_status = MATCHED"]
  D -- Tidak --> W["retrieval_status = WEAK_MATCH<br/>+ caveat 'hanya sebagian sesuai'"]
  M --> E{"Semua sumber VERIFIED?"}
  E -- Ya --> H["confidence = high"]
  E -- Tidak --> MD["confidence = medium"]
  W --> LO["confidence = low"]
```

**Keterangan:** saat ini tidak ada dokumen berstatus `VERIFIED`, jadi confidence maksimum di sistem berjalan adalah `medium`. Ini disengaja: sistem tidak boleh terlihat lebih yakin daripada bukti yang ada.

---

## 7. Logika caveat (catatan peringatan)

```mermaid
flowchart LR
  R["Jawaban + sumber terpakai"] --> C1{"Ada sumber tidak VERIFIED?"}
  C1 -- Ya --> K1["'Sumber belum diverifikasi peninjau lokal'"]
  R --> C2{"Ada sumber DEMO_DATA?"}
  C2 -- Ya --> K2["'Sebagian adalah saran umum tim LocalNorm (DEMO_DATA)'"]
  R --> C3{"Tidak ada sumber<br/>bercakupan canggu?"}
  C3 -- Ya --> K3["'Berlaku untuk Bali/Indonesia secara umum;<br/>tidak ada aturan khusus Canggu'"]
  R --> C4{"user = newcomer DAN<br/>sumber applies_to = foreign_tourist?"}
  C4 -- Ya --> K4["'Aturan ini ditujukan untuk wisatawan asing;<br/>bagi WNI mungkin tidak berlaku formal'"]
  R --> C5{"Menyebut area Bali lain<br/>(Ubud, Seminyak…)?"}
  C5 -- Ya --> K5["'Adat khusus desa di area itu belum diverifikasi'"]
  R --> C6{"Minta awig-awig / pararem /<br/>denda adat?"}
  C6 -- Ya --> K6["'Tidak dapat menyebutkan atau mengarang aturan adat'"]
  R --> C7{"Upaya menyuruh mengarang /<br/>abaikan aturan?"}
  C7 -- Ya --> K7["'Saya tidak akan mengarang aturan'"]
```

**Keterangan:** semua teks caveat tetap (fixed) dalam dua bahasa di `rag/messages.ts`, bukan dibuat AI. Ini menjamin peringatan penting selalu muncul dengan kata-kata yang sama dan tidak bisa "dilunakkan" oleh model.

---

## 8. Mode generasi: LLM vs extractive

```mermaid
stateDiagram-v2
  [*] --> CekKey
  CekKey --> Extractive: tidak ada GEMINI_API_KEY
  CekKey --> PanggilLLM: key terpasang
  PanggilLLM --> Validasi: respons JSON diterima
  PanggilLLM --> Extractive: HTTP error / timeout 20 dtk / JSON rusak
  Validasi --> ModeLLM: sitasi valid & bahasa cocok
  Validasi --> Extractive: tanpa sitasi / sitasi fiktif / bahasa salah
  ModeLLM --> [*]: generation_mode = "llm"
  Extractive --> [*]: generation_mode = "extractive"
```

| Mode | Kapan | Kelebihan | Kekurangan |
|---|---|---|---|
| `llm` | Key valid & lolos validasi | Bahasa natural, bisa menggabungkan beberapa sumber | Butuh API berbayar, perlu dijaga dari halusinasi |
| `extractive` | Tanpa key, atau LLM gagal/ditolak | 100% sama dengan teks sumber, nol halusinasi, gratis | Kaku, hanya satu sumber per jawaban |
| `fallback` | Tidak ada sumber relevan | Jujur | Pengguna tidak mendapat jawaban |

> Status saat ini: **semua hasil terukur memakai mode `extractive`**, karena API key Gemini di environment ditolak. Jalur `llm` hanya diuji dengan klien tiruan (mock).

---

## 9. Workflow ingest basis pengetahuan

```mermaid
flowchart TD
  R1["Riset sumber publik<br/>JDIH Bali · BPK · portal Love Bali · berita resmi"] --> W1
  W1["Tulis skenario di knowledge/scenarios.json<br/>EN + ID: title, content, why, actions<br/>+ metadata sumber"] --> V1
  V1{"Validasi zod + aturan integritas<br/>· VERIFIED wajib validated_by & last_verified_at<br/>· DEMO_DATA tidak boleh VERIFIED<br/>· OFFICIAL_REGULATION wajib URL<br/>· id unik, dua bahasa lengkap"}
  V1 -- Gagal --> X1["Ingest berhenti dengan pesan error"]
  V1 -- Lolos --> CH["Chunking: 1 chunk per skenario per bahasa<br/>13 × 2 = 26 chunk"]
  CH --> HS["Hitung content_hash (SHA-256)<br/>dari title + content + actions"]
  HS --> MODE{"VECTOR_STORE?"}
  MODE -- memory --> MC{"Hash ada di cache?"}
  MC -- Ya --> MU["Pakai embedding lama"]
  MC -- Tidak --> ME["Embed 'passage: ...' (batch 8)<br/>simpan ke server/.cache"]
  MODE -- pgvector --> PC{"Hash & model sama<br/>dengan baris di DB?"}
  PC -- Ya --> PU["UPDATE metadata saja<br/>(embedding dipertahankan)"]
  PC -- Tidak --> PE["Embed ulang → INSERT … ON CONFLICT UPDATE"]
  PU --> PD["DELETE baris yang skenarionya sudah dihapus<br/>(dalam satu transaksi)"]
  PE --> PD
  MU --> READY["Siap dicari"]
  ME --> READY
  PD --> READY
```

**Keterangan:**

- `knowledge/scenarios.json` adalah **satu-satunya sumber kebenaran**. Database hanya salinan yang bisa dibangun ulang kapan saja (`npm run ingest`).
- Hash konten membuat ingest **idempoten** dan hemat: hanya teks yang berubah yang di-embed ulang. Mengubah status verifikasi saja tidak memicu embedding ulang.
- Run pertama mengunduh model e5-small (~120 MB) dan memakan ±3 menit di laptop pengembangan; run berikutnya hampir instan.

---

## 10. Model data

```mermaid
erDiagram
  SCENARIO ||--|{ KNOWLEDGE_DOCUMENT : "dipecah per bahasa"
  KNOWLEDGE_DOCUMENT }o--o{ FEEDBACK : "dirujuk lewat source_ids"
  SCHEMA_MIGRATIONS

  SCENARIO {
    string id "ln-001 … ln-013"
    string category
    string location
    string_array applies_to
    string source_name
    string source_url
    enum source_type
    enum validation_status
    string validated_by
    date effective_date
    timestamp last_verified_at
    boolean is_demo_data
    string notes
    object translations "en + id"
  }

  KNOWLEDGE_DOCUMENT {
    text id PK "ln-001-en"
    text doc_id "ln-001"
    text language "en | id"
    text title
    text content
    text why
    jsonb actions
    text category
    text location "canggu | badung | bali | indonesia"
    text_array applies_to "everyone | foreign_tourist"
    text source_name
    text source_url
    source_type source_type "OFFICIAL_REGULATION | COMMUNITY_VERIFIED | GENERAL_ADVISORY"
    validation_status validation_status "VERIFIED | UNVERIFIED | EXPIRED | UNDER_REVIEW"
    text validated_by
    date effective_date
    timestamptz last_verified_at
    boolean is_demo_data
    text notes
    text content_hash
    text embedding_model
    vector embedding "vector(384)"
    timestamptz created_at
    timestamptz updated_at
  }

  FEEDBACK {
    bigserial id PK
    text conversation_id
    text message_id
    text rating "helpful | not_helpful"
    text comment
    text_array source_ids
    text language
    timestamptz created_at
  }

  SCHEMA_MIGRATIONS {
    text name PK
    timestamptz applied_at
  }
```

**Keterangan:**

- `SCENARIO` adalah bentuk di file JSON; `KNOWLEDGE_DOCUMENT` adalah bentuk di database (satu baris per bahasa).
- Index: `(language, location, validation_status)` untuk filter, `(category)`, dan **HNSW `vector_cosine_ops`** untuk pencarian vektor.
- Constraint SQL meniru aturan integritas di kode: `VERIFIED` wajib punya peninjau; `DEMO_DATA` tidak boleh `VERIFIED`. Jadi data palsu ditolak di dua lapis.
- Dimensi vektor (`384`) diisi otomatis oleh `migrate.ts` dari `EMBEDDING_DIM`, sehingga bisa diganti bila memakai embedding Gemini.
- **Tidak ada tabel chat**; isi percakapan tidak disimpan.

**Isi basis pengetahuan saat ini:**

| Jenis sumber | Status | Jumlah skenario |
|---|---|---|
| OFFICIAL_REGULATION (SE Gubernur 7/2025, Pergub 97/2018, Pergub 47/2019, UU 22/2009, Perda 6/2023) | UNDER_REVIEW | 10 |
| GENERAL_ADVISORY (laporan ANTARA/PHRI soal Nyepi) | UNDER_REVIEW | 1 |
| GENERAL_ADVISORY editorial (DEMO_DATA) | UNVERIFIED | 2 |
| COMMUNITY_VERIFIED | — | 0 |

---

## 11. Workflow verifikasi konten

```mermaid
flowchart LR
  A["Entri baru<br/>UNDER_REVIEW / UNVERIFIED"] --> B["Peninjau membuka teks primer<br/>(JDIH / PDF resmi)"]
  B --> C{"Isi ringkasan<br/>sesuai teks primer?"}
  C -- Tidak --> D["Perbaiki content, effective_date,<br/>source_url ke sumber primer"] --> B
  C -- Ya --> E["Set validation_status = VERIFIED<br/>validated_by = nama & lembaga<br/>last_verified_at = tanggal"]
  E --> F["npm run ingest<br/>(aturan integritas dicek)"]
  F --> G["Jawaban menampilkan 'Terverifikasi'<br/>confidence bisa 'high'"]
  G --> H{"Aturan berubah /<br/>dicabut?"}
  H -- Ya --> I["Set EXPIRED → otomatis<br/>tidak diambil lagi"]
  H -- Tidak --> J["Jadwal cek ulang berkala"]
  K["Konten komunitas<br/>(banjar / Desa Adat)"] --> L["Hanya dengan persetujuan<br/>perwakilan bernama"] --> M["source_type = COMMUNITY_VERIFIED"]
```

**Keterangan:** alur ini sudah didukung kode (validasi + filter `EXPIRED`), tetapi **belum pernah dijalankan oleh peninjau manusia**. Itulah sebabnya belum ada entri `VERIFIED`.

---

## 12. Arsitektur frontend

### 12.1 Alur tampilan

```mermaid
stateDiagram-v2
  [*] --> Landing
  Landing --> Setup: klik "Mulai"
  Setup --> Landing: "Kembali"
  Setup --> Chat: "Mulai bertanya"<br/>simpan pengaturan ke localStorage
  Chat --> Setup: klik chip "Canggu · Wisatawan · ID"

  state Chat {
    [*] --> Kosong
    Kosong --> Memuat: klik saran / kirim pesan
    Memuat --> AdaJawaban: 200 OK
    Memuat --> Error: jaringan / server gagal
    Error --> Memuat: "Coba lagi"
    AdaJawaban --> Memuat: pertanyaan lanjutan
    AdaJawaban --> Kosong: "Percakapan baru"
  }
```

### 12.2 Pohon komponen

```mermaid
flowchart TD
  APP["App.tsx<br/>state: view, settings · header · toggle bahasa"] --> LAND["Landing.tsx<br/>hero · cara kerja · legenda label · batasan"]
  APP --> SET["Setup.tsx<br/>Wisatawan/Pendatang · lokasi Canggu · EN/ID"]
  APP --> CHAT["Chat.tsx<br/>state: messages, loading, conversationId"]
  LAND --> LEG["SourceLegend"]
  CHAT --> SUG["Pertanyaan saran (6)<br/>+ topik dari /api/knowledge/categories"]
  CHAT --> CARD["AnswerCard.tsx"]
  CHAT --> ERR["Bubble error + Coba lagi"]
  CARD --> BADGE["SourceBadge<br/>Aturan resmi · Terverifikasi komunitas · Saran umum"]
  CARD --> SEC["A Panduan · B Mengapa penting · C Tindakan<br/>Catatan · D/E Sumber · Feedback"]
  APP -.-> LIB["lib/api.ts (fetch + timeout + ApiError)<br/>lib/i18n.ts (teks EN/ID)<br/>lib/types.ts"]
```

**Keterangan:**

- Tidak memakai router; cukup state `view` di `App.tsx` karena hanya ada 3 tampilan.
- Semua teks UI ada di `lib/i18n.ts` dalam dua bahasa, termasuk label jenis sumber dan status verifikasi.
- `AnswerCard` memisahkan secara visual: **A** panduan, **B** alasan, **C** tindakan, kotak **Catatan** (caveat), **D** daftar sumber dan **E** badge klasifikasi beserta status, serta tombol feedback.
- Warna badge: biru = aturan resmi, hijau = terverifikasi komunitas, kuning = saran umum. Badge selalu punya ikon dan teks, jadi warna bukan satu-satunya penanda (aksesibilitas).
- Dev: Vite mem-proxy `/api` ke `localhost:8787`. Produksi: `VITE_API_BASE_URL`.

---

## 13. Arsitektur modul backend

```mermaid
flowchart TD
  IDX["index.ts<br/>listen PORT"] --> BOOT["bootstrap.ts<br/>rakit dependensi dari env"]
  IDX --> APPM["app.ts<br/>routes · zod · rate limit · error handler"]
  BOOT --> CFG["config.ts<br/>baca .env"]
  BOOT --> EMBM["rag/embeddings.ts"]
  BOOT --> LLMM["rag/llm.ts"]
  BOOT --> KNM["rag/knowledge.ts"]
  BOOT --> VSM["rag/vectorStore.ts"]
  BOOT --> PGM["rag/pgVectorStore.ts"]
  BOOT --> FBM["feedback.ts"]
  BOOT --> PIPEM["rag/pipeline.ts"]
  PIPEM --> CLSM["rag/classifier.ts"]
  PIPEM --> PRM["rag/prompts.ts"]
  PIPEM --> MSG["rag/messages.ts"]
  PGM --> POOL["db/pool.ts"]
  FBM --> POOL
  APPM --> PIPEM
  APPM --> TYP["types.ts<br/>enum & tipe bersama"]

  subgraph Scripts["scripts/ (CLI)"]
    MIG["migrate.ts<br/>jalankan db/migrations/*.sql"]
    ING["ingest.ts<br/>validasi → embed → simpan"]
    EVL["eval.ts<br/>jalankan skenario → laporan"]
  end
  MIG --> POOL
  ING --> KNM
  ING --> PGM
  EVL --> BOOT
  EVL --> SCN["eval/scenarios.ts<br/>18 tuning + 10 holdout"]
```

**Keterangan:** pola *dependency injection* membuat pipeline bisa diuji dengan embedder hash palsu dan LLM tiruan (tes jalan ±2 detik tanpa unduh model), sementara produksi memakai komponen asli. Script `eval.ts` memakai `bootstrap.ts` yang sama dengan server, sehingga yang diukur benar-benar sistem yang dipakai pengguna.

---

## 14. Penanganan error

```mermaid
flowchart TD
  REQ["Request masuk"] --> RL{"> 30 req/menit?"}
  RL -- Ya --> E429["429 RATE_LIMITED"]
  RL -- Tidak --> JS{"JSON valid & ≤ 16 kB?"}
  JS -- "JSON rusak" --> E400J["400 INVALID_JSON"]
  JS -- "terlalu besar" --> E413["413 PAYLOAD_TOO_LARGE"]
  JS -- OK --> ZD{"Lolos zod?"}
  ZD -- Tidak --> E400["400 VALIDATION_ERROR<br/>+ detail per field"]
  ZD -- Ya --> PR["Pipeline"]
  PR -- "LLM error / timeout" --> DEG["Turun ke extractive<br/>(user tetap dapat jawaban)"]
  PR -- "vector store error" --> E500["500 INTERNAL_ERROR<br/>pesan generik, detail di log"]
  PR -- OK --> OK200["200 ChatResponse"]

  subgraph UI["Frontend"]
    NET["fetch gagal / timeout 45 dtk"] --> UIE["Bubble error + tombol Coba lagi"]
    FBF["Feedback gagal"] --> UIF["Pesan kecil 'Gagal mengirim masukan'"]
  end
```

**Keterangan:** kegagalan LLM tidak pernah membuat pengguna mendapat error; sistem turun ke mode extractive. `/api/health` mengembalikan `503 degraded` bila vector store mati atau kosong, dan tidak pernah menampilkan key atau connection string.

---

## 15. Workflow pengujian & evaluasi

```mermaid
flowchart LR
  subgraph Unit["npm test (± 7 dtk, tanpa model)"]
    T1["knowledge.test.ts<br/>integritas basis pengetahuan"]
    T2["classifier.test.ts<br/>kategori, bahasa, lokasi, flag"]
    T3["pipeline.test.ts<br/>retrieval, fallback, LLM mock, validasi"]
    T4["api.test.ts<br/>health, validasi, error, feedback"]
    T5["App.test.tsx<br/>alur UI, AnswerCard, error + retry"]
  end
  subgraph Eval["npm run eval (model asli)"]
    E1["18 skenario tuning<br/>dipakai mengkalibrasi ambang"]
    E2["10 skenario holdout<br/>ditulis setelahnya, tidak dituning"]
    E1 --> RPT["docs/eval/EVAL_REPORT.md<br/>+ eval-results.json"]
    E2 --> RPT
  end
  Unit --> PASS["53/53 lulus"]
  RPT --> MET["Metrik: relevansi top-1, sitasi,<br/>grounded rate, fallback, bahasa, caveat"]
```

**Hasil terukur (mode extractive, embedding e5-small):**

| Metrik | Tuning (18) | Holdout (10) |
|---|---|---|
| Skenario lulus | 18/18 | 6/10 |
| Sumber benar di urutan pertama | 14/14 | **3/7** |
| Jawaban selalu bersumber / fallback jujur | 18/18 | 10/10 |
| Fallback benar | 4/4 | 3/3 |
| Bahasa konsisten | 18/18 | 10/10 |

Angka tuning optimis karena ambang dikalibrasi dengan soal yang sama. Angka holdout lebih jujur: pencarian masih lemah untuk kata-kata yang tidak dikenal classifier, tetapi gagalnya **aman** (menolak menjawab atau mengutip sumber berlabel, tidak mengarang).

---

## 16. Arsitektur deployment

```mermaid
flowchart LR
  DEV["Developer"] -- git push --> GH["GitHub repo"]
  GH -- "auto build (root: web/)" --> VC["Vercel<br/>static SPA web/dist"]
  GH -- "docker build -f server/Dockerfile" --> CH["Container host<br/>Render / Railway / Fly / Cloud Run<br/>≥ 1 GB RAM"]
  USER["Pengguna"] -- HTTPS --> VC
  VC -- "VITE_API_BASE_URL" --> CH
  CH -- "DATABASE_URL (opsional)" --> PG[("Managed Postgres + pgvector<br/>Neon / Supabase")]
  CH -. "GEMINI_API_KEY (opsional)" .-> GM["Google Gemini API"]

  subgraph Container["Isi container API"]
    S1["Saat build: unduh & panaskan model e5-small"]
    S2["Saat start (mode pgvector):<br/>migrate → ingest → node dist/index.js"]
  end
  CH --- Container
```

**Keterangan:**

- **Lokal:** `npm run dev:server` + `npm run dev:web`; database opsional via `docker compose up -d db` (pgvector di port 5433 agar tidak bentrok dengan Postgres lokal di 5432).
- **Produksi:** frontend statis di Vercel, API di container. Tanpa database pun API bisa berjalan dengan store memori (cukup untuk satu instance dan 26 chunk).
- Rahasia (`GEMINI_API_KEY`, `DATABASE_URL`) hanya lewat environment variable di host, tidak pernah di repo.

---

## 17. Status implementasi

```mermaid
flowchart TB
  classDef ok fill:#e3ebdc,stroke:#3f5a3a,color:#2b2420
  classDef part fill:#f6ead0,stroke:#7a5413,color:#2b2420
  classDef no fill:#f1e3d6,stroke:#8a5a3b,color:#2b2420,stroke-dasharray: 4 3

  A["Frontend 3 tampilan + AnswerCard"]:::ok
  B["API 4 endpoint + validasi + rate limit"]:::ok
  C["Classifier + safety flags"]:::ok
  D["Embedding lokal e5-small"]:::ok
  E["MemoryVectorStore + filter"]:::ok
  F["Mode extractive + fallback + caveat"]:::ok
  G["53 tes + eval 28 skenario"]:::ok
  H["Gemini LLM (hanya diuji dengan mock)"]:::part
  I["PgVectorStore + migrasi SQL (belum dijalankan)"]:::part
  J["Riwayat chat (hanya dalam sesi)"]:::part
  K["Deployment publik"]:::no
  L["Konten VERIFIED oleh peninjau"]:::no
  M["Konten komunitas Canggu"]:::no
  N["Docker image build"]:::no
```

| Warna | Arti |
|---|---|
| Hijau | Sudah dibuat **dan** dijalankan/diuji |
| Kuning | Sudah dibuat, **belum terbukti** di lingkungan nyata |
| Coklat putus-putus | Belum ada |

Detail lengkap ada di [FINAL_EXECUTION_REPORT.md](FINAL_EXECUTION_REPORT.md) dan [PRODUCT_LIMITATIONS.md](PRODUCT_LIMITATIONS.md).
