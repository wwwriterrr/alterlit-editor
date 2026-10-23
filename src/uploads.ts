/**
 * Новые фото живут в браузере до сохранения публикации: файл (уже уменьшенный) лежит здесь
 * под ключом, в тексте — <img data-upload="ключ">. При сохранении файлы уходят вместе с
 * публикацией одним запросом, сервер создаёт картинки и возвращает их по ключам.
 */
export const MAX_IMAGES = 20;
export const MAX_SIDE = 2560; // длинная сторона после уменьшения
const KEEP_BYTES = 6 * 1024 * 1024; // меньше и не крупнее MAX_SIDE — отправляем как есть
const TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const ACCEPT = TYPES.join(',');
export const MAX_SOURCE = 40 * 1024 * 1024;

interface Upload {
  blob: Blob;
  url: string;
  name: string;
}

const files = new Map<string, Upload>();

export const hasUpload = (key: string) => files.has(key);
export const uploadUrl = (key: string) => files.get(key)?.url ?? '';

/** Ключи и файлы, которые остались в тексте, — для отправки. */
export function pendingFiles(keys: Iterable<string>) {
  const out: [string, Blob, string][] = [];
  for (const k of keys) {
    const u = files.get(k);
    if (u) out.push([k, u.blob, u.name]);
  }
  return out;
}

/** Сохранено — файлы больше не нужны. */
export function dropUploads(keys: Iterable<string>) {
  for (const k of keys) {
    const u = files.get(k);
    if (u) URL.revokeObjectURL(u.url);
    files.delete(k);
  }
}

export class ImageError extends Error {}

const loadBitmap = (file: Blob) =>
  createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new ImageError('Не получилось прочитать картинку');
  });

/**
 * Файл с компьютера → готовое к отправке фото. GIF — как есть (анимация). Крупные снимки
 * уменьшаются до MAX_SIDE по длинной стороне (JPEG 90%, PNG остаётся PNG) — 20 фото с телефона
 * иначе весили бы сотни мегабайт. Поворот по EXIF браузер применяет сам.
 */
export async function addImage(file: File): Promise<{ key: string; url: string; width: number; height: number }> {
  if (!TYPES.includes(file.type)) throw new ImageError('Нужен JPG, PNG, GIF или WEBP');
  if (file.size > MAX_SOURCE) throw new ImageError('Файл больше 40 МБ');

  const bmp = await loadBitmap(file);
  const { width, height } = bmp;
  let blob: Blob = file;
  let w = width;
  let h = height;
  const big = Math.max(width, height) > MAX_SIDE;
  if (file.type !== 'image/gif' && (big || file.size > KEEP_BYTES)) {
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    w = Math.round(width * scale);
    h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImageError('Не получилось обработать картинку');
    ctx.drawImage(bmp, 0, 0, w, h);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageError('Не получилось сжать картинку'))), type, 0.9),
    );
  }
  bmp.close();

  const key = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const url = URL.createObjectURL(blob);
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/gif' ? 'gif' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  files.set(key, { blob, url, name: `${key}.${ext}` });
  return { key, url, width: w, height: h };
}
