import { dismissToast, useToasts } from '../../lib/toastStore'

export function Toaster() {
  const toasts = useToasts()
  return (
    <div className="toaster" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast tone-${toast.tone}`} role="status">
          <div>
            <p className="toast-title">{toast.title}</p>
            {toast.message && <p className="toast-text">{toast.message}</p>}
          </div>
          <button type="button" className="toast-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
