// С сервера даты приходят без часового пояса (USE_TZ=False) — это время сервера, Москва.
const SERVER_OFFSET = '+03:00';
export const parseDate = (v: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v + SERVER_OFFSET);

const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** «14:05», «вчера, 14:05», «3 октября, 14:05», «3 октября 2024 г., 14:05». */
export function formatDate(value: string) {
  const d = parseDate(value);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  const hm = time.format(d);
  if (days === 0) return `сегодня, ${hm}`;
  if (days === 1) return `вчера, ${hm}`;
  if (days === -1) return `завтра, ${hm}`;
  return `${(d.getFullYear() === new Date().getFullYear() ? dayMonth : dayMonthYear).format(d)}, ${hm}`;
}

/** Отложенная публикация: значение 'ГГГГ-ММ-ДДTЧЧ:ММ' — время сервера (Москва). */
export function formatDelay(value: string) {
  return formatDate(value);
}

const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};
export const pluralize = (n: number, forms: [string, string, string]) => `${n} ${plural(n, ...forms)}`;
export const num = (n: number) => n.toLocaleString('ru-RU');
