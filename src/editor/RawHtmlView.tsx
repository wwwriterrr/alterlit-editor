import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

/** Блок старой публикации, который редактор не умеет править: показываем как есть. */
export default function RawHtmlView({ node, deleteNode, selected, editor }: NodeViewProps) {
  return (
    <NodeViewWrapper className="pe-raw" data-selected={selected || undefined}>
      <div className="pe-raw-bar" contentEditable={false}>
        <span className="pe-gallery-drag" data-drag-handle aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="9" cy="6" r="1.6" />
            <circle cx="15" cy="6" r="1.6" />
            <circle cx="9" cy="12" r="1.6" />
            <circle cx="15" cy="12" r="1.6" />
            <circle cx="9" cy="18" r="1.6" />
            <circle cx="15" cy="18" r="1.6" />
          </svg>
        </span>
        <span className="pe-gallery-label">Блок из старого редактора — сохранится как есть</span>
        {editor.isEditable ? (
          <button type="button" className="pe-chip pe-chip-danger" onClick={() => deleteNode()}>
            Удалить
          </button>
        ) : null}
      </div>
      <div className="pe-raw-body" contentEditable={false} dangerouslySetInnerHTML={{ __html: node.attrs.html as string }} />
    </NodeViewWrapper>
  );
}
