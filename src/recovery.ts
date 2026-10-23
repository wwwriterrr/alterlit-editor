import type { FormState } from './store';

/**
 * Страховка от потери текста: пока есть несохранённые изменения, копия формы лежит в
 * localStorage этого браузера. Закрыли вкладку, упал интернет, кончилась сессия — при
 * следующем открытии редактор предложит восстановить. После сохранения копия удаляется.
 */
export interface Snapshot {
  at: number;
  title: string;
  content: string;
  form: Pick<FormState, 'preview' | 'ear' | 'site' | 'delay' | 'categories' | 'genres' | 'galleryType'>;
}

const PREFIX = 'pe-recovery:';
const MAX_AGE = 14 * 24 * 3600_000;

export const recoveryKey = (id: number | null, postType: string, reviewOf: number | null) =>
  PREFIX + (id ? `post-${id}` : `new-${postType}${reviewOf ? `-${reviewOf}` : ''}`);

export function loadSnapshot(key: string): Snapshot | null {
  try {
    const s = JSON.parse(localStorage.getItem(key) || 'null') as Snapshot | null;
    if (!s || Date.now() - s.at > MAX_AGE) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveSnapshot(key: string, s: Snapshot) {
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    /* переполнено или запрещено — без страховки */
  }
}

export function dropSnapshot(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ничего */
  }
}
