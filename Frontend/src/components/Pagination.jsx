import styles from '../styles/pagination.module.css';

export default function Pagination({ page, setPage, totalPages, disabled }) {
  return (
    <div className={styles.row}>
      <button
        className={styles.btn}
        disabled={page <= 1 || disabled}
        onClick={() => setPage(p => Math.max(1, p - 1))}
      >
        ‹ Prev
      </button>

      <div className={styles.info}>
        Page
        <input
          className={styles.input}
          type="number"
          min={1}
          max={totalPages}
          value={page}
          onChange={(e) => setPage(
            Math.min(Math.max(1, Number(e.target.value || 1)), totalPages)
          )}
        />
        of {totalPages}
      </div>

      <button
        className={styles.btn}
        disabled={page >= totalPages || disabled}
        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
      >
        Next ›
      </button>
    </div>
  );
}
