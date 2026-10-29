import type { AppleSettings, GoogleSettings, ImageMeta, Pass, Template } from '../types';
import { decryptJson, encryptJson } from './crypto';

export interface TemplateSummary {
  id: string;
  name: string;
  kind: Template['kind'];
  updatedAt: string;
}

export interface PassSummary {
  serial: string;
  templateId: string;
  holderName: string;
  updatedAt: string;
  voided: boolean;
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
    const metadata: TemplateSummary = { id: t.id, name: t.name, kind: t.kind, updatedAt: t.updatedAt };
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
    };
    await this.kv.put(`pass:${p.serial}`, JSON.stringify(p), { metadata });
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

  async unregister(deviceId: string, passTypeId: string, serial: string): Promise<void> {
    await this.kv.delete(`reg:${passTypeId}:${serial}:${deviceId}`);
    await this.kv.delete(`device:${deviceId}:${passTypeId}:${serial}`);
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
