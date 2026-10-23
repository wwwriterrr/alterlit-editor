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


def _store_uploads(user, uploads):
    """Новые фото → PostImages (save() сам уменьшает файл и запоминает размеры). → {ключ: картинка}"""
    created = {}
    for key, f in uploads:
        img = PostImages(image=f, user=user)
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
    created.update(_store_uploads(user, v['uploads']))
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
