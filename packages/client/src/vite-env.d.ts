/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional WebSocket URL of a separately hosted server (e.g. `wss://host/ws`). */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
