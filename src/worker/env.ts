export interface Env {
  PASSGEN: KVNamespace;
  ASSETS: Fetcher;
  /** 32 bytes en base64; cifra las credenciales guardadas en KV. */
  ENCRYPTION_KEY: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

export type AppEnv = { Bindings: Env };
