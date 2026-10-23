/** Типы публикаций, которые создаёт редактор (Creative Market и истории — не здесь). */
export type PostType = 'post' | 'review' | 'blog';
export type Status = 'draft' | 'moderate' | 'published' | 'profile' | 'rejected' | 'hidden';
export type Site = 'AL' | 'ALT' | 'ALL';

export interface Category {
  id: number;
  title: string;
  parent_id: number | null;
  /** на каких сайтах рубрика есть: AL, ALT или оба */
  sites: ('AL' | 'ALT')[];
  /** свой предел длины текста (длинные тексты, конкурс романов) */
  content_max: number | null;
}

export interface GalleryType {
  value: string;
  title: string;
}

/** Почему писать сейчас нельзя: не активирован, нет псевдонима, лимит в сутки… */
export interface Blocked {
  code: string;
  title: string;
  message: string;
  action: { label: string; url: string } | null;
}

/** GET /api/v1/editor/config/ — всё, что нужно форме. */
export interface EditorConfig {
  user: { id: number; name: string; avatar: string | null; username: string };
  /** blog.add_post — публикует без модерации, видит «ухо», сайт, дату, миниатюру, все рубрики */
  is_editor: boolean;
  post_type: PostType;
  blocked: Blocked | null;
  limits: {
    title: [number, number];
    preview: [number, number];
    ear: [number, number];
    content: number;
    genres: number;
    drafts: number;
  };
  categories: Category[];
  /** для рубрики «Проза» жанры обязательны */
  genres: string[];
  genres_category: number | null;
  gallery_types: GalleryType[];
  /** блог — одна рубрика без выбора */
  blog_category: number | null;
  review_of: { id: number; title: string; url: string } | null;
  /** отложенная публикация: часы и шаг, как в старом редакторе */
  delay: { from: string; to: string; step: number } | null;
  drafts: number;
  /** тексты в сутки (не редакции): лимит и сколько уже отправлено; у редакции — null */
  day: { limit: number | null; used: number } | null;
  mode: 'alterlit' | 'altcg';
}

export interface EditorPost {
  id: number;
  url: string;
  post_type: PostType;
  status: Status;
  title: string;
  content: string;
  preview: string;
  ear: string;
  site: Site;
  /** дата публикации, ISO без пояса (время сервера) */
  date: string;
  categories: number[];
  genres: string[];
  gallery_type: string;
  review_of: { id: number; title: string; url: string } | null;
}

/** То, что уходит на сервер при сохранении. */
export interface PostInput {
  post_type: PostType;
  review_of: number | null;
  title: string;
  content: string;
  preview: string;
  ear: string;
  site: Site | null;
  /** 'ГГГГ-ММ-ДДTЧЧ:ММ' или null — сейчас */
  delay: string | null;
  categories: number[];
  genres: string[];
  gallery_type: string | null;
  /** true — черновик, false — на модерацию / опубликовать / сохранить */
  draft: boolean;
}

export interface SaveResult {
  post: EditorPost;
  message: string;
  drafts: number;
  /** новые фото: ключ из текста → картинка на сервере */
  uploaded: Record<string, { id: number; src: string; thumb: string; preload: string | null }>;
}

export interface Draft {
  id: number;
  title: string;
  date: string;
}
