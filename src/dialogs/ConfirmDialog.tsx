import Dialog from './Dialog';

/** Подтверждение: «Отправить на модерацию?», «Удалить черновик?», «Уйти без сохранения?» */
export default function ConfirmDialog({
  title,
  text,
  confirm,
  cancel = 'Вернуться',
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  text: React.ReactNode;
  confirm: string;
  cancel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="pe-btn pe-btn-ghost" onClick={onClose} disabled={busy}>
            {cancel}
          </button>
          <button
            type="button"
            className={`pe-btn ${danger ? 'pe-btn-danger' : 'pe-btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? <span className="pe-spinner" aria-hidden="true" /> : null}
            {confirm}
          </button>
        </>
      }
    >
      <p className="pe-d-text">{text}</p>
    </Dialog>
  );
}
