import Dialog from './Dialog';
import { useDraftsQuery } from '../api';
import { formatDate } from '../date';
import { Doc } from '../icons';

/** «Мои черновики» — открыть любой; текущий отмечен. */
export default function DraftsDialog({ current, onClose }: { current: number | null; onClose: () => void }) {
  return (
    <Dialog title="Мои черновики" onClose={onClose}>
      <DraftsList current={current} />
    </Dialog>
  );
}

/** Список черновиков со ссылками на правку — в диалоге и в окне «лимит на сегодня». */
export function DraftsList({ current = null }: { current?: number | null }) {
  const { data, isLoading, isError, refetch } = useDraftsQuery();
  const drafts = data?.drafts ?? [];
  return isLoading ? (
    <ul className="pe-drafts">
      {[0, 1, 2].map((i) => (
        <li key={i} className="pe-skel pe-skel-row" />
      ))}
    </ul>
  ) : isError ? (
    <p className="pe-notice pe-notice-error">
      Не удалось загрузить черновики.{' '}
      <button type="button" className="pe-link" onClick={() => refetch()}>
        Повторить
      </button>
    </p>
  ) : drafts.length === 0 ? (
    <p className="pe-d-text">Черновиков пока нет.</p>
  ) : (
    <ul className="pe-drafts">
      {drafts.map((d) => (
        <li key={d.id}>
          <a href={`/post/edit/?id=${d.id}`} aria-current={d.id === current ? 'page' : undefined}>
            <Doc />
            <span className="pe-drafts-title">{d.title || 'Без заголовка'}</span>
            <time dateTime={d.date}>{d.id === current ? 'открыт сейчас' : formatDate(d.date)}</time>
          </a>
        </li>
      ))}
    </ul>
  );
}
