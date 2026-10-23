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


def _exc_text(ex):
    """Текст исключения старой модели для пользователя; ошибки БД (кортеж кодов) — общим текстом."""
    msg = ex.args[0] if ex.args else None
    return msg if isinstance(msg, str) and msg else 'Не удалось сохранить публикацию'


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
            return Response({'detail': _exc_text(ex)}, status=400)
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
            return Response({'detail': _exc_text(ex)}, status=400)
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
