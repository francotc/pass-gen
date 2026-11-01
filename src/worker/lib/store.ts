import type { AppleSettings, GoogleSettings, ImageMeta, InstallEvent, NotificationRecord, Pass, PassInstalls, Template } from '../types';
import { decryptJson, encryptJson } from './crypto';

export interface TemplateSummary {
  id: string;
  name: string;
  kind: Template['kind'];
  updatedAt: string;
  /** Color de fondo y logo para la miniatura en la lista. */
  color?: string;
  logo?: string;
}

export interface PassSummary {
  serial: string;
  templateId: string;
  holderName: string;
  updatedAt: string;
  voided: boolean;
  /** Dispositivos de Apple registrados. */
  apple?: number;
  /** Guardado en Google Wallet. */
  google?: boolean;
}

export const MAX_INSTALL_EVENTS = 20;

export const emptyInstalls = (): PassInstalls => ({ appleDevices: 0, googleSaved: false, googleSaves: 0, googleDeletes: 0, events: [] });

export interface NotificationSummary {
  id: string;
  createdAt: string;
  header: string;
  target: NotificationRecord['target'];
  passes: number;
  apple: boolean;
  google: boolean;
  failed: number;
}

export interface Registration {
  pushToken: string;
  createdAt: string;
}

/** Acceso tipado al namespace KV. */
export class Store {
  constructor(
    private kv: KVNamespace,
    private encryptionKey: string,
  ) {}

  private async listAll<M>(prefix: string): Promise<{ name: string; metadata: M | undefined }[]> {
    const out: { name: string; metadata: M | undefined }[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.kv.list<M>({ prefix, cursor });
      for (const k of page.keys) out.push({ name: k.name, metadata: k.metadata });
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return out;
  }

  // Settings (cifrados)

  async getAppleSettings(): Promise<AppleSettings | null> {
    const v = await this.kv.get('settings:apple');
    return v ? decryptJson<AppleSettings>(this.encryptionKey, v) : null;
  }

  async putAppleSettings(s: AppleSettings): Promise<void> {
    await this.kv.put('settings:apple', await encryptJson(this.encryptionKey, s));
  }

  async getGoogleSettings(): Promise<GoogleSettings | null> {
    const v = await this.kv.get('settings:google');
    return v ? decryptJson<GoogleSettings>(this.encryptionKey, v) : null;
  }

  async putGoogleSettings(s: GoogleSettings): Promise<void> {
    await this.kv.put('settings:google', await encryptJson(this.encryptionKey, s));
  }

  // Plantillas

  async listTemplates(): Promise<TemplateSummary[]> {
    const keys = await this.listAll<TemplateSummary>('template:');
    return keys.flatMap((k) => (k.metadata ? [k.metadata] : []));
  }

  getTemplate(id: string): Promise<Template | null> {
    return this.kv.get<Template>(`template:${id}`, 'json');
  }

  async putTemplate(t: Template): Promise<void> {
    const metadata: TemplateSummary = {
      id: t.id,
      name: t.name.slice(0, 120),
      kind: t.kind,
      updatedAt: t.updatedAt,
      color: t.colors.background,
      logo: t.images.logoSquare ?? t.images.icon ?? t.images.logo,
    };
    await this.kv.put(`template:${t.id}`, JSON.stringify(t), { metadata });
  }

  async deleteTemplate(id: string): Promise<void> {
    await this.kv.delete(`template:${id}`);
  }

  // Imágenes

  async putImage(id: string, bytes: Uint8Array, contentType: string): Promise<ImageMeta> {
    const meta: ImageMeta = { id, contentType, size: bytes.byteLength };
    await this.kv.put(`image:${id}`, bytes, { metadata: meta });
    return meta;
  }

  async getImage(id: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; meta: ImageMeta } | null> {
    const r = await this.kv.getWithMetadata<ImageMeta>(`image:${id}`, 'arrayBuffer');
    if (!r.value || !r.metadata) return null;
    return { bytes: new Uint8Array(r.value), meta: r.metadata };
  }

  // Pases

  async listPasses(): Promise<PassSummary[]> {
    const keys = await this.listAll<PassSummary>('pass:');
    return keys.flatMap((k) => (k.metadata ? [k.metadata] : []));
  }

  getPass(serial: string): Promise<Pass | null> {
    return this.kv.get<Pass>(`pass:${serial}`, 'json');
  }

  async putPass(p: Pass): Promise<void> {
    const metadata: PassSummary = {
      serial: p.serial,
      templateId: p.templateId,
      holderName: p.holderName.slice(0, 200),
      updatedAt: p.updatedAt,
      voided: p.voided,
      apple: p.installs?.appleDevices ?? 0,
      google: p.installs?.googleSaved ?? false,
    };
    await this.kv.put(`pass:${p.serial}`, JSON.stringify(p), { metadata });
  }

  /**
   * Registra una instalación o desinstalación. No toca updatedAt: Apple lo usa para saber si el pase cambió.
   * `appleDevices` permite fijar el conteo real de dispositivos.
   */
  async recordInstall(serial: string, platform: InstallEvent['platform'], type: InstallEvent['type'], appleDevices?: number): Promise<Pass | null> {
    const pass = await this.getPass(serial);
    if (!pass) return null;
    const i = { ...emptyInstalls(), ...pass.installs };
    if (platform === 'apple') {
      i.appleDevices = Math.max(0, appleDevices ?? i.appleDevices + (type === 'added' ? 1 : -1));
    } else if (type === 'added') {
      i.googleSaved = true;
      i.googleSaves++;
    } else {
      i.googleSaved = false;
      i.googleDeletes++;
    }
    i.events = [{ at: new Date().toISOString(), platform, type }, ...i.events].slice(0, MAX_INSTALL_EVENTS);
    pass.installs = i;
    await this.putPass(pass);
    return pass;
  }

  /** Marca un nonce de callback como visto; devuelve false si ya se había procesado. */
  async claimNonce(nonce: string): Promise<boolean> {
    const key = `gnonce:${nonce.slice(0, 200)}`;
    if ((await this.kv.get(key)) !== null) return false;
    await this.kv.put(key, '1', { expirationTtl: 7 * 24 * 3600 });
    return true;
  }

  // Notificaciones

  async listNotifications(): Promise<NotificationSummary[]> {
    const keys = await this.listAll<NotificationSummary>('notification:');
    return keys.flatMap((k) => (k.metadata ? [k.metadata] : []));
  }

  getNotification(id: string): Promise<NotificationRecord | null> {
    return this.kv.get<NotificationRecord>(`notification:${id}`, 'json');
  }

  async putNotification(n: NotificationRecord): Promise<void> {
    const metadata: NotificationSummary = {
      id: n.id,
      createdAt: n.createdAt,
      header: n.header.slice(0, 100),
      target: n.target,
      passes: n.result.passes,
      apple: n.apple.enabled,
      google: n.google.enabled,
      failed: n.result.apple.failed + n.result.google.failed,
    };
    await this.kv.put(`notification:${n.id}`, JSON.stringify(n), { metadata });
  }

  // Registros de dispositivos (web service de Apple)

  async register(deviceId: string, passTypeId: string, serial: string, pushToken: string): Promise<boolean> {
    const key = `reg:${passTypeId}:${serial}:${deviceId}`;
    const existed = (await this.kv.get(key)) !== null;
    const reg: Registration = { pushToken, createdAt: new Date().toISOString() };
    await this.kv.put(key, JSON.stringify(reg), { metadata: reg });
    await this.kv.put(`device:${deviceId}:${passTypeId}:${serial}`, '1');
    return !existed;
  }

  async unregister(deviceId: string, passTypeId: string, serial: string): Promise<boolean> {
    const key = `reg:${passTypeId}:${serial}:${deviceId}`;
    const existed = (await this.kv.get(key)) !== null;
    await this.kv.delete(key);
    await this.kv.delete(`device:${deviceId}:${passTypeId}:${serial}`);
    return existed;
  }

  async devicesForPass(passTypeId: string, serial: string): Promise<{ deviceId: string; pushToken: string }[]> {
    const prefix = `reg:${passTypeId}:${serial}:`;
    const keys = await this.listAll<Registration>(prefix);
    return keys.flatMap((k) =>
      k.metadata ? [{ deviceId: k.name.slice(prefix.length), pushToken: k.metadata.pushToken }] : [],
    );
  }

  async serialsForDevice(deviceId: string, passTypeId: string): Promise<string[]> {
    const prefix = `device:${deviceId}:${passTypeId}:`;
    return (await this.listAll(prefix)).map((k) => k.name.slice(prefix.length));
  }
}
