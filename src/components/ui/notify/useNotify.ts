import { useContext } from "react";
import { NotifyContext } from "./NotifyContext";
import type { NotifyApi } from "./types";

/** Toasts and confirm dialogs, styled to match the rest of the admin. */
export function useNotify(): NotifyApi {
  const api = useContext(NotifyContext);
  if (!api) {
    throw new Error("useNotify must be used inside <NotifyProvider>.");
  }
  return api;
}
