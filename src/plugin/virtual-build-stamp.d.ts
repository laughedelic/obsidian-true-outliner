/**
 * The build stamp, injected at compile time by scripts/build.ts's
 * `stampPlugin`. Baked into the bundle rather than read from manifest.json,
 * which Obsidian caches at plugin-scan time and never re-reads on reload — see
 * that plugin's own comment, and docs/research/open-questions Q27.
 */
declare module 'virtual:build-stamp' {
  export const BUILD_STAMP:
    | {
        /** A non-production build, or one esbuild was passed `--dev`. Dev-only
         * UI is opt-IN, so a plain `npm run build` — what the release pipeline
         * runs — cannot ship it. */
        readonly dev: true;
        /** `<short-sha>` or `<short-sha>-dirty`. */
        readonly buildId: string;
        /** Wall-clock HH:MM:SS at build time. */
        readonly clock: string;
        /** Subject of the commit at HEAD. */
        readonly subject: string;
        /** Recently-modified uncommitted source files, or a "none" message. */
        readonly changedSummary: string;
        readonly versionSuffix: string;
      }
    /** A release build names only its kind, so that rebuilding a commit
     * reproduces its published bundle byte for byte. */
    | { readonly dev: false };
}
