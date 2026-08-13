export type NotifyVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: number;
  variant: NotifyVariant;
  title: string;
  message?: string;
  /** Milliseconds before the toast fades on its own. 0 keeps it until dismissed. */
  duration: number;
}

export interface ToastOptions {
  message?: string;
  duration?: number;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** "error" paints the confirm button red — use it for anything destructive. */
  variant?: NotifyVariant;
}

export interface PromptOptions {
  title: string;
  /** Sits above the field — this app never puts hint text inside inputs. */
  label: string;
  message?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

export interface NotifyApi {
  success: (title: string, options?: ToastOptions) => void;
  error: (title: string, options?: ToastOptions) => void;
  warning: (title: string, options?: ToastOptions) => void;
  info: (title: string, options?: ToastOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Resolves to the typed text, or null if the person backed out. */
  prompt: (options: PromptOptions) => Promise<string | null>;
}
