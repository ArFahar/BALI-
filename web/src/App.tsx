import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Chat } from './components/Chat';
import { Landing } from './components/Landing';
import { Setup } from './components/Setup';
import { t } from './lib/i18n';
import type { Language, Settings } from './lib/types';

type View = 'landing' | 'setup' | 'chat';
const STORAGE_KEY = 'localnorm.settings';

function loadSettings(): Settings {
  const browserLang: Language = navigator.language?.toLowerCase().startsWith('id') ? 'id' : 'en';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if ((s.language === 'en' || s.language === 'id') && (s.userType === 'tourist' || s.userType === 'newcomer')) {
        return { language: s.language, userType: s.userType, location: 'canggu' };
      }
    }
  } catch {
    /* storage unavailable — fall back to defaults */
  }
  return { language: browserLang, userType: 'tourist', location: 'canggu' };
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#eeeeee" />
        <path d="M16 6l-5 5h10zM9 13h14l-2 3H11zM8 18h16l-2 3H10zM12 23h8v3h-8z" fill="#050505" />
      </svg>
      <span className="font-display text-[22px] leading-none text-bone">Mawacara AI</span>
    </span>
  );
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [view, setView] = useState<View>('landing');
  const s = t(settings.language);
  const overHero = view === 'landing';

  useEffect(() => {
    document.documentElement.lang = settings.language;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  return (
    <div className="min-h-dvh bg-obsidian">
      <header
        className={`z-20 w-full ${overHero ? 'absolute inset-x-0 top-0' : 'sticky top-0 border-b border-white/10 bg-obsidian/90 backdrop-blur'}`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <button type="button" onClick={() => setView('landing')} aria-label={`${s.brand} — home`}>
            <Wordmark />
          </button>
          {view === 'chat' ? (
            <button
              type="button"
              onClick={() => setView('setup')}
              className="inline-flex items-center gap-1.5 rounded-tag border border-white/20 px-3 py-1.5 text-xs text-bone hover:bg-carbon"
            >
              <MapPin className="size-3.5" aria-hidden />
              Canggu · {settings.userType === 'tourist' ? s.tourist : s.newcomer} · {settings.language.toUpperCase()}
              <span className="sr-only">— {s.change}</span>
            </button>
          ) : (
            <div
              className="inline-flex rounded-tag border border-white/20 bg-black/30 p-0.5 text-[11px] backdrop-blur"
              role="radiogroup"
              aria-label="Language"
            >
              {(['en', 'id'] as Language[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={settings.language === l}
                  onClick={() => setSettings({ ...settings, language: l })}
                  className={`rounded-[8px] px-2.5 py-1 font-semibold tracking-[0.12em] ${
                    settings.language === l ? 'bg-bone text-pitch' : 'text-bone/80'
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {view === 'landing' && (
        <Landing settings={settings} onChange={setSettings} onStart={() => setView('chat')} />
      )}
      {view === 'setup' && (
        <Setup value={settings} onChange={setSettings} onBack={() => setView('chat')} onDone={() => setView('chat')} />
      )}
      {view === 'chat' && (
        <Chat key={`${settings.language}-${settings.userType}`} settings={settings} />
      )}

      {view !== 'chat' && (
        <footer className="border-t border-white/10 px-4 py-8 text-center text-xs text-ash">{s.footer}</footer>
      )}
    </div>
  );
}
