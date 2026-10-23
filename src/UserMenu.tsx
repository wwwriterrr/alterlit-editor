import { useEffect, useRef, useState } from 'react';
import type { EditorConfig } from './types';
import { pluralize } from './date';

const NO_AVATAR = '/assets/img/noavatar_3.png';

/**
 * Аватар в верхней панели: по клику — ссылка в профиль и сколько текстов ещё можно отправить
 * на модерацию сегодня (у редакции лимита нет — и строки нет).
 */
export default function UserMenu({ user, day }: { user: EditorConfig['user']; day: { limit: number | null; used: number } | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const profile = `/profile/${encodeURIComponent(user.username)}/`;
  const limit = day?.limit ?? null;
  const left = limit !== null ? Math.max(0, limit - (day?.used ?? 0)) : null;

  return (
    <div className="pe-popwrap" ref={ref}>
      <button
        type="button"
        className="pe-user-btn"
        aria-label={`${user.name}: профиль и лимиты`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <img src={user.avatar || NO_AVATAR} alt="" onError={(e) => (e.currentTarget.src = NO_AVATAR)} />
      </button>
      {open ? (
        <div className="pe-pop pe-user-pop" role="dialog" aria-label="Профиль">
          <a className="pe-user-head" href={profile}>
            <img src={user.avatar || NO_AVATAR} alt="" onError={(e) => (e.currentTarget.src = NO_AVATAR)} />
            <span>
              <b>{user.name}</b>
              <small>Мой профиль</small>
            </span>
          </a>
          {limit !== null && left !== null ? (
            <div className="pe-user-limit" data-empty={left === 0 || undefined}>
              <p>
                {left > 0 ? (
                  <>
                    Сегодня можно отправить ещё <b>{pluralize(left, ['текст', 'текста', 'текстов'])}</b> из {limit}
                  </>
                ) : (
                  <>На сегодня тексты закончились — {limit} из {limit}. Черновики сохранять можно.</>
                )}
              </p>
              <ol className="pe-user-steps" aria-hidden="true">
                {Array.from({ length: limit }, (_, i) => (
                  <li key={i} data-used={i < limit - left || undefined} />
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
