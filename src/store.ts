import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { api } from './api';
import { parseDate } from './date';
import type { EditorPost, PostType, Site } from './types';

/**
 * Форма публикации (всё, кроме текста: текст живёт в редакторе Tiptap и берётся при сохранении).
 * dirty — есть несохранённые изменения: предупреждение при уходе со страницы.
 */
export interface FormState {
  id: number | null;
  status: EditorPost['status'] | null;
  url: string | null;
  postType: PostType;
  reviewOf: number | null;
  title: string;
  preview: string;
  ear: string;
  site: Site;
  /** 'ГГГГ-ММ-ДДTЧЧ:ММ' — отложенная публикация; null — сразу */
  delay: string | null;
  categories: number[];
  genres: string[];
  galleryType: string | null;
  dirty: boolean;
  /** изменения в тексте — счётчик, чтобы не держать HTML в хранилище */
  contentRev: number;
}

const initial: FormState = {
  id: null,
  status: null,
  url: null,
  postType: 'post',
  reviewOf: null,
  title: '',
  preview: '',
  ear: '',
  site: 'AL',
  delay: null,
  categories: [],
  genres: [],
  galleryType: null,
  dirty: false,
  contentRev: 0,
};

const form = createSlice({
  name: 'form',
  initialState: initial,
  reducers: {
    reset: (_s, a: PayloadAction<Partial<FormState>>) => ({ ...initial, ...a.payload }),
    loaded: (s, a: PayloadAction<EditorPost>) => {
      const p = a.payload;
      Object.assign(s, {
        id: p.id,
        status: p.status,
        url: p.url,
        postType: p.post_type,
        reviewOf: p.review_of?.id ?? null,
        title: p.title,
        preview: p.preview,
        ear: p.ear,
        site: p.site,
        // отложенная — только дата в будущем; прошедшая — просто дата публикации
        delay: p.date && parseDate(p.date).getTime() > Date.now() ? p.date.slice(0, 16) : null,
        categories: p.categories,
        genres: p.genres,
        galleryType: p.gallery_type || null,
        dirty: false,
      });
    },
    saved: (s, a: PayloadAction<EditorPost>) => {
      s.id = a.payload.id;
      s.status = a.payload.status;
      s.url = a.payload.url;
      s.dirty = false;
    },
    /** поля формы (заголовок, превью, сайт, дата…) */
    patch: (s, a: PayloadAction<Partial<Omit<FormState, 'dirty' | 'contentRev'>>>) => {
      Object.assign(s, a.payload);
      s.dirty = true;
    },
    contentChanged: (s) => {
      s.contentRev += 1;
      s.dirty = true;
    },
    toggleCategory: (s, a: PayloadAction<{ id: number; multiple: boolean }>) => {
      const { id, multiple } = a.payload;
      if (!multiple) s.categories = [id];
      else s.categories = s.categories.includes(id) ? s.categories.filter((c) => c !== id) : [...s.categories, id];
      s.dirty = true;
    },
    toggleGenre: (s, a: PayloadAction<{ genre: string; max: number }>) => {
      const { genre, max } = a.payload;
      if (s.genres.includes(genre)) s.genres = s.genres.filter((g) => g !== genre);
      else if (s.genres.length < max) s.genres = [...s.genres, genre];
      s.dirty = true;
    },
  },
});

export const formActions = form.actions;

export const store = configureStore({
  reducer: { form: form.reducer, [api.reducerPath]: api.reducer },
  middleware: (gdm) => gdm().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
