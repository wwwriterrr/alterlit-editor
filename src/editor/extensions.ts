import { Extension, Node, mergeAttributes, type Extensions } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import GalleryView from './GalleryView';
import RawHtmlView from './RawHtmlView';
import { hasUpload, uploadUrl } from '../uploads';

/**
 * Разметка текста — та же, что сохранял старый редактор (TinyMCE), чтобы страница поста,
 * лента и старые публикации жили без переделок:
 *   подзаголовки  <h2 class="post-title-2">, <h3 class="post-title-3">, <h4>
 *   «Pre»         <pre> (без <code>)
 *   отступ        style="padding-left: 40px" (по 40px за шаг)
 *   выравнивание  style="text-align: …"
 *   галерея       <div class="gl-wrap" data-items="N" contenteditable="false">
 *                   [<div class="gl-descr">подпись</div>]
 *                   <div class="gl-items cs-hidden"><img class="gl-item" id="post_image-ID" src data-thumb data-preload>…
 *   скрытый текст <details><summary>Читать далее</summary><div class="details-body">…</div></details>
 *   шорткоды      /*vote-N*\/ и т. п. — обычный текст, как раньше
 * Всё, чего редактор не знает (старые media-block, iframe, таблицы…), — блок «как есть»:
 * его можно удалить или передвинуть, но содержимое не меняется и не теряется.
 */

const INDENT_STEP = 40;
const INDENT_MAX = 8;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: { indent: () => ReturnType; outdent: () => ReturnType };
    gallery: { insertGallery: (attrs: GalleryAttrs) => ReturnType };
    hiddenText: { wrapInHiddenText: () => ReturnType };
  }
}

/** Отступ абзаца и подзаголовка — padding-left, как у кнопок «отступ» TinyMCE. */
const Indent = Extension.create({
  name: 'indent',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => Math.min(INDENT_MAX, Math.round((parseInt(el.style.paddingLeft, 10) || 0) / INDENT_STEP)),
            renderHTML: (attrs) => (attrs.indent ? { style: `padding-left: ${attrs.indent * INDENT_STEP}px` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    const shift = (d: 1 | -1) => () =>
      ({ tr, state, dispatch }: { tr: import('@tiptap/pm/state').Transaction; state: import('@tiptap/pm/state').EditorState; dispatch?: unknown }) => {
        let changed = false;
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
          if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return;
          const next = Math.max(0, Math.min(INDENT_MAX, (node.attrs.indent || 0) + d));
          if (next !== node.attrs.indent) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
            changed = true;
          }
        });
        return changed && Boolean(dispatch);
      };
    return { indent: shift(1), outdent: shift(-1) };
  },
  addKeyboardShortcuts() {
    return {
      // Tab в списке — вложенность (это делает сам список), в абзаце — отступ
      Tab: () => (this.editor.isActive('listItem') ? false : this.editor.commands.indent()),
      'Shift-Tab': () => (this.editor.isActive('listItem') ? false : this.editor.commands.outdent()),
    };
  },
});

/** Подзаголовки с классами сайта: h2.post-title-2, h3.post-title-3. */
const SiteHeading = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const level = node.attrs.level as number;
    const cls = level === 2 || level === 3 ? `post-title-${level}` : null;
    return [`h${level}`, mergeAttributes(HTMLAttributes, cls ? { class: cls } : {}), 0];
  },
}).configure({ levels: [2, 3, 4] });

/** «Pre» — моноширинный блок без разметки, как block_formats старого редактора. */
const Pre = Node.create({
  name: 'pre',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  whitespace: 'pre',
  defining: true,
  parseHTML: () => [{ tag: 'pre', preserveWhitespace: 'full' }],
  renderHTML: ({ HTMLAttributes }) => ['pre', HTMLAttributes, 0],
});

// ── галерея ──────────────────────────────────────────────────────────────
export interface GalleryImageAttrs {
  /** id картинки на сервере; у новой, ещё не сохранённой — null */
  id: number | null;
  /** ключ нового фото (uploads.ts) — файл уйдёт при сохранении */
  upload: string | null;
  src: string;
  thumb: string;
  preload: string | null;
}
export interface GalleryAttrs {
  images: GalleryImageAttrs[];
  caption: string;
}

/** Старый редактор сохранял относительные пути (../../media/…) — приводим к /media/… */
export const fixSrc = (src: string | null) => (src ? src.replace(/^(\.\.\/)+/, '/') : '');
const nullable = (v: string | null) => (v && v !== 'undefined' && v !== 'null' ? v : null);

export const Gallery = Node.create({
  name: 'gallery',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      images: { default: [] as GalleryImageAttrs[] },
      caption: { default: '' },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div.gl-wrap',
        getAttrs: (el) => {
          const images = Array.from((el as HTMLElement).querySelectorAll('img.gl-item'))
            .map((img): GalleryImageAttrs => {
              const upload = img.getAttribute('data-upload');
              // новое фото — только пока файл в этом окне (после перезагрузки его уже нет)
              if (upload) return { id: null, upload: hasUpload(upload) ? upload : '', src: uploadUrl(upload), thumb: uploadUrl(upload), preload: null };
              return {
                id: Number(/post_image-(\d+)/.exec(img.id)?.[1]) || null,
                upload: null,
                src: fixSrc(img.getAttribute('src')),
                thumb: fixSrc(nullable(img.getAttribute('data-thumb')) || img.getAttribute('src')),
                preload: nullable(img.getAttribute('data-preload')),
              };
            })
            .filter((i) => i.id || i.upload);
          if (!images.length) return false;
          const caption = (el as HTMLElement).querySelector('.gl-descr')?.textContent?.trim() ?? '';
          return { images, caption };
        },
      },
    ];
  },
  renderHTML({ node }) {
    const { images, caption } = node.attrs as GalleryAttrs;
    return [
      'div',
      { class: 'gl-wrap', 'data-items': String(images.length), contenteditable: 'false' },
      ...(caption ? [['div', { class: 'gl-descr' }, caption]] : []),
      [
        'div',
        { class: 'gl-items cs-hidden' },
        ...images.map((i) =>
          i.upload
            ? // новое фото: сервер при сохранении подставит id, src и превью
              ['img', { class: 'gl-item', 'data-upload': i.upload, alt: '' }]
            : [
                'img',
                {
                  class: 'gl-item',
                  id: `post_image-${i.id}`,
                  src: i.src,
                  'data-thumb': i.thumb,
                  ...(i.preload ? { 'data-preload': i.preload } : {}),
                  alt: '',
                },
              ],
        ),
      ],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(GalleryView);
  },
  addCommands() {
    return {
      insertGallery:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent([{ type: this.name, attrs }, { type: 'paragraph' }]),
    };
  },
});

// ── скрытый текст «Читать далее» ─────────────────────────────────────────
export const HIDDEN_SUMMARY_DEFAULT = 'Читать далее';
/** Пустой заголовок скрытого блока на сайт не уходит — «Читать далее». */
export const fillEmptySummaries = (html: string) => html.replace(/<summary([^>]*)><\/summary>/g, `<summary$1>${HIDDEN_SUMMARY_DEFAULT}</summary>`);
const HiddenSummary = Node.create({
  name: 'hiddenSummary',
  content: 'text*',
  marks: 'bold italic',
  defining: true,
  isolating: true,
  parseHTML: () => [{ tag: 'summary' }, { tag: 'div.details__summary' }],
  renderHTML: ({ HTMLAttributes }) => ['summary', HTMLAttributes, 0],
});
const HiddenBody = Node.create({
  name: 'hiddenBody',
  content: 'block+',
  defining: true,
  isolating: true,
  parseHTML: () => [{ tag: 'div.details-body' }, { tag: 'div.details__content' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { class: 'details-body' }), 0],
});
export const HiddenText = Node.create({
  name: 'hiddenText',
  group: 'block',
  content: 'hiddenSummary hiddenBody',
  defining: true,
  isolating: true,
  // <details> сайта и старая заготовка редактора <div class="details">; тело без обёртки
  // (так сохранял старый редактор) парсер сам завернёт в hiddenBody
  parseHTML: () => [{ tag: 'details' }, { tag: 'div.details' }],
  renderHTML: ({ HTMLAttributes }) => ['details', HTMLAttributes, 0],
  // в редакторе — не <details>: браузер сворачивает его и прячет текст; сохраняется <details>
  addNodeView() {
    return ({ editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'pe-hidden';
      const bar = document.createElement('div');
      bar.className = 'pe-hidden-bar';
      bar.contentEditable = 'false';
      const label = document.createElement('span');
      label.className = 'pe-hidden-label';
      label.textContent = 'Скрытый текст: читатель увидит заголовок, остальное — по клику';
      const button = (text: string, cls: string, onClick: () => void) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = text;
        // фокус и выделение остаются в тексте
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', onClick);
        return b;
      };
      const range = () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (pos === undefined) return null;
        const node = editor.state.doc.nodeAt(pos);
        return node ? { from: pos, to: pos + node.nodeSize, node } : null;
      };
      // убрать скрытие: тело блока становится обычными абзацами на его месте
      const unwrap = button('Убрать скрытие', 'pe-chip', () => {
        const r = range();
        if (!r || !editor.isEditable) return;
        const body = r.node.child(1);
        editor.chain().focus().insertContentAt({ from: r.from, to: r.to }, body.content.toJSON()).run();
      });
      const remove = button('Удалить', 'pe-chip pe-chip-danger', () => {
        const r = range();
        if (!r || !editor.isEditable) return;
        editor.chain().focus().deleteRange({ from: r.from, to: r.to }).run();
      });
      bar.append(label, unwrap, remove);
      const content = document.createElement('div');
      content.className = 'pe-hidden-inner';
      dom.append(bar, content);
      return { dom, contentDOM: content };
    };
  },
  addCommands() {
    return {
      // выделенные абзацы — под «Читать далее»; без выделения — пустой блок
      wrapInHiddenText:
        () =>
        ({ state, chain }) => {
          const { from, to, empty } = state.selection;
          const slice = empty ? null : state.doc.slice(from, to).content.toJSON();
          const body = slice && slice.length ? slice : [{ type: 'paragraph' }];
          return chain()
            .insertContentAt(
              { from, to },
              {
                type: this.name,
                content: [
                  // заголовок пустой: подсказка «Читать далее», свой — по желанию (пустой сохранится как «Читать далее»)
                  { type: 'hiddenSummary' },
                  { type: 'hiddenBody', content: body },
                ],
              },
            )
            // курсор — в заголовок вставленного блока: можно сразу вписать свой
            .command(({ tr }) => {
              let at = -1;
              tr.doc.nodesBetween(Math.max(0, from - 2), Math.min(tr.doc.content.size, from + 2), (n, pos) => {
                if (at < 0 && n.type.name === 'hiddenText') at = pos;
                return at < 0;
              });
              if (at >= 0) tr.setSelection(TextSelection.create(tr.doc, at + 2));
              return true;
            })
            .run();
        },
    };
  },
});

// ── блок «как есть» ──────────────────────────────────────────────────────
/** Незнакомые редактору блоки старых публикаций — сохраняются байт в байт. */
export const RawHtml = Node.create({
  name: 'rawHtml',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  priority: 40,
  addAttributes() {
    return { html: { default: '' } };
  },
  parseHTML() {
    const raw = (el: HTMLElement | string) => ({ html: (el as HTMLElement).outerHTML });
    return [
      { tag: 'div.media-block', getAttrs: raw },
      { tag: 'iframe', getAttrs: raw },
      { tag: 'table', getAttrs: raw },
      { tag: 'video', getAttrs: raw },
      { tag: 'audio', getAttrs: raw },
      { tag: 'figure', getAttrs: raw },
      { tag: 'svg', getAttrs: raw },
      { tag: 'hr', getAttrs: raw },
    ];
  },
  renderHTML({ node }) {
    const t = document.createElement('template');
    t.innerHTML = node.attrs.html as string;
    const el = t.content.firstElementChild;
    return el ? { dom: el } : ['div'];
  },
  addNodeView() {
    return ReactNodeViewRenderer(RawHtmlView);
  },
});

export function editorExtensions({ placeholder, isEditor }: { placeholder: () => string; isEditor: boolean }): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: null, target: null },
      },
    }),
    SiteHeading,
    Pre,
    Indent,
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    Subscript,
    Superscript,
    Gallery,
    HiddenSummary,
    HiddenBody,
    HiddenText,
    RawHtml,
    // подсказка «Добавьте текст…» — только пока текст пустой; в пустом заголовке скрытого
    // блока — «Читать далее» (так он и сохранится)
    Placeholder.configure({
      placeholder: ({ editor, node }) =>
        node.type.name === 'hiddenSummary' ? HIDDEN_SUMMARY_DEFAULT : node.type.name === 'paragraph' && editor.isEmpty ? placeholder() : '',
      showOnlyCurrent: false,
      includeChildren: true,
    }),
    CharacterCount,
    // шрифт и размер — только редакции (как в старом редакторе)
    ...(isEditor ? [TextStyle, FontFamily, FontSize] : []),
  ];
}

export const FONT_FAMILIES = [
  { label: 'PT Serif', value: 'PT Serif,Helvetica,sans-serif' },
  { label: 'Open Sans', value: 'Open Sans,sans-serif' },
  { label: 'Open Sans Condensed', value: 'Open Sans Condensed,sans-serif' },
];
export const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '22px'];
