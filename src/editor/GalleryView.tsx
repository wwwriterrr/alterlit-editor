import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import type { GalleryAttrs } from './extensions';
import { pickImages } from './galleryBus';

/**
 * Галерея в тексте: превью картинок по порядку, подпись, «Изменить» (окно выбора с уже
 * отмеченными), «Удалить». Перетаскивается целиком за ручку.
 */
export default function GalleryView({ node, updateAttributes, deleteNode, selected, editor }: NodeViewProps) {
  const { images, caption } = node.attrs as GalleryAttrs;
  const editable = editor.isEditable;

  const edit = async () => {
    const next = await pickImages(images);
    if (!next) return;
    if (next.length) updateAttributes({ images: next });
    else deleteNode();
  };

  return (
    <NodeViewWrapper className="pe-gallery" data-selected={selected || undefined} data-count={images.length}>
      <div className="pe-gallery-bar" contentEditable={false}>
        <span className="pe-gallery-drag" data-drag-handle title="Перетащить" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="9" cy="6" r="1.6" />
            <circle cx="15" cy="6" r="1.6" />
            <circle cx="9" cy="12" r="1.6" />
            <circle cx="15" cy="12" r="1.6" />
            <circle cx="9" cy="18" r="1.6" />
            <circle cx="15" cy="18" r="1.6" />
          </svg>
        </span>
        <span className="pe-gallery-label">
          {images.length === 1 ? 'Фото' : `Галерея · ${images.length} фото`}
        </span>
        {editable ? (
          <>
            <button type="button" className="pe-chip" onClick={edit}>
              Изменить
            </button>
            <button type="button" className="pe-chip pe-chip-danger" onClick={() => deleteNode()} aria-label="Удалить галерею">
              Удалить
            </button>
          </>
        ) : null}
      </div>
      <div className="pe-gallery-grid" contentEditable={false} onDoubleClick={editable ? edit : undefined}>
        {images.map((img, i) => (
          <figure key={`${img.id}-${i}`} className="pe-gallery-item">
            <img src={img.thumb || img.src} alt="" draggable={false} loading="lazy" />
            {images.length > 1 ? <span className="pe-gallery-num">{i + 1}</span> : null}
          </figure>
        ))}
      </div>
      <input
        className="pe-gallery-caption"
        value={caption}
        placeholder="Подпись к фото (необязательно)"
        maxLength={300}
        disabled={!editable}
        onChange={(e) => updateAttributes({ caption: e.target.value })}
        // Enter в подписи не должен уходить в редактор
        onKeyDown={(e) => e.stopPropagation()}
      />
    </NodeViewWrapper>
  );
}
