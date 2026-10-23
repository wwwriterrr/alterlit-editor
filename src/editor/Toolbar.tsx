import { useEffect, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import * as Ic from '../icons';
import { FONT_FAMILIES, FONT_SIZES } from './extensions';
import { pickImages } from './galleryBus';
import EmojiPicker from './EmojiPicker';

const BLOCKS = [
  { value: 'p', label: 'Абзац' },
  { value: 'h2', label: 'Заголовок 2' },
  { value: 'h3', label: 'Заголовок 3' },
  { value: 'h4', label: 'Заголовок 4' },
  { value: 'pre', label: 'Pre' },
] as const;

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

export default function Toolbar({ editor, isEditor, onLink }: { editor: Editor; isEditor: boolean; onLink: () => void }) {
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 2 })
        ? 'h2'
        : e.isActive('heading', { level: 3 })
          ? 'h3'
          : e.isActive('heading', { level: 4 })
            ? 'h4'
            : e.isActive('pre')
              ? 'pre'
              : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      sup: e.isActive('superscript'),
      sub: e.isActive('subscript'),
      align: (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      font: (e.getAttributes('textStyle').fontFamily as string | undefined) ?? '',
      size: (e.getAttributes('textStyle').fontSize as string | undefined) ?? '',
    }),
  });

  const c = () => editor.chain().focus();
  const setBlock = (v: string) => {
    if (v === 'p') c().setParagraph().run();
    else if (v === 'pre') c().setNode('pre').run();
    else c().setHeading({ level: Number(v[1]) as 2 | 3 | 4 }).run();
  };

  const addPhotos = async () => {
    const images = await pickImages([]);
    if (images?.length) editor.chain().focus().insertGallery({ images, caption: '' }).run();
  };

  return (
    <div className="pe-toolbar" role="toolbar" aria-label="Оформление текста">
      <Group>
        <Btn label={`Отменить (${mod}+Z)`} onClick={() => c().undo().run()} disabled={!st.canUndo}>
          <Ic.Undo />
        </Btn>
        <Btn label={`Повторить (${mod}+Shift+Z)`} onClick={() => c().redo().run()} disabled={!st.canRedo}>
          <Ic.Redo />
        </Btn>
      </Group>

      <Group>
        <label className="pe-select" title="Тип блока">
          <select value={st.block} onChange={(e) => setBlock(e.target.value)} aria-label="Тип блока">
            {BLOCKS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <Ic.Chevron />
        </label>
        {isEditor ? (
          <>
            <label className="pe-select pe-select-font" title="Шрифт">
              <select
                value={st.font}
                aria-label="Шрифт"
                onChange={(e) => (e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run())}
              >
                <option value="">Шрифт</option>
                {FONT_FAMILIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <Ic.Chevron />
            </label>
            <label className="pe-select pe-select-size" title="Размер">
              <select
                value={st.size}
                aria-label="Размер шрифта"
                onChange={(e) => (e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run())}
              >
                <option value="">Размер</option>
                {FONT_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('px', '')}
                  </option>
                ))}
              </select>
              <Ic.Chevron />
            </label>
          </>
        ) : null}
      </Group>

      <Group>
        <Btn label={`Жирный (${mod}+B)`} active={st.bold} onClick={() => c().toggleBold().run()}>
          <Ic.Bold />
        </Btn>
        <Btn label={`Курсив (${mod}+I)`} active={st.italic} onClick={() => c().toggleItalic().run()}>
          <Ic.Italic />
        </Btn>
        <Btn label={`Подчёркнутый (${mod}+U)`} active={st.underline} onClick={() => c().toggleUnderline().run()}>
          <Ic.Underline />
        </Btn>
        <Btn label="Зачёркнутый" active={st.strike} onClick={() => c().toggleStrike().run()}>
          <Ic.Strike />
        </Btn>
        <Btn label="Верхний индекс" active={st.sup} onClick={() => c().toggleSuperscript().run()}>
          <Ic.Sup />
        </Btn>
        <Btn label="Нижний индекс" active={st.sub} onClick={() => c().toggleSubscript().run()}>
          <Ic.Sub />
        </Btn>
      </Group>

      <Group>
        <Btn label="По левому краю" active={st.align === 'left'} onClick={() => c().setTextAlign('left').run()}>
          <Ic.AlignLeft />
        </Btn>
        <Btn label="По центру" active={st.align === 'center'} onClick={() => c().setTextAlign('center').run()}>
          <Ic.AlignCenter />
        </Btn>
        <Btn label="По правому краю" active={st.align === 'right'} onClick={() => c().setTextAlign('right').run()}>
          <Ic.AlignRight />
        </Btn>
        <Btn label="По ширине" active={st.align === 'justify'} onClick={() => c().setTextAlign('justify').run()}>
          <Ic.AlignJustify />
        </Btn>
      </Group>

      <Group>
        <Btn label="Уменьшить отступ (Shift+Tab)" onClick={() => c().outdent().run()}>
          <Ic.Outdent />
        </Btn>
        <Btn label="Увеличить отступ (Tab)" onClick={() => c().indent().run()}>
          <Ic.Indent />
        </Btn>
        <Btn label="Маркированный список" active={st.bullet} onClick={() => c().toggleBulletList().run()}>
          <Ic.ListBullet />
        </Btn>
        <Btn label="Нумерованный список" active={st.ordered} onClick={() => c().toggleOrderedList().run()}>
          <Ic.ListOrdered />
        </Btn>
        <Btn label="Цитата" active={st.quote} onClick={() => c().toggleBlockquote().run()}>
          <Ic.Quote />
        </Btn>
      </Group>

      <Group>
        <Btn label={`Ссылка (${mod}+K)`} active={st.link} onClick={onLink}>
          <Ic.Link />
        </Btn>
        <Btn label="Фото и галерея" onClick={addPhotos} wide>
          <Ic.Photo />
          <span>Фото</span>
        </Btn>
        <Btn label="Скрытый текст «Читать далее»" onClick={() => c().wrapInHiddenText().run()}>
          <Ic.Hidden />
        </Btn>
        <EmojiButton onPick={(e) => c().insertContent(e).run()} />
      </Group>
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="pe-tgroup">{children}</div>;
}

function Btn({
  label,
  active,
  disabled,
  wide,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  wide?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`pe-tbtn${wide ? ' pe-tbtn-wide' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      // фокус остаётся в тексте: выделение не теряется
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function EmojiButton({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="pe-popwrap" ref={ref}>
      <Btn label="Эмодзи" active={open} onClick={() => setOpen((o) => !o)}>
        <Ic.Smile />
      </Btn>
      {open ? (
        <div className="pe-pop pe-pop-emoji">
          <EmojiPicker
            onPick={(e) => {
              onPick(e);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
