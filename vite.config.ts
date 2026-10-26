import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Пока ручек /api/v1/editor/ нет на сервере: DEV_FIXTURES=1 в .env.local — заглушки в памяти
 * dev-сервера (на прод ничего не уходит): конфиг формы, публикации и черновики; новые фото,
 * пришедшие вместе с публикацией, хранятся в памяти и отдаются с /dev-upload/<id>.
 * FIXTURE_AS=editor — права редакции (blog.add_post); FIXTURE_BLOCKED=nickname|limit — запрет писать.
 */
function editorFixture(env: Record<string, string>): Plugin {
  const editor = env.FIXTURE_AS === 'editor';
  const posts = new Map<number, Record<string, unknown>>();
  const uploads = new Map<number, { type: string; data: Buffer }>();
  let nextId = 900000;
  const library = (existsSync('dev-fixtures/images.json') ? JSON.parse(readFileSync('dev-fixtures/images.json', 'utf8')).images : []) as {
    id: number;
  }[];

  posts.set(61486, {
    id: 61486,
    url: '/post/61486/',
    post_type: 'post',
    status: 'draft',
    title: 'Черновик с галереей и скрытым текстом',
    content:
      '<p>Первый абзац. Стих:<br>Строка вторая<br>Строка третья</p><h2 class="post-title-2">Подзаголовок</h2><p style="text-align: center">По центру</p><p style="padding-left: 40px">С отступом</p>' +
      `<div class="gl-wrap" contenteditable="false" data-items="2"><div class="gl-descr">Подпись к фото</div><div class="gl-items cs-hidden">${library
        .slice(0, 2)
        .map((i) => `<img id="post_image-${i.id}" class="gl-item" src="../../media/x.jpg" data-thumb="${(i as { thumb?: string }).thumb}" data-preload="undefined">`)
        .join('')}</div></div>` +
      '<details><summary>Читать далее</summary><p>Спрятанный текст</p></details><p>/*vote-223*/</p>' +
      '<div class="media-block"><ul class="gallery ln-1"><li class="gallery-item">старый блок</li></ul></div><p>Конец.</p>',
    preview: '',
    ear: '',
    site: 'AL',
    date: '2026-10-20T10:57:00',
    categories: [7],
    genres: ['Рассказ'],
    gallery_type: 'NN',
    review_of: null,
  });

  const json = (res: ServerResponse, data: unknown, status = 200) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(data));
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
  const drafts = () => [...posts.values()].filter((p) => p.status === 'draft');

  /** multipart → поля и файлы (для dev хватает простого разбора по границе) */
  const parseMultipart = (raw: Buffer, contentType: string) => {
    const boundary = /boundary=(.+)$/.exec(contentType)?.[1];
    const fields: Record<string, string> = {};
    const files: Record<string, { type: string; data: Buffer }> = {};
    if (!boundary) return { fields, files };
    const sep = Buffer.from(`--${boundary}`);
    let pos = raw.indexOf(sep);
    while (pos !== -1) {
      const next = raw.indexOf(sep, pos + sep.length);
      if (next === -1) break;
      const part = raw.subarray(pos + sep.length + 2, next - 2);
      const headEnd = part.indexOf('\r\n\r\n');
      const head = part.subarray(0, headEnd).toString();
      const body = part.subarray(headEnd + 4);
      const name = /name="([^"]+)"/.exec(head)?.[1] ?? '';
      if (/filename="/.test(head)) files[name] = { type: /Content-Type: ([^\r\n]+)/.exec(head)?.[1] ?? 'image/jpeg', data: Buffer.from(body) };
      else fields[name] = body.toString();
      pos = next;
    }
    return { fields, files };
  };

  /** новые фото: <img data-upload="ключ"> → картинка с адресом /dev-upload/<id> */
  const storeUploads = (body: Record<string, unknown>, files: Record<string, { type: string; data: Buffer }>) => {
    const uploaded: Record<string, unknown> = {};
    body.content = String(body.content || '').replace(/<img([^>]*?)data-upload="([\w-]+)"([^>]*)>/g, (_m, a, key, b) => {
      const f = files[`image_${key}`];
      if (!f) return '';
      const id = 800000 + uploads.size;
      uploads.set(id, f);
      const url = `/dev-upload/${id}`;
      uploaded[key] = { id, src: url, thumb: url, preload: null };
      return `<img${a}id="post_image-${id}" src="${url}" data-thumb="${url}"${b}>`;
    });
    return uploaded;
  };

  const config = (postType: string) => ({
    user: { id: 79728, name: 'I am Dijavol', avatar: '/media/avatars/blob_wgufEu3', username: 'devil' },
    is_editor: editor,
    post_type: postType,
    blocked:
      env.FIXTURE_BLOCKED === 'nickname'
        ? {
            code: 'nickname',
            title: 'Нужен псевдоним',
            message: 'Чтобы писать и публиковать тексты, заполните в настройках поле «Псевдоним».',
            action: { label: 'Открыть настройки', url: '/profile/devil/?page=settings' },
          }
        : env.FIXTURE_BLOCKED === 'limit'
          ? {
              code: 'day_limit',
              title: 'Уважаемый автор!',
              message: 'К рассмотрению мы принимаем не более 3 текстов в сутки. Возвращайтесь завтра — а пока текст можно сохранить черновиком.',
              action: null,
            }
          : null,
    limits: { title: [1, 100], preview: [60, 240], ear: [20, 250], content: 20000, genres: 3, drafts: 10 },
    categories:
      postType === 'post'
        ? [
            { id: 3, title: 'IMHOCH', parent_id: null, sites: ['AL'], content_max: null },
            { id: 4, title: 'Fresh Trash', parent_id: null, sites: ['AL'], content_max: null },
            { id: 7, title: 'Проза', parent_id: null, sites: ['AL'], content_max: null },
            { id: 6, title: 'Стихи', parent_id: null, sites: ['AL'], content_max: null },
            { id: 10, title: 'Блоги', parent_id: null, sites: ['AL'], content_max: null },
            { id: 54, title: 'Интервью', parent_id: null, sites: ['AL'], content_max: null },
            { id: 65, title: 'Конкурс романов', parent_id: 54, sites: ['AL'], content_max: 40000 },
            ...(editor
              ? [
                  { id: 37, title: 'Длинные тексты', parent_id: null, sites: ['AL'], content_max: 300000 },
                  { id: 19, title: 'AltCG: Статьи', parent_id: null, sites: ['ALT'], content_max: null },
                ]
              : []),
          ]
        : [],
    genres: ['Эссе', 'Путешествия', 'Детектив', 'Комедия', 'Мелодрама', 'Очерк', 'Новелла', 'Повесть', 'Фантастика', 'Рассказ', 'Сказка', 'Роман', 'Трагедия', 'Фольклор', 'Трэш', 'Ужасы', 'Мистика'],
    genres_category: postType === 'post' ? 7 : null,
    gallery_types: [
      { value: 'NN', title: 'Без медиафайлов' },
      { value: 'SN', title: 'Показывать первый медиафайл' },
    ],
    blog_category: postType === 'blog' ? 10 : null,
    review_of: postType === 'review' ? { id: 92607, title: 'Поединок. Пентон 2', url: '/post/92607/' } : null,
    delay: editor ? { from: '08:00', to: '20:00', step: 30 } : null,
    drafts: drafts().length,
    day: editor ? null : { limit: 3, used: env.FIXTURE_BLOCKED === 'limit' ? 3 : 1 },
    mode: 'alterlit',
  });

  const save = (body: Record<string, unknown>, id?: number) => {
    const errors: Record<string, string> = {};
    if (!String(body.title || '').trim()) errors.title = 'Придумайте заголовок';
    if (!String(body.content || '').replace(/<[^>]+>/g, '').trim()) errors.content = 'Добавьте текст';
    if (!body.draft && body.post_type === 'post' && !(body.categories as number[]).length) errors.categories = 'Выберите рубрику';
    if (Object.keys(errors).length) return { status: 400, data: { detail: Object.values(errors)[0], errors } };
    const pid = id ?? nextId++;
    const status = body.draft ? 'draft' : editor ? 'published' : 'moderate';
    const post = {
      id: pid,
      url: `/post/${pid}/`,
      post_type: body.post_type,
      status,
      title: body.title,
      content: body.content,
      preview: body.preview,
      ear: body.ear,
      site: body.site ?? 'AL',
      date: (body.delay as string) ?? new Date().toISOString().slice(0, 19),
      categories: body.categories,
      genres: body.genres,
      gallery_type: body.gallery_type ?? '',
      review_of: null,
    };
    posts.set(pid, post);
    const message =
      status === 'draft'
        ? 'Черновик сохранён'
        : status === 'moderate'
          ? 'Ваша публикация попала на модерацию. В ближайшее время мы обработаем её и уведомим вас о своём решении!'
          : 'Ваш текст опубликован!';
    return { status: id ? 200 : 201, data: { post, message, drafts: drafts().length } };
  };

  return {
    name: 'editor-fixture',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '', 'http://x');
        const path = url.pathname;
        const m = /^\/dev-upload\/(\d+)$/.exec(path);
        if (m && uploads.has(Number(m[1]))) {
          const u = uploads.get(Number(m[1]))!;
          res.setHeader('content-type', u.type);
          return res.end(u.data);
        }
        if (!path.startsWith('/api/v1/editor/')) return next();
        const rest = path.slice('/api/v1/editor/'.length);
        const delay = (ms: number, fn: () => void) => setTimeout(fn, ms);

        if (rest === 'config/') return delay(300, () => json(res, config(url.searchParams.get('post_type') || 'post')));
        if (rest === 'drafts/')
          return delay(300, () => json(res, { drafts: drafts().map((p) => ({ id: p.id, title: p.title, date: p.date })) }));
        const pm = /^posts\/(\d+)\/$/.exec(rest);
        const readSave = async () => {
          const { fields, files } = parseMultipart(await readBody(req), req.headers['content-type'] ?? '');
          const body = JSON.parse(fields.data || '{}');
          return { body, files };
        };
        if (rest === 'posts/' && req.method === 'POST') {
          const { body, files } = await readSave();
          const uploaded = storeUploads(body, files);
          const r = save(body);
          return delay(900, () => json(res, { ...(r.data as object), uploaded }, r.status));
        }
        if (pm) {
          const id = Number(pm[1]);
          const post = posts.get(id);
          if (!post) return json(res, { detail: 'Публикация не найдена' }, 404);
          if (req.method === 'GET') return delay(300, () => json(res, post));
          if (req.method === 'PUT') {
            const { body, files } = await readSave();
            const uploaded = storeUploads(body, files);
            const r = save(body, id);
            return delay(900, () => json(res, { ...(r.data as object), uploaded }, r.status));
          }
          if (req.method === 'DELETE') {
            posts.delete(id);
            return delay(500, () => json(res, { drafts: drafts().length }));
          }
        }
        json(res, { detail: 'dev: нет такой заглушки' }, 404);
      });
    },
  };
}

// В dev-режиме API, медиа и статика сайта проксируются на бэкенд, чтобы cookie работали как
// same-origin. DEV_COOKIE (строка Cookie из браузера) в .env.local — прокси подставит её сам,
// а заодно X-CSRFToken, Origin и Referer для Django CSRF.
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = (env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const asAdmin = env.DEV_AS === 'admin' && Boolean(env.DEV_COOKIE_ADMIN);
  const devCookie = (asAdmin ? env.DEV_COOKIE_ADMIN : env.DEV_COOKIE) || '';
  if (command === 'serve' && devCookie) console.log(`  dev-сессия: ${asAdmin ? 'администратор' : 'пользователь'}`);
  const csrf = /(?:^|;\s*)csrftoken=([^;]+)/.exec(devCookie)?.[1];

  const proxy = (): ProxyOptions => ({
    target: backend,
    changeOrigin: true,
    secure: true,
    configure: (p) => {
      // без заглушек запись в /api/v1/editor/ ушла бы на прод — с dev только чтение,
      // пока в .env.local нет DEV_ALLOW_WRITE=1
      p.on('proxyReq', (req, inReq, res) => {
        if (inReq.method !== 'GET' && inReq.url?.startsWith('/api/v1/editor/') && !env.DEV_ALLOW_WRITE) {
          (res as ServerResponse).statusCode = 403;
          (res as ServerResponse).setHeader('content-type', 'application/json');
          (res as ServerResponse).end(JSON.stringify({ detail: 'dev: запись на прод выключена (DEV_ALLOW_WRITE=1 в .env.local)' }));
          req.destroy();
          return;
        }
        if (!devCookie) return;
        req.setHeader('cookie', devCookie);
        req.setHeader('origin', backend);
        req.setHeader('referer', backend + '/');
        if (csrf) req.setHeader('x-csrftoken', csrf);
      });
      p.on('proxyRes', (res) => {
        delete res.headers['set-cookie'];
      });
    },
  });

  return {
    // Статику отдаёт Django с /assets/editor/
    base: command === 'build' ? env.VITE_ASSETS_BASE || '/assets/editor/' : '/',
    plugins: [react(), ...(command === 'serve' && env.DEV_FIXTURES ? [editorFixture(env)] : [])],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      cssCodeSplit: false,
      rollupOptions: {
        // точка входа без index.html: её подключает шаблон Django
        input: 'src/main.tsx',
        output: {
          // один файл скрипта и один стилей со статическими именами — прописаны в шаблоне (с ?v=)
          entryFileNames: 'post_editor.js',
          inlineDynamicImports: true,
          assetFileNames: (info) =>
            info.names?.some((n) => n.endsWith('.css')) ? 'post_editor.css' : 'assets/[name]-[hash][extname]',
        },
      },
    },
    server: {
      port: 5183,
      proxy: {
        '/api': proxy(),
        '/media': proxy(),
        '/assets': proxy(),
      },
    },
  };
});
