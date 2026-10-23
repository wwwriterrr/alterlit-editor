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
