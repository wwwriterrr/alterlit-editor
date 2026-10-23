# Редактор публикаций — остров React

Страницы `/post/new/` (обычная публикация, `?post_type=review&review_of=<id>`, `?post_type=blog`) и
`/post/edit/?id=<id>` вместо шаблона `add_post.html` с TinyMCE. Редактор — Tiptap (ProseMirror),
форма — Redux Toolkit, запросы — RTK Query.

- Сборка: `npm run build` → `dist/post_editor.js`, `dist/post_editor.css` (статика `/assets/post_editor/`).
- Выкладка: `../deploy.sh post_editor` (с `-b` — с пересборкой).
- Бэк: `django/editor/` (пакет `api/editor/`), собранный патч — `django/editor_patch.py`
  (`python3 tools/build_patch.py` после правок).

## Dev

`npm run dev` → http://localhost:5183/post/new/, `/post/edit/?id=61486` (черновик-образец в заглушках).

`.env.local` (в git не попадает):

- `BACKEND_URL`, `DEV_COOKIE` — сервер и строка Cookie для прокси;
- `DEV_FIXTURES=1` — API редактора в памяти dev-сервера, на прод ничего не уходит;
- `FIXTURE_AS=editor` — права редакции; `FIXTURE_BLOCKED=nickname|limit` — запрет писать;
- без заглушек запись в `/api/v1/editor/` с dev блокируется, пока нет `DEV_ALLOW_WRITE=1`.
