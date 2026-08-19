import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  useEffect,
  useRef,
} from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-600',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:bg-white',
    danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:bg-red-600',
  };
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 ${props.className ?? ''}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors hover:border-slate-400 focus:border-brand-500 ${props.className ?? ''}`}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card ${className}`}>{children}</div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const ALERT_ICON = (
  <svg
    aria-hidden="true"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className="mt-0.5 h-4 w-4 flex-shrink-0"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M10 6.5v4M10 13.5h.008M8.6 3.4 1.9 15.2c-.5.9.1 2 1.2 2h13.8c1.1 0 1.7-1.1 1.2-2L11.4 3.4c-.55-.95-1.85-.95-2.4 0Z"
    />
  </svg>
);

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-3 flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
      {ALERT_ICON}
      <span>{message}</span>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Latest onClose in a ref so the keydown listener always calls the
  // current handler without re-subscribing (and re-focusing) on every
  // render - `onClose` is typically a fresh inline function each render,
  // and re-running this effect on every keystroke inside the modal would
  // steal focus back to the close button mid-typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-popover"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span className="tabular-nums">
        {total} نتيجة - صفحة {page} من {totalPages}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          السابق
        </Button>
        <Button variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          التالي
        </Button>
      </div>
    </div>
  );
}

const BADGE_STYLES = {
  neutral: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-700',
} as const;

export function Badge({
  children,
  variant = 'neutral',
  className = '',
}: {
  children: ReactNode;
  variant?: keyof typeof BADGE_STYLES;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE_STYLES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
