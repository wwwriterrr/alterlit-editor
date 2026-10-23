import { useEffect, useMemo } from 'react';
import { parseRoute } from './route';
import { errorText, useConfigQuery, usePostQuery } from './api';
import { useAppDispatch } from './hooks';
import { formActions } from './store';
import EditorScreen from './EditorScreen';
import { Logo } from './icons';

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
  if (config.data.blocked) {
    const b = config.data.blocked;
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
