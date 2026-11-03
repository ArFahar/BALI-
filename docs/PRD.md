# Product Requirements Document — LocalNorm AI

Version 0.1 (MVP) · 2026-11-03 · Bali DigiFest 2026, category *Bali Smart Society*

## 1. Product overview

LocalNorm AI is a web assistant that answers everyday etiquette questions for tourists and newcomers in **Canggu, Badung, Bali**. It retrieves guidance from a small curated knowledge base and returns an answer that always shows *where it came from* and *what kind of source it is* (official regulation, community-verified guideline, or general advice).

## 2. Product vision

Help people understand local norms before their actions become social misunderstandings.

## 3. Problem statement

Visitors to Canggu interact with a residential Balinese community whose social expectations, religious practices and public-conduct rules may be unfamiliar. Relevant guidance exists — provincial regulations, governor circulars, hotel-association advice — but it is scattered, mostly in Indonesian legal language, and hard to apply to a specific situation ("a procession is blocking my scooter, what now?").

## 4. Problem assumptions and validation gaps

This statement is a **hypothesis**, not an established finding.

| Assumption | Evidence we have | Gap |
|---|---|---|
| Visitors find it hard to locate and apply local guidance | The provincial government issued dedicated tourist circulars in 2023 and 2025 and opened a WhatsApp reporting line, which suggests recurring conduct issues | No user research with Canggu visitors yet |
| Misunderstandings are partly caused by an information gap (not only by intent) | Plausible; not measured | Needs interviews / surveys |
| A chat interface is preferred over a static guide | Not validated | A/B or usability test |
| Local communities want this information shared this way | **Not validated** | Must be discussed with Desa Adat Canggu / banjar representatives before claiming community endorsement |

LocalNorm does **not** claim to reduce conflict, overtourism or structural problems in Bali.

## 5. Target users and personas

- **Tourist — "Maya", 27, Australia, 10-day surf trip.** Rents a scooter, stays in a villa, wants to "not be that tourist". Needs quick, concrete do/don't guidance on her phone.
- **Newcomer — "Daniel", 34, remote worker, 6 months in Canggu.** Long-term villa rental inside a banjar; deals with neighbours, waste collection, Nyepi, ceremonies. Needs to know which rules apply to him and who to ask locally.
- **Newcomer — "Rina", 29, Indonesian, moved from Jakarta for work.** Many tourist circulars address *foreign* tourists; she needs to know what applies to her.

## 6. User needs and pain points

- "Is this a law or just politeness?" — need for **source classification**.
- "Does this apply to me?" — need for **applicability** (foreign tourists vs everyone).
- "Is this specific to Canggu?" — need for **location honesty**.
- Answers in **English or Indonesian**, short, on mobile.
- Not being given confident but invented rules.

## 7. Product goals

1. Answer common etiquette questions for Canggu with a cited source in ≤ a few seconds.
2. Make the type and verification status of every source visible.
3. Refuse to invent rules; fall back clearly when information is missing.
4. Work fully without paid APIs (extractive mode), and improve with an LLM when configured.

## 8. Non-goals

GPS / automatic geolocation; locations beyond Canggu; voice; social features; conflict reporting or mediation; government dashboards; custom-trained models; user accounts.

## 9. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Landing page explaining purpose, how it works, source labels and limits | P0 |
| FR-02 | User context selection: Tourist / Newcomer | P0 |
| FR-03 | Location selection (Canggu only; other areas clearly not offered) | P0 |
| FR-04 | Language selection EN / ID; answers in the selected language | P0 |
| FR-05 | Chat interface with message history in the session | P0 |
| FR-06 | LLM integration (Gemini) with structured output | P0 (implemented; not live-tested — see limitations) |
| FR-07 | RAG retrieval over a curated knowledge base with multilingual embeddings | P0 |
| FR-08 | Curated knowledge base (10–12+ scenarios, 8 categories) with source metadata | P0 |
| FR-09 | Source citations in every grounded answer | P0 |
| FR-10 | Source classification + validation status displayed | P0 |
| FR-11 | Answer split into guidance / why it matters / recommended actions | P0 |
| FR-12 | Fallback when no reliable information (no match, out of scope, off-topic) | P0 |
| FR-13 | Loading, error (with retry) and empty states | P0 |
| FR-14 | Responsive, mobile-first layout | P0 |
| FR-15 | README + technical docs | P0 |
| FR-16 | Feedback (helpful / not helpful) per answer | P1 ✅ |
| FR-17 | Suggested questions | P1 ✅ |
| FR-18 | Conversation history (in-session, server keeps last 6 turns for context) | P1 ✅ (no persistent history) |

## 10. Non-functional requirements

- **Grounding:** no answer text without at least one retrieved source; LLM citations validated against retrieved set.
- **Honesty:** nothing labelled `VERIFIED` without a named human reviewer; demo content labelled `DEMO_DATA`.
- **Performance:** p50 answer latency < 1 s in extractive mode on a laptop (measured informally ~100–300 ms after warm-up).
- **Privacy:** no accounts, no location tracking; chat text is not persisted (only optional feedback).
- **Security:** secrets only in environment variables; input validation; rate limiting; no secrets in health output.
- **Accessibility:** semantic headings, labelled controls, focus outlines, `aria-live` chat, reduced-motion support.

## 11. User stories

1. As a tourist, I want to ask "can I enter this temple?" and get a short answer with the rule's source, so I can act respectfully.
2. As a newcomer, I want to know whether a rule applies to me, so I don't over- or under-comply.
3. As any user, I want to see whether advice is an official regulation or general etiquette, so I know how seriously to take it.
4. As an Indonesian speaker, I want to ask and read answers in Bahasa Indonesia.
5. As any user, when the app doesn't know, I want it to say so and tell me who to ask.
6. As the team, I want feedback on answers so we can improve the knowledge base.

## 12. User journey

Landing → "Get started" → choose Tourist/Newcomer, Canggu, language → chat (suggested questions shown) → ask → answer card (status, labels, guidance, why, actions, notes, sources) → optional feedback → follow-up question or change context.

## 13. MVP feature prioritisation

P0 as listed in §9 are all implemented. P1 feedback, suggested questions and in-session history are implemented. Persistent chat history across sessions is not.

## 14. Acceptance criteria

| Feature | Acceptance criteria | Status |
|---|---|---|
| Landing | Shows purpose, 3-step explanation, label legend, limitations; CTA leads to setup | ✅ verified in browser |
| Context & location | Tourist/Newcomer and EN/ID selectable; location fixed to Canggu with explanation; choice persists across reloads | ✅ |
| Chat | Enter submits; empty input disabled; history visible; new conversation button | ✅ |
| Retrieval | For each tuning eval question, the expected document is the top source | ✅ 14/14 (tuning); 3/7 holdout — see TESTING.md |
| Citations | Every non-fallback answer lists ≥1 source with name, type, status, URL if any | ✅ 100% grounded in eval |
| Classification | Source type badge + validation status shown per source | ✅ |
| Fallback | No-match / out-of-scope / off-topic return no sources, `fallback_used=true` and guidance on who to ask | ✅ 7/7 |
| Language | Answer text in selected language | ✅ 28/28 |
| Errors | Network/server failure shows an alert with retry; API returns typed error codes | ✅ tested |
| Responsive | No horizontal scroll at 375 px | ✅ checked (scrollWidth = 375) |
| LLM | With a valid key, Gemini output is used only if citations are valid and language matches | ✅ unit-tested with a mock; ❌ not tested against the live API |

## 15. Success metrics (to be measured in a pilot — none measured yet)

- Grounded response rate (target 100%) — measured offline: 100%.
- Top-1 retrieval accuracy on held-out questions (target ≥ 80%) — measured offline: 42.9% (3/7). **Below target.**
- Share of answers rated helpful (target ≥ 70%) — not yet measured.
- Fallback rate on real traffic — not yet measured.
- Number of knowledge entries verified by a named local reviewer (target: all) — currently 0.

## 16. Risks and constraints

- No community validation yet; risk of misrepresenting local culture → all content labelled, no customary rules included, partnership needed.
- Legal texts change → re-verification process and `EXPIRED` status.
- Small knowledge base → many questions will fall back (by design, but limits usefulness).
- No live LLM tested → answers currently quote the knowledge base verbatim.
