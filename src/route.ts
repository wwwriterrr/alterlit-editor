import type { PostType } from './types';

/**
 * Что открыть — по адресу, как у старого редактора:
 *   /post/new/                                — новая публикация
 *   /post/new/?post_type=review&review_of=<id> — рецензия
 *   /post/new/?post_type=blog                  — блог
 *   /post/edit/?id=<id>                        — правка (и черновика)
 */
export type Route = { kind: 'new'; postType: PostType; reviewOf: number | null } | { kind: 'edit'; id: number };

export function parseRoute(loc: Location | URL = window.location): Route {
  const q = new URLSearchParams(loc.search);
  const id = Number(q.get('id'));
  if (/\/edit\/?$/.test(loc.pathname) && id > 0) return { kind: 'edit', id };
  const t = q.get('post_type');
  const postType: PostType = t === 'review' || t === 'blog' ? t : 'post';
  const reviewOf = Number(q.get('review_of')) || null;
  return { kind: 'new', postType, reviewOf: postType === 'review' ? reviewOf : null };
}

/** После первого сохранения новой публикации — адрес правки: «Обновить» не создаст копию. */
export function replaceWithEdit(id: number) {
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/\/new\/?$/, '/edit/');
  url.search = `?id=${id}`;
  window.history.replaceState(window.history.state, '', url);
}
