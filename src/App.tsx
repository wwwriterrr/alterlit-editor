import { useEffect, useMemo } from 'react';
import { parseRoute } from './route';
import { errorText, useConfigQuery, usePostQuery } from './api';
import { useAppDispatch } from './hooks';
import { formActions } from './store';
import EditorScreen from './EditorScreen';
import { DraftsList } from './dialogs/DraftsDialog';
import { Logo } from './icons';
import type { EditorConfig } from './types';

/** Адрес → что открыть; конфиг формы и (при правке) сама публикация; потом — редактор. */
export default function App() {
  const route = useMemo(() => parseRoute(), []);
  const id = route.kind === 'edit' ? route.id : null;
  const post = usePostQuery(id ?? 0, { skip: !id });
  const postType = route.kind === 'edit' ? post.data?.post_type : route.postType;
  const reviewOf = route.kind === 'edit' ? (post.data?.review_of?.id ?? null) : route.reviewOf;
  const config = useConfigQuery({ postType: postType ?? 'post', reviewOf, id }, { skip: !postType });
  const d = useAppDispatch();

  useEffect(() => {
    if (route.kind === 'edit' && post.data) d(formActions.loaded(post.data));
  }, [route.kind, post.data, d]);
  useEffect(() => {
    if (route.kind === 'new' && config.data) {
      d(
        formActions.reset({
          postType: route.postType,
          reviewOf: route.reviewOf,
          site: config.data.mode === 'altcg' ? 'ALT' : 'AL',
          categories: config.data.blog_category ? [config.data.blog_category] : [],
        }),
      );
    }
  }, [route, config.data, d]);

  const error = post.error ?? config.error;
  if (error) {
    return (
      <Notice
        title={(error as { status?: number }).status === 404 ? 'Публикация не найдена' : 'Не удалось открыть редактор'}
        text={errorText(error)}
        action={{ label: 'На главную', url: '/' }}
      />
    );
  }
  if (!config.data || (id && !post.data)) return <Loading />;
  const b = config.data.blocked;
  // лимит текстов в сутки: черновик писать можно (/post/new/?draft=1), отправить — завтра
  if (b?.code === 'day_limit' && !(route.kind === 'new' && route.draftOnly)) return <DayLimit config={config.data} />;
  if (b && b.code !== 'day_limit') {
    return <Notice title={b.title} text={b.message} action={b.action ?? { label: 'На главную', url: '/' }} />;
  }
  return <EditorScreen config={config.data} initialContent={post.data?.content ?? ''} />;
}

/** Каркас редактора, пока грузится форма — страница не прыгает. */
function Loading() {
  return (
    <div className="pe-app" aria-busy="true">
      <header className="pe-top">
        <a className="pe-logo" href="/" aria-label="На главную">
          <Logo />
        </a>
      </header>
      <div className="pe-layout">
        <main className="pe-main">
          <div className="pe-paper">
            <div className="pe-skel pe-skel-title" />
            <div className="pe-skel pe-skel-line" />
            <div className="pe-skel pe-skel-line" />
            <div className="pe-skel pe-skel-line pe-skel-short" />
          </div>
        </main>
      </div>
    </div>
  );
}

/** Лимит на сегодня исчерпан: открыть черновик или начать новый — только черновиком. */
function DayLimit({ config }: { config: EditorConfig }) {
  const b = config.blocked!;
  const full = config.drafts >= config.limits.drafts;
  const url = new URL(window.location.href);
  url.searchParams.set('draft', '1');
  return (
    <div className="pe-app">
      <header className="pe-top">
        <a className="pe-logo" href="/" aria-label="На главную">
          <Logo />
        </a>
      </header>
      <div className="pe-blocked pe-blocked-limit">
        <h1>{b.title}</h1>
        <p>{b.message}</p>
        {config.drafts > 0 ? (
          <section className="pe-blocked-drafts" aria-label="Мои черновики">
            <h2>Мои черновики</h2>
            <DraftsList />
          </section>
        ) : null}
        {full ? (
          <p className="pe-blocked-note">
            Можно хранить не больше {config.limits.drafts} черновиков — допишите или удалите один из них.
          </p>
        ) : null}
        <div className="pe-blocked-actions">
          <a className="pe-btn pe-btn-ghost" href="/">
            На главную
          </a>
          {full ? null : (
            <a className="pe-btn pe-btn-primary" href={url.pathname + url.search}>
              Создать черновик
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Notice({ title, text, action }: { title: string; text: string; action: { label: string; url: string } }) {
  return (
    <div className="pe-app">
      <header className="pe-top">
        <a className="pe-logo" href="/" aria-label="На главную">
          <Logo />
        </a>
      </header>
      <div className="pe-blocked">
        <h1>{title}</h1>
        <p>{text}</p>
        <a className="pe-btn pe-btn-primary" href={action.url}>
          {action.label}
        </a>
      </div>
    </div>
  );
}
