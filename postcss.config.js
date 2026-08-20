import tailwindcss from "@tailwindcss/postcss";
import mediaMinmax from "./postcss/media-minmax.js";

export default {
  plugins: [
    // Tailwind first — the rewrite below works on what it emits.
    tailwindcss(),

    // Tailwind 4 writes `@media (width>=1024px)`, which Safari before 16.4
    // cannot parse and so drops entirely, taking every responsive utility with
    // it. See postcss/media-minmax.js.
    mediaMinmax(),
  ],
};
