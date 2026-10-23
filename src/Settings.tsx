import { useId } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import { formActions } from './store';
import type { Category, EditorConfig, Site } from './types';
import { Check, Clock, Close } from './icons';
import { formatDelay, pluralize } from './date';

/** Рубрики, доступные на выбранном сайте (как category_al_str / category_alt_str старого шаблона). */
export function categoriesForSite(cats: Category[], site: Site) {
  if (site === 'ALL') return cats;
  return cats.filter((c) => c.sites.includes(site));
}

/**
 * Настройки публикации справа от текста (на телефоне — шторка): что показать — по типу
 * публикации и правам, как в старом редакторе.
 */
export default function Settings({
  config,
  errors,
  hasGallery,
  imagesCount,
}: {
  config: EditorConfig;
  errors: Record<string, string>;
  hasGallery: boolean;
  imagesCount: number;
}) {
  const f = useAppSelector((s) => s.form);
  const d = useAppDispatch();
  const { is_editor: editor, post_type: type, limits } = config;

  const cats = categoriesForSite(config.categories, f.site);
  const showGenres = type === 'post' && config.genres_category !== null && f.categories.includes(config.genres_category);

  return (
    <div className="pe-settings">
      {config.review_of ? (
        <section className="pe-card pe-card-review">
          <h3>Рецензия</h3>
          <p>
            Вы пишете рецензию на{' '}
            <a href={config.review_of.url} target="_blank" rel="noreferrer">
              «{config.review_of.title}»
            </a>
          </p>
        </section>
      ) : null}

      {type === 'post' ? (
        <section className="pe-card" data-error={errors.categories ? '' : undefined} id="pe-categories">
          <h3>Рубрика</h3>
          <p className="pe-hint">{editor ? 'Можно выбрать несколько' : 'Выберите одну'}</p>
          <ul className="pe-cats" role={editor ? 'group' : 'radiogroup'} aria-label="Рубрика">
            {cats.map((c) => {
              const on = f.categories.includes(c.id);
              return (
                <li key={c.id} data-child={c.parent_id ? '' : undefined}>
                  <label className="pe-choice">
                    <input
                      type={editor ? 'checkbox' : 'radio'}
                      name="pe-category"
                      checked={on}
                      onChange={() => d(formActions.toggleCategory({ id: c.id, multiple: editor }))}
                    />
                    <span className="pe-choice-mark" aria-hidden="true">
                      <Check />
                    </span>
                    <span>{c.title}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {errors.categories ? <p className="pe-err">{errors.categories}</p> : null}
        </section>
      ) : null}

      {showGenres ? (
        <section className="pe-card" data-error={errors.genres ? '' : undefined} id="pe-genres">
          <h3>Жанры</h3>
          <p className="pe-hint">
            Для прозы — обязательно, не больше {pluralize(limits.genres, ['жанра', 'жанров', 'жанров'])}
          </p>
          <ul className="pe-chips">
            {config.genres.map((g) => {
              const on = f.genres.includes(g);
              const full = !on && f.genres.length >= limits.genres;
              return (
                <li key={g}>
                  <button
                    type="button"
                    className="pe-chip-toggle"
                    aria-pressed={on}
                    disabled={full}
                    onClick={() => d(formActions.toggleGenre({ genre: g, max: limits.genres }))}
                  >
                    {g}
                  </button>
                </li>
              );
            })}
          </ul>
          {errors.genres ? <p className="pe-err">{errors.genres}</p> : null}
        </section>
      ) : null}

      <TextBlock
        title="Превью"
        hint={`Анонс или отрывок для карточки в ленте, от ${limits.preview[0]} до ${limits.preview[1]} знаков. Необязательно — без него возьмём начало текста.`}
        value={f.preview}
        range={limits.preview}
        error={errors.preview}
        placeholder="Текст анонса"
        onChange={(v) => d(formActions.patch({ preview: v }))}
      />

      {editor ? (
        <TextBlock
          title="«Ухо»"
          hint={`Отрывок для случайных цитат на главной, от ${limits.ear[0]} до ${limits.ear[1]} знаков. Необязательно.`}
          value={f.ear}
          range={limits.ear}
          error={errors.ear}
          placeholder="…"
          onChange={(v) => d(formActions.patch({ ear: v }))}
        />
      ) : null}

      {editor ? <SiteBlock site={f.site} onChange={(site) => d(formActions.patch({ site }))} /> : null}

      {config.delay ? <DelayBlock config={config.delay} value={f.delay} error={errors.delay} /> : null}

      {editor && type === 'post' && hasGallery && config.gallery_types.length ? (
        <section className="pe-card">
          <h3>Миниатюра</h3>
          <p className="pe-hint">Как фото из текста покажутся в карточке публикации в ленте</p>
          <ul className="pe-gtypes" role="radiogroup" aria-label="Миниатюра">
            {config.gallery_types
              // одна картинка — форматы для нескольких не нужны (как в старом редакторе)
              .filter((_, i) => imagesCount > 1 || i < 2)
              .map((g) => (
                <li key={g.value}>
                  <label className="pe-choice">
                    <input
                      type="radio"
                      name="pe-gtype"
                      checked={(f.galleryType ?? config.gallery_types[0].value) === g.value}
                      onChange={() => d(formActions.patch({ galleryType: g.value }))}
                    />
                    <span className="pe-choice-mark pe-choice-radio" aria-hidden="true" />
                    <span>{g.title}</span>
                  </label>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function TextBlock({
  title,
  hint,
  value,
  range,
  error,
  placeholder,
  onChange,
}: {
  title: string;
  hint: string;
  value: string;
  range: [number, number];
  error?: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const len = value.trim().length;
  const bad = len > 0 && (len < range[0] || len > range[1]);
  return (
    <section className="pe-card" data-error={error ? '' : undefined}>
      <h3>
        <label htmlFor={id}>{title}</label>
      </h3>
      <p className="pe-hint">{hint}</p>
      <textarea
        id={id}
        className="pe-input pe-textarea"
        rows={4}
        value={value}
        placeholder={placeholder}
        spellCheck
        aria-invalid={bad || Boolean(error) || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="pe-counter" data-bad={bad || undefined} aria-live="polite">
        {len ? (len < range[0] ? `ещё ${range[0] - len} · ` : '') + `${len} / ${range[1]}` : ''}
      </div>
      {error ? <p className="pe-err">{error}</p> : null}
    </section>
  );
}

function SiteBlock({ site, onChange }: { site: Site; onChange: (s: Site) => void }) {
  const al = site === 'AL' || site === 'ALL';
  const alt = site === 'ALT' || site === 'ALL';
  // хотя бы один сайт выбран всегда
  const set = (nextAl: boolean, nextAlt: boolean) => {
    if (!nextAl && !nextAlt) return;
    onChange(nextAl && nextAlt ? 'ALL' : nextAl ? 'AL' : 'ALT');
  };
  return (
    <section className="pe-card">
      <h3>Сайт</h3>
      <p className="pe-hint">Где показать публикацию. Можно на обоих: нарушит правила одного сайта — там её не будет.</p>
      <div className="pe-sites">
        <button type="button" className="pe-site pe-site-al" aria-pressed={al} onClick={() => set(!al, alt)}>
          Альтерлит<sup>TM</sup>
        </button>
        <button type="button" className="pe-site pe-site-alt" aria-pressed={alt} onClick={() => set(al, !alt)}>
          AltCG<sup>TM</sup>
        </button>
      </div>
    </section>
  );
}

/** Время на выбор — как в старом редакторе: с 08:00 до 20:00 с шагом 30 минут. */
function times(from: string, to: string, step: number) {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const out: string[] = [];
  for (let t = m(from); t <= m(to); t += step) out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  return out;
}

function DelayBlock({ config, value, error }: { config: { from: string; to: string; step: number }; value: string | null; error?: string }) {
  const d = useAppDispatch();
  const id = useId();
  const slots = times(config.from, config.to, config.step);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const date = value?.slice(0, 10) ?? '';
  const time = value?.slice(11, 16) ?? '';
  const set = (nd: string, nt: string) => d(formActions.patch({ delay: nd ? `${nd}T${nt || slots[0]}` : null }));

  return (
    <section className="pe-card" data-error={error ? '' : undefined}>
      <h3>Дата публикации</h3>
      {value ? (
        <div className="pe-delay-now">
          <Clock />
          <span>{formatDelay(value)}</span>
          <button type="button" aria-label="Публиковать сразу" title="Публиковать сразу" onClick={() => set('', '')}>
            <Close />
          </button>
        </div>
      ) : (
        <p className="pe-hint">Сейчас — сразу после отправки. Можно назначить другое время.</p>
      )}
      <div className="pe-delay">
        <label className="pe-field" htmlFor={`${id}-d`}>
          <span className="pe-label">День</span>
          <input id={`${id}-d`} className="pe-input" type="date" min={todayStr} value={date} onChange={(e) => set(e.target.value, time)} />
        </label>
        <label className="pe-field" htmlFor={`${id}-t`}>
          <span className="pe-label">Время</span>
          <select id={`${id}-t`} className="pe-input" value={time} disabled={!date} onChange={(e) => set(date, e.target.value)}>
            {slots.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? <p className="pe-err">{error}</p> : null}
    </section>
  );
}
