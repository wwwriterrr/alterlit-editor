import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { Draft, EditorConfig, EditorPost, PostInput, PostType, SaveResult } from './types';

let csrfFallback = '';
/** Токен CSRF, если куки csrftoken нет: <div id="alterlit-editor" data-csrf="{{ csrf_token }}"> */
export function setCsrfFallback(token: string) {
  csrfFallback = token;
}
export function csrfToken() {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : csrfFallback;
}

/** Текст ошибки для человека: detail DRF, ошибки полей или общий. */
export function errorText(err: unknown): string {
  const e = err as { status?: unknown; data?: unknown; error?: string };
  const data = e?.data as { detail?: unknown; errors?: Record<string, string> } | undefined;
  if (data && typeof data.detail === 'string') return data.detail;
  if (data?.errors) return Object.values(data.errors).join('\n');
  if (e?.status === 'FETCH_ERROR') return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
  if (e?.status === 401 || e?.status === 403) return 'Сессия истекла — войдите на сайт ещё раз.';
  return 'Возникла ошибка на сервере. Попробуйте позже.';
}

/** Ошибки по полям из ответа 400: {"errors": {"title": "…", "categories": "…"}} */
export function fieldErrors(err: unknown): Record<string, string> {
  const data = (err as { data?: { errors?: Record<string, string> } })?.data;
  return data?.errors ?? {};
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/v1/editor/',
    credentials: 'same-origin',
    prepareHeaders: (h) => {
      h.set('X-CSRFToken', csrfToken());
      return h;
    },
  }),
  tagTypes: ['Drafts'],
  endpoints: (b) => ({
    config: b.query<EditorConfig, { postType: PostType; reviewOf: number | null; id: number | null }>({
      query: ({ postType, reviewOf, id }) => ({
        url: 'config/',
        params: { post_type: postType, ...(reviewOf ? { review_of: reviewOf } : {}), ...(id ? { id } : {}) },
      }),
    }),
    post: b.query<EditorPost, number>({ query: (id) => `posts/${id}/` }),
    remove: b.mutation<{ drafts: number }, number>({
      query: (id) => ({ url: `posts/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Drafts'],
    }),
    drafts: b.query<{ drafts: Draft[] }, void>({ query: () => 'drafts/', providesTags: ['Drafts'] }),
  }),
});

export const {
  useConfigQuery,
  usePostQuery,
  useRemoveMutation,
  useDraftsQuery,
} = api;

/**
 * Сохранить публикацию вместе с новыми фото — один запрос multipart:
 *   data — JSON публикации (PostInput), image_<ключ> — файлы новых фото (<img data-upload="ключ"> в тексте).
 * POST /api/v1/editor/posts/ — создать, PUT /api/v1/editor/posts/<id>/ — сохранить.
 * XMLHttpRequest ради полосы прогресса отправки (fetch её не отдаёт).
 */
export class SaveError extends Error {
  errors: Record<string, string>;
  status: number;
  constructor(message: string, errors: Record<string, string>, status: number) {
    super(message);
    this.errors = errors;
    this.status = status;
  }
}

export function savePost(id: number | null, body: PostInput, files: [string, Blob, string][], onProgress: (share: number) => void) {
  return new Promise<SaveResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(id ? 'PUT' : 'POST', `/api/v1/editor/posts/${id ? `${id}/` : ''}`);
    xhr.setRequestHeader('X-CSRFToken', csrfToken());
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const data = xhr.response as (SaveResult & { detail?: string; errors?: Record<string, string> }) | null;
      if (xhr.status >= 200 && xhr.status < 300 && data) resolve(data);
      else reject(new SaveError(errorText({ status: xhr.status, data }), data?.errors ?? {}, xhr.status));
    };
    xhr.onerror = () => reject(new SaveError(errorText({ status: 'FETCH_ERROR' }), {}, 0));
    const form = new FormData();
    form.append('data', JSON.stringify(body));
    for (const [key, blob, name] of files) form.append(`image_${key}`, blob, name);
    xhr.send(form);
  });
}
