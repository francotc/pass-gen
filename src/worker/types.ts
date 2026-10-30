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
export const MAX_LOCATIONS = 10;

/** Punto donde el pase se vuelve relevante (Apple: pantalla bloqueada; Google: aviso geolocalizado). */
export interface PassLocation {
  /** Solo para identificarla en el admin. */
  name?: string;
  latitude: number;
  longitude: number;
  /** Apple: metros sobre el nivel del mar. */
  altitude?: number;
  /** Apple: texto en la pantalla bloqueada; admite {{placeholders}}. */
  relevantText?: string;
}

/** Apple: iBeacon que vuelve relevante el pase. */
export interface PassBeacon {
  proximityUUID: string;
  major?: number;
  minor?: number;
  relevantText?: string;
}

export interface LocationSettings {
  /** Hasta 10; Apple las usa en `locations` y Google en `merchantLocations` de la class. */
  points: PassLocation[];
  /** Apple: distancia máxima en metros (se usa la menor entre esta y la del sistema). */
  maxDistance?: number;
  /** Apple: hasta 10 iBeacons. */
  beacons: PassBeacon[];
}

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
  locations: LocationSettings;
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
  /** Último mensaje enviado; en Apple se muestra como un campo del pase. */
  message?: PassMessage;
}

/** Mensaje ya renderizado para un pase (placeholders resueltos). */
export interface PassMessage {
  notificationId: string;
  header: string;
  body: string;
  link?: string;
  placement: AppleMessagePlacement;
  changeMessage: string;
  sentAt: string;
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

// Notificaciones

export type AppleMessagePlacement = 'backFields' | 'secondaryFields' | 'auxiliaryFields';
export type GoogleMessageScope = 'object' | 'class';

export type NotificationTarget = { type: 'pass'; serial: string } | { type: 'template'; templateId: string };

export interface MessageTranslation {
  /** BCP 47, ej. "en-US", "de". */
  language: string;
  header: string;
  body: string;
}

export interface NotificationInput {
  target: NotificationTarget;
  /** Admiten {{placeholders}} (salvo Google con scope "class"). */
  header: string;
  body: string;
  /** URL opcional: link en el reverso (Apple) y al final del cuerpo (Google). */
  link?: string;
  /** Traducciones (solo Google; Apple usa header/body). */
  translations: MessageTranslation[];
  apple: {
    enabled: boolean;
    /** Dónde se muestra el campo del mensaje. Los links solo funcionan en el reverso. */
    placement: AppleMessagePlacement;
    /** Texto de la notificación; %@ se reemplaza por el cuerpo. Admite {{header}}. */
    changeMessage: string;
  };
  google: {
    enabled: boolean;
    /** TEXT_AND_NOTIFY (push, máx. 3 por pase cada 24 h) o TEXT (solo aparece en el pase). */
    notify: boolean;
    /** object: un mensaje por pase; class: un mensaje para todos los titulares de la plantilla. */
    scope: GoogleMessageScope;
    /** ISO 8601; vacío = desde ya / sin vencimiento. */
    displayStart?: string;
    displayEnd?: string;
  };
}

export interface NotificationResult {
  passes: number;
  apple: { updated: number; sent: number; failed: number; skipped?: string };
  google: { sent: number; failed: number; errors: string[]; skipped?: string };
}

export interface NotificationRecord extends NotificationInput {
  id: string;
  createdAt: string;
  result: NotificationResult;
}
