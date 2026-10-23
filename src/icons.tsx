// Иконки панели — линейные, 24×24, цвет — currentColor.
type P = { className?: string };
const I = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    {children}
  </svg>
);

export const Undo = (p: P) => (
  <I {...p}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
  </I>
);
export const Redo = (p: P) => (
  <I {...p}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 000 11H13" />
  </I>
);
export const Bold = (p: P) => (
  <I {...p}>
    <path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z" />
  </I>
);
export const Italic = (p: P) => (
  <I {...p}>
    <path d="M10 5h8M6 19h8M14.5 5l-5 14" />
  </I>
);
export const Underline = (p: P) => (
  <I {...p}>
    <path d="M7 4v7a5 5 0 0010 0V4M5 20h14" />
  </I>
);
export const Strike = (p: P) => (
  <I {...p}>
    <path d="M4 12h16M16.5 7.5A4 3.2 0 0012 5c-2.5 0-4.2 1.4-4.2 3.2 0 1.3.9 2.3 2.4 2.8M7.5 16.5A4.4 3.2 0 0012 19c2.6 0 4.4-1.4 4.4-3.3 0-.8-.3-1.4-.8-1.9" />
  </I>
);
export const Sup = (p: P) => (
  <I {...p}>
    <path d="M4 7l8 11M12 7l-8 11M16.5 7.5a1.8 1.8 0 113.2 1.2L16.5 12H20" />
  </I>
);
export const Sub = (p: P) => (
  <I {...p}>
    <path d="M4 5l8 11M12 5l-8 11M16.5 15.5a1.8 1.8 0 113.2 1.2L16.5 20H20" />
  </I>
);
export const AlignLeft = (p: P) => (
  <I {...p}>
    <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
  </I>
);
export const AlignCenter = (p: P) => (
  <I {...p}>
    <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />
  </I>
);
export const AlignRight = (p: P) => (
  <I {...p}>
    <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />
  </I>
);
export const AlignJustify = (p: P) => (
  <I {...p}>
    <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </I>
);
export const Indent = (p: P) => (
  <I {...p}>
    <path d="M10 6h10M10 12h10M10 18h10M4 9l3 3-3 3" />
  </I>
);
export const Outdent = (p: P) => (
  <I {...p}>
    <path d="M10 6h10M10 12h10M10 18h10M7 9l-3 3 3 3" />
  </I>
);
export const ListBullet = (p: P) => (
  <I {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" />
    <circle cx="4.5" cy="12" r="1" />
    <circle cx="4.5" cy="18" r="1" />
  </I>
);
export const ListOrdered = (p: P) => (
  <I {...p}>
    <path d="M10 6h10M10 12h10M10 18h10M4 4.5h1.5V9M4 9h3M4 14.5a1.5 1.5 0 112.6 1L4 19h3" />
  </I>
);
export const Quote = (p: P) => (
  <I {...p}>
    <path d="M6 7h4v5H6.5c0 2.5 1 3.5 3 4M14 7h4v5h-3.5c0 2.5 1 3.5 3 4" />
  </I>
);
export const Link = (p: P) => (
  <I {...p}>
    <path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66L11.5 6.8" />
    <path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1.5-1.46" />
  </I>
);
export const Unlink = (p: P) => (
  <I {...p}>
    <path d="M15.5 13.5l3.2-3.2a4 4 0 00-5.66-5.66L11.5 6.2M8.5 10.5l-3.2 3.2a4 4 0 005.66 5.66l1.54-1.56M4 4l16 16" />
  </I>
);
export const Photo = (p: P) => (
  <I {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M21 16l-5-5-8.5 8" />
  </I>
);
export const Hidden = (p: P) => (
  <I {...p}>
    <path d="M4 6h16M4 10h10" />
    <rect x="4" y="13.5" width="16" height="6.5" rx="1.5" strokeDasharray="2.5 2" />
  </I>
);
export const Smile = (p: P) => (
  <I {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 14.5a4.5 4.5 0 007 0" />
    <circle cx="9.3" cy="10" r=".8" />
    <circle cx="14.7" cy="10" r=".8" />
  </I>
);
export const Chevron = (p: P) => (
  <I {...p}>
    <path d="M7 10l5 5 5-5" />
  </I>
);
export const Close = (p: P) => (
  <I {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </I>
);
export const Check = (p: P) => (
  <I {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </I>
);
export const Plus = (p: P) => (
  <I {...p}>
    <path d="M12 5v14M5 12h14" />
  </I>
);
export const Gear = (p: P) => (
  <I {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </I>
);
export const Doc = (p: P) => (
  <I {...p}>
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </I>
);
export const Trash = (p: P) => (
  <I {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
  </I>
);
export const Upload = (p: P) => (
  <I {...p}>
    <path d="M12 16V4M7 9l5-5 5 5M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </I>
);
export const Clock = (p: P) => (
  <I {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </I>
);
export const Arrow = (p: P) => (
  <I {...p}>
    <path d="M15 6l-6 6 6 6" />
  </I>
);

/** Логотип старого редактора (svg_fav) — ссылка «на главную»; квадраты проявляются по очереди. */
const LOGO_RECTS: [number, number, number, number, string][] = [
  [20, 7, 27, 27, '#FFBA4A'],
  [47, 7, 25, 27, '#14A70D'],
  [20, 34, 27, 25, '#14A70D'],
  [72, 7, 27, 27, '#17B80F'],
  [20, 59, 27, 27, '#17B80F'],
  [72, 34, 27, 25, '#18C610'],
  [47, 59, 25, 27, '#18C610'],
  [20, 86, 27, 27, '#18C610'],
  [72, 59, 27, 27, '#18D110'],
  [72, 86, 27, 27, '#1BDB13'],
];
export const Logo = (p: P) => (
  <svg className={p.className} viewBox="0 0 120 120" fill="none" aria-hidden="true">
    {LOGO_RECTS.map(([x, y, w, h, fill], i) => (
      <rect key={i} x={x} y={y} width={w} height={h} fill={fill} style={{ animationDelay: `${i * 60}ms` }} />
    ))}
  </svg>
);
