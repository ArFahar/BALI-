import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { AnswerCard } from './components/AnswerCard';
import type { ChatResponse } from './lib/types';

const answer: ChatResponse = {
  conversation_id: '7b6f4f4e-6a43-4a43-9c70-0f0d1b3d6d11',
  answer:
    'The most relevant source on neighbourhood life is a customary rule of Desa Adat Canggu: Awig-Awig Desa Adat Canggu (Pasal 4). It is written in Indonesian; the relevant passage is quoted below in its original wording.',
  why_it_matters: 'Reporting lets the banjar know who lives in the neighbourhood.',
  category: 'neighborhood_etiquette',
  recommended_actions: ['Before acting on a customary rule, confirm the current practice with your host or the kelian banjar.'],
  quote: {
    text: 'Dalam satu wuku (tujuh hari), melapor kepada prajuru adat dan dinas dengan dokumen yang jelas.',
    language: 'id',
    source_id: 'CANGGU-AWIG-2012-ID::Pasal-4#1',
  },
  sources: [
    {
      id: 'CANGGU-AWIG-2012-ID::Pasal-4#1',
      title: 'Awig-Awig Desa Adat Canggu 2012 (terjemahan tidak resmi) — Pasal 4',
      document_title: 'Awig-Awig Desa Adat Canggu (naskah 2012) - terjemahan Bahasa Indonesia tidak resmi',
      source_name: 'Awig-Awig Desa Adat Canggu (naskah 2012)',
      source_url: 'https://jidhat.baliprov.go.id/storage/perarem/example.pdf',
      source_type: 'CUSTOMARY_RULE',
      validation_status: 'UNDER_REVIEW',
      effective_date: null,
      location: 'canggu',
      applies_to: ['tamiu', 'krama_adat'],
      articles: ['Pasal 4'],
      page_number: 18,
      page_ref_type: 'original_scan_page',
      language: 'id',
      flags: ['UNOFFICIAL_TRANSLATION'],
      is_demo_data: false,
      relevance: 0.89,
    },
  ],
  source_classification: ['CUSTOMARY_RULE'],
  caveats: ['The sources used have not yet been verified by a local reviewer.'],
  retrieval_status: 'MATCHED',
  confidence: 'medium',
  fallback_used: false,
  generation_mode: 'extractive',
  language: 'en',
  search_translation: 'Apakah saya wajib melapor ke banjar?',
};

function mockFetch(handler: (url: string, init?: RequestInit) => unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = handler(url, init);
      if (body instanceof Error) throw body;
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('AnswerCard', () => {
  it('separates guidance, why, actions, sources and classification', () => {
    render(<AnswerCard response={answer} messageId="m1" />);
    expect(screen.getByText(answer.answer)).toBeInTheDocument();
    expect(screen.getByText('Why it matters')).toBeInTheDocument();
    expect(screen.getByText('What you can do')).toBeInTheDocument();
    expect(screen.getByText('Sources')).toBeInTheDocument();
    // Awig-awig is a customary village rule, never shown as a government regulation.
    expect(screen.getAllByText('Customary rule').length).toBeGreaterThan(0);
    expect(screen.queryByText('Government regulation')).toBeNull();
    // Verbatim quote in its original language, with article, original-scan page and source flags.
    expect(screen.getByText(/Source text · original, Indonesian/)).toBeInTheDocument();
    expect(screen.getByText(answer.quote!.text)).toHaveAttribute('lang', 'id');
    expect(screen.getByText('Pasal 4 · page 18 of the original scan')).toBeInTheDocument();
    expect(screen.getByText('Unofficial translation')).toBeInTheDocument();
    expect(screen.getByText('Under review')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open source/i })).toHaveAttribute('href', answer.sources[0].source_url);
  });

  it('shows an explicit no-source message for fallbacks', () => {
    render(
      <AnswerCard
        messageId="m2"
        response={{ ...answer, sources: [], source_classification: [], quote: null, retrieval_status: 'NO_MATCH', fallback_used: true, generation_mode: 'fallback', why_it_matters: null }}
      />,
    );
    expect(screen.getByText(/No source in the knowledge base/)).toBeInTheDocument();
    expect(screen.getByText('Not in knowledge base')).toBeInTheDocument();
  });

  it('labels demo data', () => {
    render(<AnswerCard messageId="m3" response={{ ...answer, sources: [{ ...answer.sources[0], is_demo_data: true, source_type: 'GENERAL_ADVISORY' }] }} />);
    expect(screen.getByText('Demo data')).toBeInTheDocument();
  });

  it('sends feedback', async () => {
    mockFetch(() => ({ status: 'recorded' }));
    render(<AnswerCard response={answer} messageId="m4" />);
    fireEvent.click(screen.getByRole('button', { name: /yes/i }));
    await waitFor(() => expect(screen.getByText(/Thanks for the feedback/)).toBeInTheDocument());
  });
});

describe('App flow', () => {
  async function goToChat(lang: 'EN' | 'ID' = 'EN') {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: lang }));
    fireEvent.click(screen.getByRole('button', { name: lang === 'EN' ? /start asking/i : /mulai bertanya/i }));
  }

  it('goes hero (context form) → chat and shows suggested questions', async () => {
    mockFetch((url) => (url.includes('categories') ? { categories: [] } : answer));
    await goToChat();
    expect(screen.getByText('What would you like to know?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /helmet and licence/i }));
    await waitFor(() => expect(screen.getByText(answer.answer)).toBeInTheDocument());
  });

  it('sends the selected language, user type and location', async () => {
    const calls: unknown[] = [];
    mockFetch((url, init) => {
      if (url.includes('chat')) calls.push(JSON.parse(String(init?.body)));
      return url.includes('categories') ? { categories: [] } : { ...answer, language: 'id' };
    });
    await goToChat('ID');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Apakah wajib pakai helm?' } });
    fireEvent.click(screen.getByRole('button', { name: /kirim/i }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ language: 'id', user_type: 'tourist', location: 'canggu' });
  });

  it('hero contains the context form, and the user type chosen there is sent', async () => {
    const calls: unknown[] = [];
    mockFetch((url, init) => {
      if (url.includes('chat')) calls.push(JSON.parse(String(init?.body)));
      return url.includes('categories') ? { categories: [] } : answer;
    });
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'EN' }));
    expect(screen.getByRole('img', { name: /temple/i })).toHaveAttribute('src', '/hero-pura.webp');
    // The hero holds the context form itself; there is no free-text question box before it.
    expect(screen.getByRole('heading', { name: /set your context/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /newcomer/i }));
    // Language chosen in the form re-renders the hero copy.
    fireEvent.click(screen.getByRole('radio', { name: 'Bahasa Indonesia' }));
    expect(screen.getByRole('heading', { name: /atur konteks anda/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: /start asking/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Do I need a helmet?' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => expect(screen.getByText(answer.answer)).toBeInTheDocument());
    expect(calls[0]).toMatchObject({ message: 'Do I need a helmet?', user_type: 'newcomer', language: 'en' });
  });

  it('shows an error state with retry when the server is unreachable', async () => {
    mockFetch((url) => (url.includes('categories') ? { categories: [] } : new TypeError('Failed to fetch')));
    await goToChat();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Can I enter the temple?' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Cannot reach the LocalNorm server/));
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
