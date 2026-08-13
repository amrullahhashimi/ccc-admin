import { createContext } from "react";
import type { NotifyApi } from "./types";

export const NotifyContext = createContext<NotifyApi | null>(null);
