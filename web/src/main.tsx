import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AOS from 'aos';
import 'aos/dist/aos.css';
import './index.css';

AOS.init({
  duration: 650,
  easing: 'ease-out-cubic',
  offset: 64,
  once: true,
  disable: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
});
document.documentElement.classList.add('aos-enabled');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
