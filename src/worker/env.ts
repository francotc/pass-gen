export interface Env {
  PASSGEN: KVNamespace;
  ASSETS: Fetcher;
  /** 32 bytes en base64; cifra las credenciales guardadas en KV. */
  ENCRYPTION_KEY: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Opcional: certificado del Pass Type ID subido con `wrangler mtls-certificate upload`. */
  APNS_CERT?: Fetcher;
}

export type AppEnv = { Bindings: Env };
