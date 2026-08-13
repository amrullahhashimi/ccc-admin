import type { ConfirmOptions, NotifyApi, PromptOptions, ToastOptions } from "./types";

/**
 * Plain helper modules (print jobs, label printing) run outside React and can't
 * call the hook. The provider registers itself here so they can still raise a
 * proper toast instead of falling back to window.alert.
 */
let live: NotifyApi | null = null;

export function setNotifyBridge(api: NotifyApi | null) {
  live = api;
}

function toast(
  variant: "success" | "error" | "warning" | "info",
  title: string,
  options?: ToastOptions
) {
  if (live) {
    live[variant](title, options);
  } else {
    console.warn(`[notify] ${title}${options?.message ? ` — ${options.message}` : ""}`);
  }
}

export const notify = {
  success: (title: string, options?: ToastOptions) => toast("success", title, options),
  error: (title: string, options?: ToastOptions) => toast("error", title, options),
  warning: (title: string, options?: ToastOptions) => toast("warning", title, options),
  info: (title: string, options?: ToastOptions) => toast("info", title, options),
  confirm: (options: ConfirmOptions) =>
    live ? live.confirm(options) : Promise.resolve(false),
  prompt: (options: PromptOptions) =>
    live ? live.prompt(options) : Promise.resolve(null),
};
