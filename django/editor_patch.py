# Редактор публикаций v2 — остров React (страницы /post/new/ и /post/edit/). Бэк — api/editor/,
# параллельно старому (post_api "new"/"edit", Post.create_post / change_post, add_post.html не трогаем).
#
#   GET    /api/v1/editor/config/?post_type=post|review|blog[&review_of=<id>][&id=<id>]
#          → права (is_editor), лимиты, рубрики (с сайтами и своим пределом длины), жанры,
#            миниатюры, рубрика блога, рецензируемый пост, окно отложенной публикации, число черновиков;
#            писать нельзя (не активирован, нет псевдонима, лимит в сутки, AltCG) — "blocked": {code, title,
#            message, action}
#   GET    /api/v1/editor/posts/<id>/       — публикация для правки (те же проверки, что у post_api "edit")
#   POST   /api/v1/editor/posts/            — создать
#   PUT    /api/v1/editor/posts/<id>/       — сохранить
#          multipart: data — JSON {post_type, review_of, title, content, preview, ear, site,
#                     delay "ГГГГ-ММ-ДДTЧЧ:ММ" | null, categories: [id], genres: [название], gallery_type, draft: bool};
#                     image_<ключ> — файлы новых фото (в тексте у них <img data-upload="ключ">)
#          → {"post": {...}, "message": "…", "drafts": N, "uploaded": {ключ: {id, src, thumb, preload}}};
#            400 {"detail", "errors": {поле: текст}}
#          Новые фото сохраняются как PostImages (save() сам уменьшает файл и считает размеры),
#          в тексте ключ заменяется на <img class="gl-item" id="post_image-N" …>. Всего фото — не больше 20;
#          не редакции — только фото этой же публикации и новые. Ошибка — файлы новых фото удаляются.
#   DELETE /api/v1/editor/posts/<id>/       — удалить черновик → {"drafts": N}
#   GET    /api/v1/editor/drafts/           — свои черновики → {"drafts": [{id, title, date}]}
#
# Правила (rules.py) — как в post_api и create_post/change_post:
#   • новая: аккаунт активирован; на AltCG — только редакция; не редакция — лимит posts_day_limit в сутки
#     и обязательный псевдоним; рецензия — на опубликованное (и «в профиле»), не на рецензию/историю/спецпроект;
#   • правка: истории и объявления — нельзя; чужое — с blog.change_post; своё без прав — черновик,
#     «в профиле», «на модерации»;
#   • статус: черновик; редакция — «опубликовано»; остальные — «на модерации». day_posts_count новой
#     публикации считает сигнал post_post_save, переход черновик → модерация — сам редактор (как change_post);
#   • проверки post_pre_save — заранее и по полям: превью 60–240 (и у черновиков), «ухо» по EAR_SIZE,
#     заголовок не из одних цифр;
#   • удаление — только черновик; удалил не автор — автору уведомление (как delete-post);
#     правка отправленного без blog.change_post — снова «на модерации»;
#   • рубрики — WRITER_SLUGS (редакции WRITER_SLUGS_ADMIN), не редакции — одна; «Проза» (7) — жанры
#     обязательны, не больше 3; блог — рубрика blog; длина текста — CONTENT_SIZE, свой предел рубрики —
#     в её json_meta {"content_max": N}, не задан — 20 000; считается на сервере;
#   • «ухо», сайт, миниатюра — только редакция; дата — новая с blog.add_post, правка с blog.change_post,
#     окно 08:00–20:00 каждые 30 минут; прошедшее время — публикация сейчас;
#   • черновиков не редакции — не больше 10;
#   • Creative Market и истории здесь не создаются;
#   • текст чистится на сервере (sanitize.py, nh3): только теги и стили редактора и старых постов —
#     без <script>, onclick, onerror, javascript:, чужих iframe и картинок; заголовок, превью и «ухо» — без тегов.
#
# Разметка текста — та же, что у старого редактора (gl-wrap/gl-item, h2.post-title-2, details, padding-left
# отступы, text-align): страница поста и лента работают без изменений. Незнакомые блоки старых публикаций
# (media-block, iframe, таблицы) сохраняются как есть.
#
# Зависимость: nh3 (уже стоит для чата).
#
# Подключение: пакет api/editor/ (п. 1–7), в api/urls.py — path('editor/', include('api.editor.urls')),
# в INSTALLED_APPS не добавлять. Места «ПРОВЕРЬТЕ» — допущения, которые нужно сверить с кодом.


# ── 1. api/editor/__init__.py — пустой файл ───────────────────────────────────


# ── 2. api/editor/rules.py ────────────────────────────────────────────────────
"""
Редактор публикаций — ЕДИНСТВЕННОЕ место с правилами: кто может писать и править, какие
поля и рубрики ему доступны, лимиты. Перенесено из blog/views.py post_api ("new", "edit")
и Post.create_post / Post.change_post; старый код не трогаем, редактор работает параллельно.

Типы: post (обычная), review (рецензия), blog (блог — рубрика «Блоги» без выбора).
Creative Market и истории здесь не создаются (истории — только через ярмарку).
"""
import json

from blog.models import Category, Post, SiteParams

POST_TYPES = ('post', 'review', 'blog')
EDITABLE_TYPES = ('post', 'review')  # блог хранится как post с рубрикой «Блоги» (is_blog)

# рубрика «Проза» — для неё жанры обязательны (как _check_genres старого редактора)
GENRES_CATEGORY = 7
GENRES_MAX = 3
DRAFTS_MAX = 10  # не редакции — не больше 10 черновиков

# свой предел длины текста у рубрик (data-long / проверки 63 и 65 старого редактора)
# Свой предел длины текста у рубрики — в админке рубрики, json_meta: {"content_max": 40000}.
# Не задан — общий Post.CONTENT_SIZE (20 000).
CONTENT_MAX_KEY = 'content_max'

# отложенная публикация: часы и шаг datetimepicker старого редактора
DELAY = {'from': '08:00', 'to': '20:00', 'step': 30}

SITES = {'alterlit': ['AL', 'ALL'], 'altcg': ['ALT', 'ALL']}


class Denied(Exception):
    """Писать или править нельзя — с понятной причиной для страницы-заглушки."""

    def __init__(self, code, title, message, action=None, status=403):
        super().__init__(message)
        self.code, self.title, self.message, self.action, self.status = code, title, message, action, status

    def as_json(self):
        return {'code': self.code, 'title': self.title, 'message': self.message, 'action': self.action}


def is_editor(user):
    """Редакция: публикует без модерации, видит «ухо», сайт, дату, миниатюру, все рубрики."""
    return user.is_superuser or user.has_perm('blog.add_post')


def can_change_any(user):
    return user.is_superuser or user.has_perm('blog.change_post')


def limits():
    return {
        'title': list(Post.TITLE_SIZE),
        'preview': list(Post.PREVIEW_SIZE),
        'ear': list(Post.EAR_SIZE),
        'content': Post.CONTENT_SIZE[1],
        'genres': GENRES_MAX,
        'drafts': DRAFTS_MAX,
    }


def day_limit():
    return SiteParams.get_param('posts_day_limit')


def day_count(user):
    return user.profile.get_meta('day_posts_count', none_value=0)


# ── можно ли начать новую публикацию ─────────────────────────────────────────
def check_new(user, mode):
    """Как GET post_api("new"): активация, AltCG, лимит в сутки, псевдоним. → Denied или None."""
    if not user.profile.is_activated:
        raise Denied('not_activated', 'Аккаунт не активирован',
                     'Чтобы добавлять публикации, активируйте аккаунт — ссылка пришла вам на почту.')
    if mode == 'altcg' and not is_editor(user):
        raise Denied('altcg', 'Недоступно', 'На AltCG публикации добавляет редакция.', {'label': 'На главную', 'url': '/'})
    if not is_editor(user):
        limit = day_limit()
        if limit and day_count(user) >= limit:
            # в старом коде здесь подставлялось число уже отправленных текстов вместо предела
            raise Denied('day_limit', 'Уважаемый автор!',
                         f'К рассмотрению мы принимаем не более {limit} {_plural(limit, "текста", "текстов", "текстов")} в сутки. '
                         'Возвращайтесь завтра — а пока текст можно сохранить черновиком.')
        if not (user.profile.nickname or '').strip():
            raise Denied('nickname', 'Нужен псевдоним',
                         'Чтобы писать и публиковать тексты, заполните в настройках поле «Псевдоним».',
                         {'label': 'Открыть настройки', 'url': '/settings/'})


def check_review_target(review_of):
    """Рецензию можно писать на опубликованное (и в профиле), не на рецензию, историю, спецпроект."""
    try:
        target = Post.objects.get(id=int(review_of))
    except (Post.DoesNotExist, TypeError, ValueError):
        raise Denied('review_not_found', 'Публикация не найдена', 'Не нашли публикацию, на которую вы пишете рецензию.',
                     status=404)
    if target.status not in ('published', 'profile'):
        raise Denied('review_not_found', 'Публикация не найдена', 'Не нашли публикацию, на которую вы пишете рецензию.',
                     status=404)
    if target.post_type in ('review', 'story', 'special'):
        raise Denied('review_forbidden', 'Нельзя написать рецензию', 'На эту публикацию нельзя написать рецензию.')
    return target


# ── можно ли править ─────────────────────────────────────────────────────────
def check_edit(user, post, mode):
    """Как GET post_api("edit"): истории — нет; чужое — только с blog.change_post;
    своё без прав — черновик, «в профиле», «на модерации»."""
    if mode == 'altcg' and not can_change_any(user):
        raise Denied('altcg', 'Недоступно', 'Править публикации на AltCG может только редакция.')
    if post.post_type not in EDITABLE_TYPES:
        raise Denied('type', 'Нельзя редактировать', 'Публикации такого типа не редактируются.')
    own = post.author_id == user.id
    if not own and not can_change_any(user):
        raise Denied('forbidden', 'Нельзя редактировать', 'Вы не можете редактировать эту публикацию.')
    if own and not can_change_any(user) and post.status not in ('draft', 'profile', 'moderate'):
        raise Denied('forbidden', 'Нельзя редактировать',
                     'Опубликованный текст правится через поддержку — напишите нам, что нужно изменить.')


# ── рубрики, жанры, миниатюры ────────────────────────────────────────────────
def blog_category_id():
    return Category.objects.filter(slug='blog').values_list('id', flat=True).first()


def writer_slugs(user):
    """Рубрики формы — из SiteParams writer_slugs_admin: {"users": [...], "admins": [...]}
    (строка JSON или уже словарь — смотря что отдаёт get_param)."""
    raw = SiteParams.get_param('writer_slugs_admin')
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = {}
    raw = raw if isinstance(raw, dict) else {}
    return list(raw.get('admins' if is_editor(user) else 'users') or [])


def categories(user):
    """Рубрики для выбора (обычные публикации) в порядке настройки; у редакции — список admins."""
    slugs = writer_slugs(user)
    by_slug = {c.slug: c for c in Category.objects.filter(slug__in=slugs)}
    res = []
    for slug in slugs:
        c = by_slug.get(slug)
        if c is None:
            continue
        res.append({
            'id': c.id,
            'title': c.title,
            'parent_id': c.parent_id,
            'sites': ['AL', 'ALT'] if c.site == 'ALL' else [c.site],
            'content_max': category_content_max(c),
        })
    return res


def allowed_category_ids(user, site):
    """Можно выбрать: рубрики формы, доступные на выбранном сайте (ALL — все)."""
    ids = set()
    for c in categories(user):
        if site == 'ALL' or site in c['sites']:
            ids.add(c['id'])
    return ids


def category_content_max(c):
    """Предел рубрики: json_meta "content_max" (целое > 0), иначе None — общий предел."""
    try:
        value = int(c.get_meta(CONTENT_MAX_KEY, none_value=0) or 0)
    except (TypeError, ValueError):
        value = 0
    return value if value > 0 else None


def content_max(category_ids):
    """Предел текста публикации: наибольший из пределов её рубрик, иначе Post.CONTENT_SIZE."""
    own = [m for m in (category_content_max(c) for c in Category.objects.filter(id__in=category_ids)) if m]
    return max(own) if own else Post.CONTENT_SIZE[1]


def genres():
    return list(Post.WRITER_GENRES)


def gallery_types():
    return [{'value': v, 'title': str(t)} for v, t in Post.GALLERY_TYPES]


def default_site(mode):
    return 'ALT' if mode == 'altcg' else 'AL'


def _plural(n, one, few, many):
    a = abs(n) % 100
    b = a % 10
    if 10 < a < 20:
        return many
    if b == 1:
        return one
    if 2 <= b <= 4:
        return few
    return many


# ── 3. api/editor/sanitize.py ─────────────────────────────────────────────────
"""
Текст публикации — HTML от автора. Страница поста выводит его как есть (|safe), а смотрит его и
модератор — значит, <script>, onerror=, javascript: в ссылках выполнились бы у него. Поэтому на
сервере оставляем только то, что умеет редактор, и старые блоки, которые встречаются в постах.

Зависимость: nh3 (уже стоит для чата: api/chat_legacy/sanitize.py).
"""
import re

import nh3

TAGS = {
    # текст
    'p', 'br', 'h2', 'h3', 'h4', 'pre', 'blockquote', 'ul', 'ol', 'li',
    'a', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sup', 'sub', 'span',
    # галерея и скрытый текст
    'div', 'img', 'details', 'summary',
    # старые публикации: таблицы, видео YouTube
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'iframe', 'hr',
}

ATTRIBUTES = {
    '*': {'style'},
    'a': {'href', 'target', 'title'},
    'h2': {'class'},
    'h3': {'class'},
    'div': {'class', 'data-items', 'contenteditable'},
    'ul': {'class'},
    'li': {'class'},
    'img': {'class', 'id', 'src', 'alt', 'data-thumb', 'data-preload', 'data-upload', 'width', 'height'},
    'iframe': {'src', 'width', 'height', 'allowfullscreen', 'frameborder'},
    'td': {'colspan', 'rowspan'},
    'th': {'colspan', 'rowspan'},
}

# стили, которые ставит редактор: выравнивание, отступ, шрифт и размер (редакция)
STYLES = {'text-align', 'padding-left', 'font-family', 'font-size'}

YOUTUBE = re.compile(r'^(?:https?:)?//(?:www\.)?youtube(?:-nocookie)?\.com/embed/[\w-]+')
IMAGE_ID = re.compile(r'^post_image-\d+$')
UPLOAD_KEY = re.compile(r'^[\w-]{1,40}$')
CLASSES = re.compile(r'^(?:post-title-[23]|gl-wrap|gl-descr|gl-items|gl-item|cs-hidden|details-body|media-block|'
                     r'gallery(?: ln-\d+)?|gallery-item|left-align|right-align|justify-align)(?: [\w-]+)*$')


def _attribute(tag, attr, value):
    if tag == 'iframe' and attr == 'src':
        return value if YOUTUBE.match(value) else None
    if tag == 'img' and attr == 'data-upload':
        # ключ нового фото — service.py заменит его на картинку с сервера
        return value if UPLOAD_KEY.match(value) else None
    if tag == 'img' and attr == 'id':
        return value if IMAGE_ID.match(value) else None
    if tag == 'img' and attr in ('src', 'data-thumb', 'data-preload'):
        # картинки — только свои (/media/…) или с этого же сайта
        return value if value.startswith('/media/') or value.startswith('https://alterlit.ru/media/') else None
    if attr == 'class':
        return value if CLASSES.match(value) else None
    if attr == 'contenteditable':
        return 'false'
    if attr == 'target':
        return '_blank' if value == '_blank' else None
    return value


def clean_content(value):
    """HTML поста → только разрешённое. Ссылки — http(s), mailto и свои (/…)."""
    return nh3.clean(
        value or '',
        tags=TAGS,
        attributes=ATTRIBUTES,
        attribute_filter=_attribute,
        filter_style_properties=STYLES,
        url_schemes={'http', 'https', 'mailto'},
        link_rel='noopener noreferrer',
        strip_comments=True,
    ).strip()


# ── 4. api/editor/service.py ──────────────────────────────────────────────────
"""
Создание и правка публикации — одна функция save_post вместо Post.create_post / change_post.

Что исправлено по сравнению со старым кодом:
  • всё в одной транзакции: ошибка на середине не оставляет полупустой пост (раньше —
    post.delete() вручную, и не везде);
  • сайт не редакции не меняется при правке (change_post ставил ALL по умолчанию);
  • файлы/вложения не трогаем (в change_post была неопределённая переменная author);
  • теги-жанры — с транслитерацией и при правке (раньше slug=i);
  • длина текста считается на сервере, а не берётся из запроса (content_length);
  • картинки поста — по id в тексте (img#post_image-N); не редакции — только фото этой же
    публикации, чужие не подцепить; новые фото приходят файлами вместе с публикацией
    (<img data-upload="ключ"> в тексте + файл image_<ключ>), всего не больше 20;
  • лимит черновиков проверяется и когда публикацию возвращают в черновики.
Побочные эффекты Post.save() (уведомления, ярмарка, флаги _from_admin_form, _delay и т. п.)
сохраняются: флаги ставятся так же, как в create_post / change_post.
"""
import re
from datetime import datetime

from django.conf import settings
from django.db import transaction
from django.utils import timezone as tz
from django.utils.html import strip_tags

from blog.models import Category, Post, PostImages, Tag

from api.editor import rules
from api.editor.sanitize import clean_content

RE_IMAGE_ID = re.compile(r'id=["\']post_image-(\d+)["\']')
# новое фото в тексте: <img … data-upload="ключ" …> (sanitize оставляет только такой ключ)
RE_UPLOAD = re.compile(r'<img\b[^>]*\bdata-upload="([\w-]{1,40})"[^>]*>')
MAX_IMAGES = 20
IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
IMAGE_MAX_BYTES = 20 * 1024 * 1024


class Invalid(Exception):
    """Ошибки по полям → 400 {"detail": первая, "errors": {поле: текст}}."""

    def __init__(self, errors):
        super().__init__(next(iter(errors.values())))
        self.errors = errors


def _text_length(html):
    return len(strip_tags(html or '').replace('&nbsp;', ' ').strip())


def _parse_delay(raw):
    """'ГГГГ-ММ-ДДTЧЧ:ММ' (время сервера) → datetime в разрешённое окно, иначе ошибка."""
    try:
        when = datetime.strptime(raw, '%Y-%m-%dT%H:%M')
    except (TypeError, ValueError):
        raise Invalid({'delay': 'Неверная дата публикации'})
    lo, hi = rules.DELAY['from'], rules.DELAY['to']
    hm = when.strftime('%H:%M')
    if not (lo <= hm <= hi) or when.minute % rules.DELAY['step']:
        raise Invalid({'delay': f'Время публикации — с {lo} до {hi}, каждые {rules.DELAY["step"]} минут'})
    if tz.is_aware(tz.now()):
        when = tz.make_aware(when)
    if when <= tz.now():
        # как раньше: прошедшее время — публикуем сейчас
        return None
    return when


def validate(user, data, post, mode, files=None):
    """Проверка тела запроса (files — новые фото: {ключ: файл}). → чистые значения или Invalid."""
    files = files or {}
    errors = {}
    editor = rules.is_editor(user)
    draft = bool(data.get('draft'))

    kind = data.get('post_type') if post is None else ('blog' if _is_blog(post) else post.post_type)
    if kind not in rules.POST_TYPES:
        raise Invalid({'post_type': 'Неизвестный тип публикации'})

    # заголовок, превью, «ухо» — простой текст: теги в них потом попадают в уведомления и карточки
    title = strip_tags(data.get('title') or '').strip()
    t_lo, t_hi = Post.TITLE_SIZE
    if not title:
        errors['title'] = 'Придумайте заголовок'
    elif len(title) > t_hi and not editor:
        errors['title'] = f'Заголовок длиннее {t_hi} знаков'
    elif getattr(settings, 'RE_ONLY_DIGIT', None) and re.match(settings.RE_ONLY_DIGIT, title):
        # как post_pre_save: иначе save() упадёт с общей ошибкой
        errors['title'] = 'Заголовок не может состоять только из цифр и пробелов'

    # HTML автора — только разрешённое (sanitize.py): страницу поста смотрит и модератор
    content = clean_content(data.get('content') or '')
    length = _text_length(content)

    # сайт: редакция выбирает, остальным — как было (или сайт по умолчанию)
    site = data.get('site') if editor else None
    if site not in ('AL', 'ALT', 'ALL'):
        site = post.site if post is not None else rules.default_site(mode)

    # рубрики
    if kind == 'blog':
        blog = rules.blog_category_id()
        cats = [blog] if blog else []
    elif kind == 'review':
        cats = []
    else:
        allowed = rules.allowed_category_ids(user, site)
        cats = [int(c) for c in data.get('categories') or [] if str(c).isdigit()]
        if any(c not in allowed for c in cats):
            errors['categories'] = 'Эта рубрика недоступна'
        if not editor and len(cats) > 1:
            errors['categories'] = 'Выберите одну рубрику'
        if not draft and not cats:
            errors['categories'] = 'Выберите рубрику'

    if not length:
        errors['content'] = 'Добавьте текст' if not RE_IMAGE_ID.search(content) else 'Текст не может состоять только из фото'
    elif length > (limit := rules.content_max(cats)):
        errors['content'] = f'Текст длиннее {limit} знаков — сократите его'

    # жанры — только у прозы, обязательно при отправке
    genres = []
    if kind == 'post' and rules.GENRES_CATEGORY in cats:
        known = set(rules.genres())
        genres = [g for g in data.get('genres') or [] if g in known][:rules.GENRES_MAX]
        if len(data.get('genres') or []) > rules.GENRES_MAX:
            errors['genres'] = f'Не больше {rules.GENRES_MAX} жанров'
        if not draft and not genres:
            errors['genres'] = 'Выберите хотя бы один жанр'

    preview = strip_tags(data.get('preview') or '').strip()
    p_lo, p_hi = Post.PREVIEW_SIZE
    # post_pre_save проверяет превью и у черновиков (кроме редакции)
    if preview and not editor and not (p_lo <= len(preview) <= p_hi):
        errors['preview'] = f'Превью — от {p_lo} до {p_hi} знаков'
    if len(preview) > 2000:
        errors['preview'] = 'Превью слишком длинное'

    ear = strip_tags(data.get('ear') or '').strip() if editor else None
    if ear:
        e_lo, e_hi = Post.EAR_SIZE
        if not e_lo <= len(ear) <= e_hi:
            errors['ear'] = f'«Ухо» — от {e_lo} до {e_hi} знаков'

    # дата: новая — с blog.add_post, правка — с blog.change_post (как в шаблоне)
    delay = None
    may_delay = editor if post is None else rules.can_change_any(user)
    if may_delay and data.get('delay'):
        current = post.date.strftime('%Y-%m-%dT%H:%M') if post is not None and post.date else None
        # прежняя дата публикации (форма присылает её обратно) — не меняем и не проверяем
        if data['delay'] != current:
            try:
                delay = _parse_delay(data['delay'])
            except Invalid as ex:
                errors.update(ex.errors)

    # фото: уже на сервере — по id; не редакции — только фото этой же публикации
    image_ids = list(dict.fromkeys(int(i) for i in RE_IMAGE_ID.findall(content)))
    if editor:
        images = list(PostImages.objects.filter(id__in=image_ids)) if image_ids else []
    else:
        images = list(post.images.filter(id__in=image_ids)) if post is not None and image_ids else []
    if len(images) != len(image_ids):
        errors['content'] = 'Фото из других публикаций вставить нельзя — добавьте его заново с компьютера'
    # новые фото — файлами вместе с публикацией
    upload_keys = list(dict.fromkeys(RE_UPLOAD.findall(content)))
    for key in upload_keys:
        f = files.get(key)
        if f is None:
            errors['content'] = 'Фото не дошло до сервера — сохраните ещё раз'
        elif f.content_type not in IMAGE_TYPES:
            errors['content'] = 'Фото — только JPG, PNG, GIF или WEBP'
        elif f.size > IMAGE_MAX_BYTES:
            errors['content'] = 'Фото больше 20 МБ'
    if len(images) + len(upload_keys) > MAX_IMAGES:
        errors['content'] = f'В публикации — не больше {MAX_IMAGES} фото'

    gallery_type = data.get('gallery_type') if editor else None
    if gallery_type not in Post.GALLERY_TYPES_LIST:
        gallery_type = None

    review_of = None
    if post is None and kind == 'review':
        try:
            review_of = rules.check_review_target(data.get('review_of'))
        except rules.Denied as ex:
            errors['review_of'] = ex.message

    if errors:
        raise Invalid(errors)
    return {
        'kind': kind, 'draft': draft, 'title': title, 'content': content, 'length': length, 'site': site,
        'categories': cats, 'genres': genres, 'preview': preview, 'ear': ear, 'delay': delay,
        'images': images, 'uploads': [(k, files[k]) for k in upload_keys], 'gallery_type': gallery_type,
        'review_of': review_of,
    }


def _is_blog(post):
    blog = rules.blog_category_id()
    return post.post_type == 'post' and blog and post.category.filter(id=blog).exists()


def _drafts_left(user):
    if rules.is_editor(user):
        return True
    return Post.objects.filter(author=user, status='draft').count() < rules.DRAFTS_MAX


def _slug(title):
    """Транслитерация, как у create_post. Импорт здесь, а не наверху: если функция лежит не в
    blog.models, падает только сохранение жанров, а не загрузка всего API."""
    try:
        from blog.models import _from_ru_to_en
    except ImportError:
        from django.utils.text import slugify
        return slugify(title, allow_unicode=True)
    return _from_ru_to_en(title)


def _set_tags(post, genres):
    """Жанры — теги поста; лишние теги снимаются (как change_post)."""
    tags = []
    for g in genres:
        tag = Tag.objects.filter(title=g).first()
        if tag is None:
            tag = Tag.objects.create(title=g, slug=_slug(g))
        tags.append(tag)
    post.tags.set(tags)


def _image_json(img):
    card = getattr(img, 'image_card', None)
    try:
        thumb = card.url if card is not None else img.thumbnail().url
    except Exception:
        thumb = img.image.url
    return {'id': img.id, 'src': img.image.url, 'thumb': thumb, 'preload': getattr(img, 'full_preload_webp_url', None)}


def _store_uploads(uploads):
    """Новые фото → PostImages (save() сам уменьшает файл и запоминает размеры). → {ключ: картинка}"""
    created = {}
    for key, f in uploads:
        img = PostImages(image=f)
        img.save()
        created[key] = img
    return created


def _put_uploads(content, created):
    """<img data-upload="ключ"> → <img class="gl-item" id="post_image-N" src data-thumb data-preload>"""
    def repl(m):
        img = created.get(m.group(1))
        if img is None:
            return ''
        j = _image_json(img)
        preload = f' data-preload="{j["preload"]}"' if j['preload'] else ''
        return f'<img class="gl-item" id="post_image-{img.id}" src="{j["src"]}" data-thumb="{j["thumb"]}"{preload} alt="">'
    return RE_UPLOAD.sub(repl, content)


def save_post(user, data, mode, post=None, files=None):
    """Создать (post=None) или изменить публикацию; files — новые фото {ключ: файл}.
    → (post, сообщение, {ключ: картинка} для новых фото)."""
    created = {}
    try:
        with transaction.atomic():
            return _save(user, data, mode, post, files or {}, created)
    except Exception:
        # транзакция откатила записи, а файлы новых фото остались на диске — убираем
        for img in created.values():
            try:
                img.image.storage.delete(img.image.name)
            except Exception:
                pass
        raise


def _save(user, data, mode, post, files, created):
    v = validate(user, data, post, mode, files)
    editor = rules.is_editor(user)
    creating = post is None
    was_draft = not creating and post.status == 'draft'
    count_day = False

    # ── статус ──
    if v['draft']:
        was_draft = post is not None and post.status == 'draft'
        if not was_draft and not _drafts_left(user):
            raise Invalid({'draft': f'Можно хранить не больше {rules.DRAFTS_MAX} черновиков — удалите или допишите один из них'})
        status = 'draft'
    elif creating or post.status == 'draft':
        if editor if creating else rules.can_change_any(user):
            status = 'published'
        else:
            limit = rules.day_limit()
            if limit and rules.day_count(user) >= limit:
                raise Invalid({'draft': 'На сегодня лимит текстов исчерпан — сохраните черновик и отправьте завтра'})
            status = 'moderate'
            count_day = True
    else:
        # правка уже отправленного: без прав — снова на модерацию
        status = post.status if rules.can_change_any(user) else 'moderate'

    if creating:
        post = Post(author=user, post_type='post' if v['kind'] == 'blog' else v['kind'], status=status)
        if v['review_of'] is not None:
            post.review_of = v['review_of']
    else:
        post.status = status
    created.update(_store_uploads(v['uploads']))
    post.title = v['title']
    post.content = _put_uploads(v['content'], created)
    post.preview = v['preview']
    if v['ear'] is not None:
        post.ear = v['ear']
    post.site = v['site']
    if v['gallery_type']:
        post.gallery_type = v['gallery_type']

    # дата: черновик и первая отправка черновика — «сейчас» (как change_post), отложенная — своя
    if v['delay'] is not None:
        post.date = v['delay']
        post._delay = True
    elif creating or status == 'draft' or was_draft:
        post.date = tz.now()

    post.censor()  # как create_post / change_post (сейчас: истории — только на Альтерлите)

    # флаги для Post.save() и сигналов — как в create_post / change_post
    if editor or rules.can_change_any(user):
        post._from_admin_form = True
    post._content_length = v['length']
    post._Post__change_post = True
    if creating:
        post._Post__created_signal = True
    post.save()

    post.category.set(Category.objects.filter(id__in=v['categories']))
    post.images.set([*v['images'], *created.values()])
    _set_tags(post, v['genres'])

    if count_day and not creating:
        # черновик → модерация: как change_post. Новую публикацию считает сигнал post_post_save.
        user.profile.set_meta('day_posts_count', rules.day_count(user) + 1)

    return post, _message(post, creating), {k: _image_json(img) for k, img in created.items()}


def _message(post, creating):
    if post.status == 'draft':
        return 'Черновик сохранён'
    if post.status == 'moderate':
        if creating:
            return 'Ваша публикация попала на модерацию. В ближайшее время мы обработаем её и уведомим вас о своём решении!'
        return 'Изменения сохранены и ожидают модерации'
    if getattr(post, '_delay', False):
        return 'Публикация запланирована'
    return 'Ваш текст опубликован!' if creating else 'Публикация сохранена'


# ── 5. api/editor/items.py ────────────────────────────────────────────────────
"""JSON редактора — только данные."""
import html

from django.utils.html import strip_tags

from api.editor import rules


def post(p):
    """Публикация для правки: всё, что заполняет форму."""
    blog = rules.blog_category_id()
    cat_ids = list(p.category.values_list('id', flat=True))
    known = set(rules.genres())
    return {
        'id': p.id,
        'url': p.get_url(),
        'post_type': 'blog' if p.post_type == 'post' and blog in cat_ids else p.post_type,
        'status': p.status,
        'title': html.unescape(strip_tags(p.title or '')),
        # текст как есть: редактор сам разбирает разметку старого редактора (gl-wrap, details, …)
        'content': p.content or '',
        'preview': p.preview or '',
        'ear': p.ear or '',
        'site': p.site,
        'date': p.date.strftime('%Y-%m-%dT%H:%M:%S') if p.date else None,
        'categories': cat_ids,
        'genres': [t for t in p.tags.values_list('title', flat=True) if t in known],
        'gallery_type': p.gallery_type or '',
        'review_of': ({'id': p.review_of_id, 'title': html.unescape(strip_tags(p.review_of.title or '')),
                       'url': p.review_of.get_url()} if p.review_of_id else None),
    }


def draft(p):
    return {'id': p.id, 'title': html.unescape(strip_tags(p.title or '')), 'date': p.date.strftime('%Y-%m-%dT%H:%M:%S')}


# ── 6. api/editor/views.py ────────────────────────────────────────────────────
import json
import logging

from django.contrib.admin.models import DELETION, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.utils.html import escape
from rest_framework.authentication import SessionAuthentication
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from blog.models import Notification, Post

from api.editor import items, rules
from api.editor.service import Invalid, save_post

logger = logging.getLogger(__name__)

def _mode(request):
    return getattr(request, 'mode', 'alterlit')


def _denied(ex):
    return Response({'detail': ex.message, 'blocked': ex.as_json()}, status=ex.status)


def _invalid(ex):
    return Response({'detail': str(ex), 'errors': ex.errors}, status=400)


def _body(request):
    """Публикация приходит multipart: data — JSON, image_<ключ> — файлы новых фото.
    (JSON без файлов тоже принимается.) → (данные, {ключ: файл})"""
    if 'data' in request.data and isinstance(request.data.get('data'), str):
        try:
            data = json.loads(request.data['data'])
        except ValueError:
            data = {}
    else:
        data = request.data
    files = {name[len('image_'):]: f for name, f in request.FILES.items() if name.startswith('image_')}
    return (data if isinstance(data, dict) else {}), files


def _drafts_count(user):
    return Post.objects.filter(author=user, status='draft').count()


class Base(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]


class Config(Base):
    """
    GET /api/v1/editor/config/?post_type=post|review|blog[&review_of=<id>][&id=<id>]
        Всё, что нужно форме: права, лимиты, рубрики, жанры, миниатюры, рецензируемый пост.
        Писать сейчас нельзя (не активирован, нет псевдонима, лимит в сутки) — "blocked": {…},
        форма показывает заглушку с причиной. id — правка (для неё проверки новой не нужны).
    """

    def get(self, request):
        user, mode = request.user, _mode(request)
        q = request.query_params
        post_type = q.get('post_type') if q.get('post_type') in rules.POST_TYPES else 'post'
        editing = (q.get('id') or '').isdigit()
        editor = rules.is_editor(user)

        blocked = None
        review = None
        try:
            if not editing:
                rules.check_new(user, mode)
            if post_type == 'review' and q.get('review_of'):
                t = rules.check_review_target(q.get('review_of'))
                review = {'id': t.id, 'title': t.title, 'url': t.get_url()}
            elif post_type == 'review' and not editing:
                raise rules.Denied('review_of', 'Не указана публикация', 'Не указано, на какую публикацию рецензия.', status=400)
        except rules.Denied as ex:
            blocked = ex.as_json()

        profile = getattr(user, 'profile', None)
        avatar = getattr(profile, 'avatar', None)
        may_delay = rules.can_change_any(user) if editing else editor
        return Response({
            'user': {'id': user.id, 'username': user.username,
                     'name': (getattr(profile, 'nickname', '') or '').strip() or user.username,
                     'avatar': avatar.url if avatar else None},
            'is_editor': editor,
            'post_type': post_type,
            'blocked': blocked,
            'limits': rules.limits(),
            'categories': rules.categories(user) if post_type == 'post' else [],
            'genres': rules.genres() if post_type == 'post' else [],
            'genres_category': rules.GENRES_CATEGORY if post_type == 'post' else None,
            'gallery_types': rules.gallery_types() if editor and post_type == 'post' else [],
            'blog_category': rules.blog_category_id() if post_type == 'blog' else None,
            'review_of': review,
            'delay': rules.DELAY if may_delay else None,
            'drafts': _drafts_count(user),
            # тексты в сутки (не редакции): лимит posts_day_limit и сколько уже отправлено сегодня
            'day': None if editor else {'limit': rules.day_limit() or None, 'used': rules.day_count(user)},
            'mode': mode,
        })


class Posts(Base):
    """
    POST /api/v1/editor/posts/  multipart: data = {post_type, review_of, title, content, preview, ear, site,
                                 delay, categories, genres, gallery_type, draft}, image_<ключ> = файлы новых фото
        → 201 {"post": {...}, "message": "…", "drafts": N, "uploaded": {ключ: {id, src, thumb, preload}}};
          400 {"detail", "errors": {поле: текст}}
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        user, mode = request.user, _mode(request)
        data, files = _body(request)
        try:
            rules.check_new(user, mode)
        except rules.Denied as ex:
            # лимит в сутки не мешает сохранить черновик
            if not (ex.code == 'day_limit' and data.get('draft')):
                return _denied(ex)
        try:
            p, message, uploaded = save_post(user, data, mode, files=files)
        except Invalid as ex:
            return _invalid(ex)
        except Exception as ex:  # сигналы и save() старой модели сообщают причину текстом
            logger.warning('editor create: %s', ex, exc_info=True)
            return Response({'detail': ex.args[0] if ex.args else 'Не удалось сохранить публикацию'}, status=400)
        return Response({'post': items.post(p), 'message': message, 'drafts': _drafts_count(user), 'uploaded': uploaded},
                        status=201)


class PostDetail(Base):
    """
    GET    /api/v1/editor/posts/<id>/  — публикация для правки
    PUT    /api/v1/editor/posts/<id>/  — сохранить (тело как у создания) → {"post", "message", "drafts", "uploaded"}
    DELETE /api/v1/editor/posts/<id>/  — удалить черновик → {"drafts": N}
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _get(self, request, pk):
        p = Post.objects.select_related('review_of').filter(id=pk).first()
        if p is None:
            raise rules.Denied('not_found', 'Публикация не найдена', 'Публикация не найдена', status=404)
        rules.check_edit(request.user, p, _mode(request))
        return p

    def get(self, request, pk):
        try:
            return Response(items.post(self._get(request, pk)))
        except rules.Denied as ex:
            return _denied(ex)

    def put(self, request, pk):
        try:
            p = self._get(request, pk)
            data, files = _body(request)
            p, message, uploaded = save_post(request.user, data, _mode(request), post=p, files=files)
        except rules.Denied as ex:
            return _denied(ex)
        except Invalid as ex:
            return _invalid(ex)
        except Exception as ex:
            logger.warning('editor update %s: %s', pk, ex, exc_info=True)
            return Response({'detail': ex.args[0] if ex.args else 'Не удалось сохранить публикацию'}, status=400)
        return Response({'post': items.post(p), 'message': message, 'drafts': _drafts_count(request.user),
                         'uploaded': uploaded})

    def delete(self, request, pk):
        try:
            p = self._get(request, pk)
        except rules.Denied as ex:
            return _denied(ex)
        if p.status != 'draft':
            return Response({'detail': 'Удалить можно только черновик'}, status=400)
        if p.author_id != request.user.id:
            # как delete-post: автору — уведомление, что черновик удалил модератор
            Notification.send_notif(p.author, 'Ваш черновик "{}" был удалён модератором <b><a href="{}">{}</a></b>'.format(
                escape(p.title), request.user.get_url(), escape(request.user.get_name())))
        # журнал админки, как delete-post (action_flag=3 — удаление)
        LogEntry.objects.create(user=request.user, action_flag=DELETION, object_repr=str(p)[:200],
                                content_type=ContentType.objects.get_for_model(Post), object_id=str(p.pk))
        p.delete()
        return Response({'drafts': _drafts_count(request.user)})


class Drafts(Base):
    """GET /api/v1/editor/drafts/ — свои черновики, новые сверху → {"drafts": [{id, title, date}]}"""

    def get(self, request):
        qs = Post.objects.filter(author=request.user, status='draft').only('id', 'title', 'date').order_by('-date', '-id')
        return Response({'drafts': [items.draft(p) for p in qs[:100]]})


# ── 7. api/editor/urls.py ─────────────────────────────────────────────────────
from django.urls import path

from api.editor import views

# в api/urls.py: path('editor/', include('api.editor.urls')),
urlpatterns = [
    path('config/', views.Config.as_view(), name='editor-config'),
    path('posts/', views.Posts.as_view(), name='editor-posts'),
    path('posts/<int:pk>/', views.PostDetail.as_view(), name='editor-post'),
    path('drafts/', views.Drafts.as_view(), name='editor-drafts'),
]


# ── 8. api/urls.py (общий файл API, /api/v1/…) ─────────────────────────────────
#     path('editor/', include('api.editor.urls')),


# ── 9. Страница редактора: templates/post_editor.html (новый файл) ─────────────
# Отдельная страница без шапки и сайдбара сайта — у острова своя верхняя панель.
#
# {% load static %}<!doctype html>
# <html lang="ru">
# <head>
#   <meta charset="utf-8">
#   <meta name="viewport" content="width=device-width, initial-scale=1">
#   <title>{% if request.resolver_match.kwargs.post_id == "edit" %}Редактирование{% else %}Новая публикация{% endif %} — Альтерлит</title>
#   {% if request.mode == "alterlit" %}
#   <link type="image/x-icon" rel="shortcut icon" href="{% static 'img/favicon_al.ico' %}">
#   <link type="image/png" sizes="16x16" rel="icon" href="{% static 'img/favicon_al.png' %}">
#   <link type="image/png" sizes="32x32" rel="icon" href="{% static 'img/favicon_al_32.png' %}">
#   <link type="image/png" sizes="120x120" rel="icon" href="{% static 'img/favicon_al_120.png' %}">
#   {% else %}
#   <link type="image/x-icon" rel="shortcut icon" href="{% static 'img/favicon.ico' %}">
#   <link type="image/png" sizes="16x16" rel="icon" href="{% static 'img/favicon.png' %}">
#   <link type="image/png" sizes="32x32" rel="icon" href="{% static 'img/favicon_32.png' %}">
#   <link type="image/png" sizes="96x96" rel="icon" href="{% static 'img/favicon_96.png' %}">
#   <link type="image/png" sizes="120x120" rel="icon" href="{% static 'img/favicon_120.png' %}">
#   {% endif %}
#   <link rel="preconnect" href="https://fonts.googleapis.com">
#   <link href="https://fonts.googleapis.com/css2?family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">
#   <link rel="stylesheet" href="/assets/post_editor/post_editor.css?v=1">
#   <style>body{margin:0;background:#f5f0e5}</style>
# </head>
# <body>
#   <div id="alterlit-editor" data-csrf="{{ csrf_token }}"></div>
#   <script type="module" src="/assets/post_editor/post_editor.js?v=1"></script>
# </body>
# </html>


# ── 10. blog/views.py, post_api — новый редактор сначала только у вас ───────────
# В начале веток GET "new" и GET "edit" (после проверки авторизации):
#
#     if request.user.id == 1:
#         return render(request, "post_editor.html")
#
# Остальное старое остаётся как есть. Адреса те же: /post/new/, /post/new/?post_type=review&review_of=<id>,
# /post/new/?post_type=blog, /post/edit/?id=<id>.
