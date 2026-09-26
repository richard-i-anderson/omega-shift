/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The high-score Worker, e.g. https://omega-shift-scores.<subdomain>.workers.dev. Unset: global scores are offline. */
  readonly VITE_SCORES_URL?: string;
}
