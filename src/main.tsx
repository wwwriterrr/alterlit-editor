import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import { setCsrfFallback } from './api';
import App from './App';
import './editor.css';

// Шаблон страницы /post/new/ и /post/edit/: <div id="alterlit-editor" data-csrf="{{ csrf_token }}"></div>
// Что открыть, остров понимает по адресу (route.ts).
const rootEl = document.getElementById('alterlit-editor');
if (rootEl) {
  setCsrfFallback(rootEl.dataset.csrf ?? '');
  createRoot(rootEl).render(
    <StrictMode>
      <Provider store={store}>
        <App />
      </Provider>
    </StrictMode>,
  );
}
