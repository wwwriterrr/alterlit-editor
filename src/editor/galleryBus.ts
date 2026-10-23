import type { GalleryImageAttrs } from './extensions';

/**
 * Окно выбора фото открывает App; блок галереи в тексте («Изменить») просит его через эту
 * точку — без проброса через Tiptap. Ответ — новый набор картинок или null (отмена).
 */
type Opener = (selected: GalleryImageAttrs[]) => Promise<GalleryImageAttrs[] | null>;

let opener: Opener | null = null;

export function setGalleryOpener(fn: Opener | null) {
  opener = fn;
}

export function pickImages(selected: GalleryImageAttrs[] = []) {
  return opener ? opener(selected) : Promise.resolve(null);
}
