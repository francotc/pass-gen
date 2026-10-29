// Tipos compartidos entre el Worker y el front (sin dependencias de runtime).

export type PassKind = 'loyalty' | 'generic';
export type BarcodeFormat = 'QR' | 'PDF417' | 'AZTEC' | 'CODE128';
export type FieldSection = 'headerFields' | 'primaryFields' | 'secondaryFields' | 'auxiliaryFields' | 'backFields';
export type ImageSlot = 'icon' | 'logo' | 'strip' | 'hero';

export const FIELD_SECTIONS: FieldSection[] = [
  'headerFields',
  'primaryFields',
  'secondaryFields',
  'auxiliaryFields',
  'backFields',
];

export interface Field {
  key: string;
  label: string;
  /** Admite {{placeholders}} con datos del pase. */
  value: string;
  /** Texto que muestra Apple en la notificación cuando el valor cambia (%@ = valor nuevo). */
  changeMessage?: string;
}

/**
 * NFC: Apple Value Added Services (requiere un Pass Type ID con NFC habilitado por Apple)
 * y Google Smart Tap (requiere Smart Tap habilitado para el issuer).
 */
export interface NfcSettings {
  enabled: boolean;
  /** Payload que recibe la terminal; admite {{placeholders}}. Apple acepta hasta 64 bytes. */
  message: string;
  /** Apple: X.509 SubjectPublicKeyInfo en base64 con la clave pública ECDH P-256 de la terminal. */
  encryptionPublicKey?: string;
  /** Apple: pedir Face ID / Touch ID / código antes de enviar el payload. */
  requiresAuthentication?: boolean;
}

export const NFC_MAX_BYTES = 64;

export interface Template {
  id: string;
  name: string;
  kind: PassKind;
  organizationName: string;
  description: string;
  logoText: string;
  colors: { background: string; foreground: string; label: string };
  images: Partial<Record<ImageSlot, string>>;
  barcode: { format: BarcodeFormat; message: string; altText?: string };
  headerFields: Field[];
  primaryFields: Field[];
  secondaryFields: Field[];
  auxiliaryFields: Field[];
  backFields: Field[];
  google: { programName?: string; issuerName?: string };
  nfc: NfcSettings;
  createdAt: string;
  updatedAt: string;
}

export type TemplateInput = Omit<Template, 'id' | 'createdAt' | 'updatedAt'>;

export interface Pass {
  serial: string;
  templateId: string;
  authToken: string;
  holderName: string;
  data: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  voided: boolean;
  google: { objectId?: string; synced: boolean; error?: string };
}

export interface PassInput {
  templateId: string;
  holderName: string;
  data: Record<string, string>;
}

export interface AppleSettings {
  teamId: string;
  passTypeId: string;
  certPem: string;
  keyPem: string;
  wwdrPem: string;
  apnsKeyId?: string;
  apnsKeyPem?: string;
}

export interface GoogleSettings {
  issuerId: string;
  clientEmail: string;
  privateKey: string;
}

export interface SettingsStatus {
  apple: null | {
    teamId: string;
    passTypeId: string;
    certSubject: string;
    certExpires: string;
    apns: boolean;
    apnsKeyId?: string;
  };
  google: null | { issuerId: string; clientEmail: string };
}

export interface SyncResult {
  apple: { sent: number; failed: number; skipped?: string };
  google: { ok: boolean; error?: string; skipped?: string };
}

export interface ImageMeta {
  id: string;
  contentType: string;
  size: number;
}
