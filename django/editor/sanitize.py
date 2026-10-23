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
