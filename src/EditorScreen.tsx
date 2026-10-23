import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { editorExtensions, fillEmptySummaries, type GalleryAttrs, type GalleryImageAttrs } from './editor/extensions';
import { cleanPastedHtml } from './editor/paste';
import { setGalleryOpener } from './editor/galleryBus';
import Toolbar from './editor/Toolbar';
import Settings, { categoriesForSite } from './Settings';
import UserMenu from './UserMenu';
import GalleryDialog from './dialogs/GalleryDialog';
import LinkDialog, { type LinkValue } from './dialogs/LinkDialog';
import ConfirmDialog from './dialogs/ConfirmDialog';
import DraftsDialog from './dialogs/DraftsDialog';
import Dialog from './dialogs/Dialog';
import { errorText, savePost, SaveError, useRemoveMutation } from './api';
import { dropUploads, MAX_IMAGES, pendingFiles } from './uploads';
import { useAppDispatch, useAppSelector } from './hooks';
import { formActions, store } from './store';
import { replaceWithEdit } from './route';
import { dropSnapshot, loadSnapshot, recoveryKey, saveSnapshot, type Snapshot } from './recovery';
import { formatDate, formatDelay, num, pluralize } from './date';
import type { EditorConfig, PostInput, SaveResult } from './types';
import * as Ic from './icons';

type Pending =
  | { kind: 'publish' }
  | { kind: 'toDraft' }
  | { kind: 'delete' }
  | { kind: 'leave'; href: string }
  | null;

const TITLES = { post: 'публикации', review: 'рецензии', blog: 'блога' } as const;

export default function EditorScreen({ config, initialContent }: { config: EditorConfig; initialContent: string }) {
  const d = useAppDispatch();
  const f = useAppSelector((s) => s.form);
  const editorRole = config.is_editor;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending>(null);
  const [gallery, setGallery] = useState<{ initial: GalleryImageAttrs[]; limit: number; resolve: (v: GalleryImageAttrs[] | null) => void } | null>(null);
  const [link, setLink] = useState<{ initial: LinkValue; askText: boolean; editing: boolean } | null>(null);
  const [drafts, setDrafts] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [done, setDone] = useState<SaveResult | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [draftsCount, setDraftsCount] = useState(config.drafts);
  // отправлено сегодня (не редакция): после отправки на модерацию — +1, без перезагрузки
  const [dayUsed, setDayUsed] = useState(config.day?.used ?? 0);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [remove, removeState] = useRemoveMutation();

  // ── предел длины: свой у некоторых рубрик (длинные тексты, конкурс романов) ──
  const contentMax = useMemo(() => {
    const own = config.categories.filter((c) => f.categories.includes(c.id) && c.content_max).map((c) => c.content_max as number);
    return own.length ? Math.max(...own) : config.limits.content;
  }, [config, f.categories]);
  const placeholderRef = useRef('');
  placeholderRef.current = `Добавьте текст (не более ${num(contentMax)} знаков)`;

  const editor = useEditor({
    extensions: editorExtensions({ placeholder: () => placeholderRef.current, isEditor: editorRole }),
    content: initialContent,
    editorProps: {
      attributes: { class: 'pe-content post-content', spellcheck: 'true', 'aria-label': 'Текст публикации' },
      transformPastedHTML: cleanPastedHtml,
      handleKeyDown: (_v, e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          openLink();
          return true;
        }
        return false;
      },
    },
    onUpdate: () => d(formActions.contentChanged()),
    immediatelyRender: true,
  });

  const stats = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return { chars: 0, words: 0, images: 0, galleries: 0 };
      let images = 0;
      let galleries = 0;
      e.state.doc.descendants((n) => {
        if (n.type.name === 'gallery') {
          galleries += 1;
          images += (n.attrs as GalleryAttrs).images.length;
        }
      });
      return { chars: e.storage.characterCount.characters(), words: e.storage.characterCount.words(), images, galleries };
    },
  }) ?? { chars: 0, words: 0, images: 0, galleries: 0 };
  const tooLong = stats.chars > contentMax;

  // ── окно фото — по запросу из панели и из блока галереи ──
  useEffect(() => {
    setGalleryOpener(
      (initial) =>
        new Promise((resolve) => {
          // сколько можно в этой галерее: 20 на публикацию минус фото в остальном тексте
          let total = 0;
          editor?.state.doc.descendants((n) => {
            if (n.type.name === 'gallery') total += (n.attrs as GalleryAttrs).images.length;
          });
          setGallery({ initial, resolve, limit: MAX_IMAGES - (total - initial.length) });
        }),
    );
    return () => setGalleryOpener(null);
  }, [editor]);

  // ── ссылка ──
  const openLink = useCallback(() => {
    if (!editor) return;
    const attrs = editor.getAttributes('link') as { href?: string; target?: string };
    const { empty } = editor.state.selection;
    const editing = Boolean(attrs.href);
    if (editing) editor.chain().extendMarkRange('link').run();
    setLink({
      initial: { href: attrs.href ?? '', text: '', newTab: editing ? attrs.target === '_blank' : true },
      askText: empty && !editing,
      editing,
    });
  }, [editor]);
  const applyLink = (v: LinkValue) => {
    if (!editor) return;
    const attrs = { href: v.href, target: v.newTab ? '_blank' : null };
    if (link?.askText) {
      editor.chain().focus().insertContent({ type: 'text', text: v.text, marks: [{ type: 'link', attrs }] }).insertContent(' ').run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink(attrs).run();
    }
    setLink(null);
  };

  // ── страховка: копия в браузере, пока есть несохранённое ──
  const rKey = recoveryKey(f.id, config.post_type, config.review_of?.id ?? null);
  const [recovery, setRecovery] = useState<Snapshot | null>(() => {
    const s = loadSnapshot(rKey);
    return s && (s.title !== f.title || s.content !== initialContent) ? s : null;
  });
  useEffect(() => {
    if (!f.dirty || !editor) return;
    const t = window.setTimeout(() => {
      const st = store.getState().form;
      saveSnapshot(rKey, {
        at: Date.now(),
        title: st.title,
        content: editor.getHTML(),
        form: {
          preview: st.preview,
          ear: st.ear,
          site: st.site,
          delay: st.delay,
          categories: st.categories,
          genres: st.genres,
          galleryType: st.galleryType,
        },
      });
    }, 1500);
    return () => window.clearTimeout(t);
  }, [f, editor, rKey]);
  const restore = () => {
    if (!recovery || !editor) return;
    editor.commands.setContent(recovery.content);
    d(formActions.patch({ title: recovery.title, ...recovery.form }));
    setRecovery(null);
  };

  // ── высота закреплённой шапки → --pe-top: от неё считаются панель инструментов и сайдбар ──
  const appRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const head = headRef.current;
    const app = appRef.current;
    if (!head || !app) return;
    const set = () => app.style.setProperty('--pe-top', `${head.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(head);
    return () => ro.disconnect();
  }, []);

  // ── уход со страницы ──
  const leaving = useRef(false);
  const go = (href: string) => {
    leaving.current = true;
    window.location.href = href;
  };
  useEffect(() => {
    if (!f.dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [f.dirty]);
  const leave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!f.dirty || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    setPending({ kind: 'leave', href: e.currentTarget.href });
  };

  // ── проверка перед отправкой ──
  const check = (draft: boolean) => {
    const e: Record<string, string> = {};
    const title = f.title.trim();
    if (!title) e.title = 'Придумайте заголовок';
    else if (title.length > config.limits.title[1]) e.title = `Заголовок длиннее ${config.limits.title[1]} знаков`;
    const text = editor?.state.doc.textContent.trim() ?? '';
    if (!text) e.content = stats.images ? 'Текст не может состоять только из фото' : 'Добавьте текст';
    else if (tooLong) e.content = `Текст длиннее ${num(contentMax)} знаков — сократите его`;
    else if (stats.images > MAX_IMAGES) e.content = `В публикации — не больше ${MAX_IMAGES} фото, сейчас ${stats.images}`;
    if (!draft && config.post_type === 'post') {
      const allowed = new Set(categoriesForSite(config.categories, f.site).map((c) => c.id));
      if (!f.categories.some((c) => allowed.has(c))) e.categories = 'Выберите рубрику';
      if (config.genres_category && f.categories.includes(config.genres_category) && !f.genres.length)
        e.genres = 'Выберите хотя бы один жанр';
    }
    const [pMin, pMax] = config.limits.preview;
    const pl = f.preview.trim().length;
    if (!draft && !editorRole && pl && (pl < pMin || pl > pMax)) e.preview = `Превью — от ${pMin} до ${pMax} знаков`;
    return e;
  };
  // исправили поле — пометка ошибки уходит сразу (новые не появляются до следующей отправки)
  const lastDraft = useRef(false);
  useEffect(() => {
    if (!Object.keys(errors).length) return;
    const now = check(lastDraft.current);
    const kept = Object.fromEntries(Object.entries(errors).filter(([k]) => now[k]));
    if (Object.keys(kept).length !== Object.keys(errors).length) setErrors(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, stats.chars, stats.images]);
  const validate = (draft: boolean) => {
    lastDraft.current = draft;
    const e = check(draft);
    setErrors(e);
    const first = Object.keys(e)[0];
    if (!first) setToast(null);
    if (first) {
      setToast({ text: Object.values(e)[0], error: true });
      if (first === 'title') document.getElementById('pe-title')?.focus();
      else if (first === 'content') editor?.commands.focus('end');
      else if (window.matchMedia('(max-width: 1024px)').matches) setSheet(true);
      else document.getElementById(`pe-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return !first;
  };

  const body = (draft: boolean): PostInput => {
    const allowed = new Set(categoriesForSite(config.categories, f.site).map((c) => c.id));
    return {
      post_type: config.post_type,
      review_of: config.review_of?.id ?? null,
      title: f.title.trim(),
      content: editor?.isEmpty ? '' : fillEmptySummaries(editor?.getHTML() ?? ''),
      preview: f.preview.trim(),
      ear: editorRole ? f.ear.trim() : '',
      site: editorRole ? f.site : null,
      delay: config.delay ? f.delay : null,
      categories: config.blog_category ? [config.blog_category] : f.categories.filter((c) => allowed.has(c)),
      genres: config.genres_category && f.categories.includes(config.genres_category) ? f.genres : [],
      gallery_type: stats.galleries ? (f.galleryType ?? config.gallery_types[0]?.value ?? null) : null,
      draft,
    };
  };

  /** ключи новых (ещё не отправленных) фото в тексте */
  const uploadKeys = () => {
    const keys: string[] = [];
    editor?.state.doc.descendants((n) => {
      if (n.type.name === 'gallery') for (const i of (n.attrs as GalleryAttrs).images) if (i.upload) keys.push(i.upload);
    });
    return keys;
  };

  /** сервер создал картинки — в тексте у новых фото теперь id и адреса (без «изменений» для формы) */
  const applyUploaded = (map: SaveResult['uploaded']) => {
    if (!editor || !map || !Object.keys(map).length) return;
    const { tr } = editor.state;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name !== 'gallery') return;
      const a = n.attrs as GalleryAttrs;
      if (!a.images.some((i) => i.upload && map[i.upload])) return;
      const images = a.images.map((i) => {
        const up = i.upload ? map[i.upload] : null;
        return up ? { id: up.id, upload: null, src: up.src, thumb: up.thumb, preload: up.preload } : i;
      });
      tr.setNodeMarkup(pos, undefined, { ...a, images });
    });
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  };

  const save = async (draft: boolean) => {
    if (!validate(draft)) return false;
    const keys = uploadKeys();
    setSaving(true);
    setProgress(keys.length ? 0 : null);
    try {
      const res = await savePost(f.id, body(draft), pendingFiles(keys), (p) => setProgress(p));
      const isNew = !f.id;
      // новый текст или черновик ушёл на модерацию — минус один из лимита на сегодня
      if (!draft && (isNew || f.status === 'draft') && res.post.status === 'moderate') setDayUsed((n) => n + 1);
      applyUploaded(res.uploaded);
      dropUploads(Object.keys(res.uploaded ?? {}));
      d(formActions.saved(res.post));
      setDraftsCount(res.drafts);
      setSavedAt(Date.now());
      dropSnapshot(rKey);
      if (isNew) {
        dropSnapshot(recoveryKey(res.post.id, config.post_type, null));
        replaceWithEdit(res.post.id);
      }
      if (draft) setToast({ text: res.message || 'Черновик сохранён' });
      else setDone(res);
      return true;
    } catch (err) {
      // текст и выбранные фото остаются в редакторе — можно нажать ещё раз
      const fe = err instanceof SaveError ? err.errors : {};
      if (Object.keys(fe).length) setErrors(fe);
      setToast({ text: err instanceof Error ? err.message : errorText(err), error: true });
      return false;
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  // ── кнопки ──
  const isDraftOrNew = !f.id || f.status === 'draft';
  const primary = isDraftOrNew ? (editorRole ? (f.delay ? 'Запланировать' : 'Опубликовать') : 'На модерацию') : 'Сохранить';
  const confirmText = (() => {
    const when = f.delay && config.delay ? ` Публикация выйдет ${formatDelay(f.delay)}.` : '';
    if (f.id && f.status === 'draft')
      return (editorRole ? 'Опубликовать черновик?' : 'Отправить черновик на модерацию? Модератор проверит текст и сообщит о решении в уведомлениях.') + when;
    if (f.id)
      return editorRole
        ? 'Сохранить изменения в публикации?' + when
        : 'Отправить текст с изменениями на модерацию? До проверки публикация будет скрыта из ленты.';
    return editorRole
      ? 'Опубликовать?' + when
      : 'Отправить на модерацию? Модератор проверит текст и сообщит о решении в уведомлениях. Пока текст на модерации, его можно исправить.';
  })();

  const statusLabel = !f.id
    ? `Новая ${config.post_type === 'post' ? 'публикация' : config.post_type === 'review' ? 'рецензия' : 'запись в блог'}`
    : f.status === 'draft'
      ? 'Черновик'
      : f.status === 'moderate'
        ? 'На модерации'
        : f.status === 'profile'
          ? 'В профиле'
          : f.status === 'published'
            ? 'Опубликовано'
            : 'Правка';

  const settingsErrors = ['categories', 'genres', 'preview', 'ear', 'delay'].some((k) => errors[k]);

  return (
    <div className="pe-app" ref={appRef}>
      {/* закреплённая шапка: панель, полоса отправки фото, «нашёлся несохранённый текст» */}
      <div className="pe-head" ref={headRef}>
        <header className="pe-top">
          <a className="pe-logo" href="/" aria-label="На главную" onClick={leave}>
            <Ic.Logo />
          </a>
          <div className="pe-top-status">
            <b>{statusLabel}</b>
            <span className="pe-top-saved" aria-live="polite">
              {saving ? 'сохраняем…' : f.dirty ? 'есть несохранённые изменения' : savedAt ? `сохранено ${formatDate(new Date(savedAt).toISOString())}` : ''}
            </span>
          </div>
          <div className="pe-top-actions">
            <UserMenu user={config.user} day={config.day ? { ...config.day, used: dayUsed } : null} />
            {draftsCount > 0 ? (
              <button type="button" className="pe-btn pe-btn-ghost pe-hide-sm" onClick={() => setDrafts(true)}>
                Черновики <span className="pe-badge">{draftsCount}</span>
              </button>
            ) : null}
            {isDraftOrNew ? (
              <button type="button" className="pe-btn pe-btn-ghost pe-hide-xs" onClick={() => save(true)} disabled={saving}>
                Сохранить черновик
              </button>
            ) : null}
            <button
              type="button"
              className="pe-btn pe-btn-ghost pe-settings-btn"
              onClick={() => setSheet(true)}
              aria-label="Настройки публикации"
              data-error={settingsErrors || undefined}
            >
              <Ic.Gear />
            </button>
            <MoreMenu
              items={[
                ...(draftsCount > 0 ? [{ label: `Мои черновики (${draftsCount})`, onClick: () => setDrafts(true), cls: 'pe-show-sm' }] : []),
                ...(isDraftOrNew ? [{ label: 'Сохранить черновик', onClick: () => save(true), cls: 'pe-show-xs' }] : []),
                ...(!isDraftOrNew && f.status !== 'published' ? [{ label: 'Вернуть в черновики', onClick: () => setPending({ kind: 'toDraft' }) }] : []),
                ...(f.id && f.status === 'draft' ? [{ label: 'Удалить черновик', onClick: () => setPending({ kind: 'delete' }), danger: true }] : []),
                ...(f.url && f.status !== 'draft' ? [{ label: 'Открыть публикацию', href: f.url }] : []),
                { label: 'Новая публикация', href: '/post/new/' },
              ]}
            />
            <button type="button" className="pe-btn pe-btn-primary" onClick={() => validate(false) && setPending({ kind: 'publish' })} disabled={saving}>
              {saving ? <span className="pe-spinner" aria-hidden="true" /> : null}
              {primary}
            </button>
          </div>
        </header>
        {progress !== null ? (
          <div className="pe-upload" role="progressbar" aria-label="Отправка фото" aria-valuenow={Math.round(progress * 100)}>
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
            <span>{progress < 1 ? `Отправляем фото… ${Math.round(progress * 100)}%` : 'Сохраняем…'}</span>
          </div>
        ) : null}
        {recovery ? (
          <div className="pe-recovery" role="status">
            <span>
              Нашёлся несохранённый текст от {formatDate(new Date(recovery.at).toISOString())}
              {recovery.title ? ` — «${recovery.title}»` : ''}.
            </span>
            <button type="button" className="pe-btn pe-btn-primary pe-btn-sm" onClick={restore}>
              Восстановить
            </button>
            <button
              type="button"
              className="pe-btn pe-btn-ghost pe-btn-sm"
              onClick={() => {
                dropSnapshot(rKey);
                setRecovery(null);
              }}
            >
              Не нужно
            </button>
          </div>
        ) : null}
      </div>

      <div className="pe-layout">
        <main className="pe-main">
          {editor ? <Toolbar editor={editor} isEditor={editorRole} onLink={openLink} /> : null}
          <div className="pe-paper">
            <TitleField
              value={f.title}
              max={config.limits.title[1]}
              error={errors.title}
              placeholder={`Заголовок ${TITLES[config.post_type]}`}
              onChange={(title) => {
                d(formActions.patch({ title }));
                if (errors.title) setErrors(({ title: _t, ...rest }) => rest);
              }}
              onEnter={() => editor?.commands.focus('start')}
            />
            <div className="pe-editor" data-error={errors.content ? '' : undefined}>
              <EditorContent editor={editor} />
              {editor ? <LinkBubble editor={editor} onEdit={openLink} /> : null}
            </div>
            {errors.content ? <p className="pe-err pe-err-content">{errors.content}</p> : null}
          </div>
          <div className="pe-statusbar" data-bad={tooLong || undefined}>
            <span>
              {num(stats.chars)} / {num(contentMax)} знаков
            </span>
            <span className="pe-hide-xs">{pluralize(stats.words, ['слово', 'слова', 'слов'])}</span>
            {stats.images ? <span className="pe-hide-xs">{pluralize(stats.images, ['фото', 'фото', 'фото'])}</span> : null}
          </div>
        </main>

        <aside className="pe-aside" data-open={sheet || undefined} aria-label="Настройки публикации">
          <div className="pe-aside-head">
            <b>Настройки</b>
            <button type="button" className="pe-d-close" aria-label="Закрыть" onClick={() => setSheet(false)}>
              <Ic.Close />
            </button>
          </div>
          <Settings config={config} errors={errors} hasGallery={stats.galleries > 0} imagesCount={stats.images} />
        </aside>
        {sheet ? <div className="pe-scrim" onClick={() => setSheet(false)} aria-hidden="true" /> : null}
      </div>

      {gallery ? (
        <GalleryDialog
          initial={gallery.initial}
          limit={gallery.limit}
          onDone={(v) => {
            gallery.resolve(v);
            setGallery(null);
          }}
        />
      ) : null}
      {link ? (
        <LinkDialog
          initial={link.initial}
          askText={link.askText}
          onSubmit={applyLink}
          onRemove={
            link.editing
              ? () => {
                  editor?.chain().focus().extendMarkRange('link').unsetLink().run();
                  setLink(null);
                }
              : null
          }
          onClose={() => {
            setLink(null);
            editor?.commands.focus();
          }}
        />
      ) : null}
      {drafts ? <DraftsDialog current={f.id} onClose={() => setDrafts(false)} /> : null}

      {pending?.kind === 'publish' ? (
        <ConfirmDialog
          title={primary + '?'}
          text={confirmText}
          confirm={primary}
          busy={saving}
          onClose={() => setPending(null)}
          onConfirm={async () => {
            await save(false);
            setPending(null);
          }}
        />
      ) : null}
      {pending?.kind === 'toDraft' ? (
        <ConfirmDialog
          title="Вернуть в черновики?"
          text="Публикация пропадёт из ленты и профиля, пока вы снова её не отправите."
          confirm="В черновики"
          busy={saving}
          onClose={() => setPending(null)}
          onConfirm={async () => {
            await save(true);
            setPending(null);
          }}
        />
      ) : null}
      {pending?.kind === 'delete' ? (
        <ConfirmDialog
          title="Удалить черновик?"
          text="Черновик удалится насовсем, восстановить его будет нельзя."
          confirm="Удалить"
          danger
          busy={removeState.isLoading}
          onClose={() => setPending(null)}
          onConfirm={async () => {
            try {
              await remove(f.id as number).unwrap();
              dropSnapshot(rKey);
              go('/post/new/');
            } catch (err) {
              setPending(null);
              setToast({ text: errorText(err), error: true });
            }
          }}
        />
      ) : null}
      {pending?.kind === 'leave' ? (
        <ConfirmDialog
          title="Уйти из редактора?"
          text="Есть несохранённые изменения. Копия останется в этом браузере — её можно будет восстановить, вернувшись в редактор."
          confirm="Уйти"
          cancel="Остаться"
          danger
          onClose={() => setPending(null)}
          onConfirm={() => go(pending.href)}
        />
      ) : null}

      {done ? <DoneDialog result={done} config={config} onClose={() => setDone(null)} /> : null}
      {toast ? <Toast {...toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}

function TitleField({
  value,
  max,
  error,
  placeholder,
  onChange,
  onEnter,
}: {
  value: string;
  max: number;
  error?: string;
  placeholder: string;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // высота по тексту
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  const len = value.trim().length;
  return (
    <div className="pe-title" data-error={error ? '' : undefined}>
      <textarea
        id="pe-title"
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-label="Заголовок"
        aria-invalid={Boolean(error) || len > max || undefined}
        spellCheck
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter();
          }
        }}
      />
      <span className="pe-title-count" data-bad={len > max || undefined}>
        {len ? `${len} / ${max}` : ''}
      </span>
      {error ? <p className="pe-err">{error}</p> : null}
    </div>
  );
}

/** Курсор на ссылке — подсказка с адресом: открыть, изменить, убрать. */
function LinkBubble({ editor, onEdit }: { editor: Editor; onEdit: () => void }) {
  const href = useEditorState({ editor, selector: ({ editor: e }) => (e.isActive('link') ? (e.getAttributes('link').href as string) : '') });
  return (
    <BubbleMenu editor={editor} shouldShow={({ editor: e }) => e.isActive('link')} options={{ placement: 'bottom-start' }}>
      <div className="pe-bubble">
        <a href={href} target="_blank" rel="noreferrer" className="pe-bubble-url">
          {href}
        </a>
        <button type="button" onClick={onEdit}>
          Изменить
        </button>
        <button type="button" onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}>
          Убрать
        </button>
      </div>
    </BubbleMenu>
  );
}

function MoreMenu({ items }: { items: { label: string; onClick?: () => void; href?: string; danger?: boolean; cls?: string }[] }) {
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
  return (
    <div className="pe-popwrap" ref={ref}>
      <button type="button" className="pe-btn pe-btn-ghost pe-more" aria-label="Ещё" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open ? (
        <div className="pe-pop pe-menu" role="menu">
          {items.map((it) =>
            it.href ? (
              <a key={it.label} role="menuitem" href={it.href} className={it.cls}>
                {it.label}
              </a>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={`${it.cls ?? ''}${it.danger ? ' pe-menu-danger' : ''}`}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function DoneDialog({ result, config, onClose }: { result: SaveResult; config: EditorConfig; onClose: () => void }) {
  const p = result.post;
  const live = p.status === 'published' || p.status === 'profile';
  return (
    <Dialog title={live ? 'Готово!' : p.status === 'moderate' ? 'Отправлено на модерацию' : 'Сохранено'} onClose={onClose}>
      <div className="pe-done">
        <svg className="pe-done-check" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r="23" />
          <path d="M15 27l7 7 15-16" />
        </svg>
        <p>{result.message}</p>
        <div className="pe-done-actions">
          {live ? (
            <a className="pe-btn pe-btn-primary" href={p.url}>
              Открыть публикацию
            </a>
          ) : (
            <a className="pe-btn pe-btn-primary" href={`/profile/${config.user.username}/`}>
              Мои публикации
            </a>
          )}
          <a className="pe-btn pe-btn-ghost" href="/post/new/">
            Написать ещё
          </a>
          <a className="pe-btn pe-btn-ghost" href="/">
            На главную
          </a>
        </div>
      </div>
    </Dialog>
  );
}

function Toast({ text, error, onClose }: { text: string; error?: boolean; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, error ? 6000 : 3000);
    return () => window.clearTimeout(t);
  }, [text, error, onClose]);
  return (
    <div className="pe-toast" data-error={error || undefined} role={error ? 'alert' : 'status'}>
      {error ? null : <Ic.Check />}
      <span>{text}</span>
      <button type="button" aria-label="Закрыть" onClick={onClose}>
        <Ic.Close />
      </button>
    </div>
  );
}
