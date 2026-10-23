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

