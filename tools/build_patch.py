"""Собирает django/editor_patch.py: шапка + модули пакета api/editor/ по порядку."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'django'
MODULES = ['rules.py', 'sanitize.py', 'service.py', 'items.py', 'views.py', 'urls.py']

parts = [(ROOT / 'editor_patch_header.txt').read_text().rstrip() + '\n']
parts.append('\n\n# ── 1. api/editor/__init__.py — пустой файл ───────────────────────────────────\n')
for n, name in enumerate(MODULES, start=2):
    title = f'# ── {n}. api/editor/{name} '
    parts.append('\n\n' + title + '─' * max(4, 80 - len(title)) + '\n')
    parts.append((ROOT / 'editor' / name).read_text().rstrip() + '\n')
parts.append('\n\n' + (ROOT / 'editor_patch_footer.txt').read_text().rstrip() + '\n')
(ROOT / 'editor_patch.py').write_text(''.join(parts))
print('ok', ROOT / 'editor_patch.py')
