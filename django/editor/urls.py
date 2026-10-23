from django.urls import path

from api.editor import views

# в api/urls.py: path('editor/', include('api.editor.urls')),
urlpatterns = [
    path('config/', views.Config.as_view(), name='editor-config'),
    path('posts/', views.Posts.as_view(), name='editor-posts'),
    path('posts/<int:pk>/', views.PostDetail.as_view(), name='editor-post'),
    path('drafts/', views.Drafts.as_view(), name='editor-drafts'),
]
