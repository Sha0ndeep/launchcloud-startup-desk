/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL. Defaults to http://127.0.0.1:8000 when unset. */
  readonly VITE_API_BASE_URL?: string
  /** "true" enables the labeled frontend-only fixture client. */
  readonly VITE_USE_MOCK_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
