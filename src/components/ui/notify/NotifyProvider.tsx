import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { alertIcons, alertVariantClasses } from "../alert/variants";
import { NotifyContext } from "./NotifyContext";
import { setNotifyBridge } from "./bridge";
import type {
  ConfirmOptions,
  NotifyApi,
  NotifyVariant,
  PromptOptions,
  Toast,
  ToastOptions,
} from "./types";

/** Errors linger — people need a moment to read what went wrong. */
const DEFAULT_DURATION: Record<NotifyVariant, number> = {
  success: 4000,
  info: 4500,
  warning: 6000,
  error: 7000,
};

/** Only one dialog is ever on screen, so a single slot is enough. */
type Dialog =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

let nextToastId = 1;

export function NotifyProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (variant: NotifyVariant, title: string, options?: ToastOptions) => {
      const id = nextToastId++;
      const duration = options?.duration ?? DEFAULT_DURATION[variant];
      setToasts((current) => [
        ...current.slice(-3), // keep the stack from taking over the screen
        { id, variant, title, message: options?.message, duration },
      ]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
    },
    [dismiss]
  );

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setDialog({ kind: "confirm", options, resolve });
      }),
    []
  );

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setDialog({ kind: "prompt", options, resolve });
      }),
    []
  );

  const closeDialog = useCallback((value: boolean | string | null) => {
    setDialog((current) => {
      if (!current) return null;
      if (current.kind === "confirm") current.resolve(value === true);
      else current.resolve(typeof value === "string" ? value : null);
      return null;
    });
  }, []);

  const api = useMemo<NotifyApi>(
    () => ({
      success: (title, options) => push("success", title, options),
      error: (title, options) => push("error", title, options),
      warning: (title, options) => push("warning", title, options),
      info: (title, options) => push("info", title, options),
      confirm,
      prompt,
    }),
    [push, confirm, prompt]
  );

  // Let plain helper modules (print jobs, label printing) raise toasts too.
  useEffect(() => {
    setNotifyBridge(api);
    return () => setNotifyBridge(null);
  }, [api]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return (
    <NotifyContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed right-4 top-4 z-999999 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3 sm:right-6 sm:top-6">
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>,
        document.body
      )}
      {dialog?.kind === "confirm" && (
        <ConfirmDialog options={dialog.options} onAnswer={closeDialog} />
      )}
      {dialog?.kind === "prompt" && (
        <PromptDialog options={dialog.options} onAnswer={closeDialog} />
      )}
    </NotifyContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const styles = alertVariantClasses[toast.variant];
  return (
    <div
      role="status"
      className={`toast-enter pointer-events-auto rounded-xl border p-4 shadow-theme-lg ${styles.container}`}
    >
      <div className="flex items-start gap-3">
        <div className={`-mt-0.5 shrink-0 ${styles.icon}`}>
          {alertIcons[toast.variant]}
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {toast.title}
          </h4>
          {toast.message && (
            <p className="mt-1 text-sm break-words text-gray-500 dark:text-gray-400">
              {toast.message}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-white/90"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** The shared frame: backdrop, card, Escape and click-outside handling. */
function DialogShell({
  onCancel,
  children,
}: {
  onCancel: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-999999 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Catches clicks outside the card, but stays fully see-through —
          no tint, no blur, so the page behind reads normally. */}
      <div className="fixed inset-0 h-full w-full" onClick={onCancel} />
      <div className="toast-enter relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xl dark:border-gray-800 dark:bg-gray-900">
        {children}
      </div>
    </div>,
    document.body
  );
}

const cancelButtonClass =
  "rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 transition hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03] dark:hover:text-gray-300";

function ConfirmDialog({
  options,
  onAnswer,
}: {
  options: ConfirmOptions;
  onAnswer: (value: boolean) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const variant = options.variant ?? "warning";
  const styles = alertVariantClasses[variant];

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  const cancel = useCallback(() => onAnswer(false), [onAnswer]);

  return (
    <DialogShell onCancel={cancel}>
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${styles.container} ${styles.icon}`}
        >
          {alertIcons[variant]}
        </div>
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
            {options.title}
          </h4>
          {options.message && (
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
              {options.message}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={cancel} className={cancelButtonClass}>
          {options.cancelText ?? "Cancel"}
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={() => onAnswer(true)}
          className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs transition ${
            variant === "error"
              ? "bg-error-500 hover:bg-error-600"
              : "bg-brand-500 hover:bg-brand-600"
          }`}
        >
          {options.confirmText ?? "Confirm"}
        </button>
      </div>
    </DialogShell>
  );
}

function PromptDialog({
  options,
  onAnswer,
}: {
  options: PromptOptions;
  onAnswer: (value: string | null) => void;
}) {
  const [value, setValue] = useState(options.defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const cancel = useCallback(() => onAnswer(null), [onAnswer]);

  return (
    <DialogShell onCancel={cancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAnswer(value.trim() ? value : null);
        }}
      >
        <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
          {options.title}
        </h4>
        {options.message && (
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
            {options.message}
          </p>
        )}

        <label className="mt-5 mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          {options.label}
        </label>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800"
        />

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={cancel} className={cancelButtonClass}>
            {options.cancelText ?? "Cancel"}
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            {options.confirmText ?? "Save"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
