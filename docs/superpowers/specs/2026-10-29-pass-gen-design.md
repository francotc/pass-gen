# pass-gen — Design

Fecha: 2026-10-29
Referencia visual: canvas «Loyalty Pass App Screens» (pantalla *Admin · Pass design*), tema spartan por defecto (neutros, Geist, `--radius 0.625rem`).

## Objetivo

Portal web para diseñar, emitir y actualizar pases de **Apple Wallet** (`.pkpass`) y **Google Wallet** desde un único lugar. Tipos soportados en v1: **Loyalty** y **Generic**.

## Arquitectura

Un único Cloudflare Worker con **Hono**:

- **Front**: Angular + spartan-ng (helm) + Tailwind 4, compilado a estático y servido como Workers Static Assets con fallback SPA.
- **`/api/*`**: API del admin. Protegida por **Cloudflare Access (Zero Trust)**, configurado por el usuario. El Worker valida opcionalmente `Cf-Access-Jwt-Assertion` contra `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` si `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` están definidos.
- **`/v1/*`**: Web service de Apple Wallet. Debe tener **bypass** en Access. Autenticado por `Authorization: ApplePass <authenticationToken>` por pase.

## Persistencia — un namespace KV (`PASSGEN`)

| Clave | Valor |
|---|---|
| `settings:apple` | JSON cifrado (AES-GCM, clave = secret `ENCRYPTION_KEY`): teamId, passTypeId, organizationName, certificado PEM, clave privada PEM, WWDR PEM, APNs keyId + p8 PEM. |
| `settings:google` | JSON cifrado: issuerId, service account (client_email, private_key). |
| `template:{id}` | Plantilla (ver modelo). |
| `image:{id}` | PNG binario; metadata `{contentType, width, height}`. |
| `pass:{serial}` | Pase emitido. |
| `reg:{passTypeId}:{serial}:{deviceId}` | `{pushToken, createdAt}`. |
| `device:{deviceId}:{passTypeId}:{serial}` | `{createdAt}` (índice inverso). |

Las credenciales nunca vuelven al front: `GET /api/settings` devuelve solo estado (configurado, CN y vencimiento del certificado, email del service account).

KV es eventualmente consistente (~60 s entre PoPs); aceptable para un panel admin.

## Modelo

```ts
type PassKind = 'loyalty' | 'generic';
interface Field { key: string; label: string; value: string; }  // value admite {{placeholders}} de los datos del pase
interface Template {
  id: string; name: string; kind: PassKind;
  organizationName: string; description: string; logoText: string;
  colors: { background: string; foreground: string; label: string };
  images: { icon?: string; logo?: string; strip?: string; hero?: string }; // ids de image:
  barcode: { format: 'QR' | 'PDF417' | 'AZTEC' | 'CODE128'; message: string; altText?: string };
  headerFields: Field[]; primaryFields: Field[]; secondaryFields: Field[]; auxiliaryFields: Field[]; backFields: Field[];
  google: { programName?: string; issuerName?: string }; // loyalty: programName; generic: cardTitle
  updatedAt: string;
}
interface Pass {
  serial: string; templateId: string; authToken: string;
  holderName: string; data: Record<string, string>; // valores para {{placeholders}}
  createdAt: string; updatedAt: string; voided: boolean;
  google: { objectId: string; synced: boolean; error?: string };
}
```

Placeholders: `{{holderName}}`, `{{serial}}` y cualquier clave de `data`.

## Apple

- `pass.json`: `formatVersion 1`, `passTypeIdentifier`, `teamIdentifier`, `serialNumber`, `authenticationToken`, `webServiceURL = <origin>/` (el sistema agrega `v1/...`), colores en `rgb(r,g,b)`, `storeCard` (loyalty) o `generic`, `barcodes`.
- Imágenes: `icon.png` obligatorio (si falta se usa un placeholder generado), `logo.png`, `strip.png` (solo storeCard).
- `manifest.json` con SHA-1 de cada archivo; `signature` = PKCS#7 detached DER (node-forge) con cert + WWDR. ZIP con fflate.
- El `.pkpass` se genera al vuelo (no se almacena).
- Web service: register / unregister / list updated serials (`passesUpdatedSince` = timestamp en ms) / get latest pass / log.
- Push: APNs HTTP/2 `https://api.push.apple.com/3/device/<token>`, JWT ES256 (`.p8`), `apns-topic = passTypeId`, payload `{}`. 410 / `BadDeviceToken` / `Unregistered` → borrar registro.

## Google

- Token OAuth: JWT RS256 (WebCrypto) → `https://oauth2.googleapis.com/token`, scope `wallet_object.issuer`.
- Class id `<issuerId>.<templateId>`; object id `<issuerId>.<serial>`.
- loyalty → `loyaltyClass`/`loyaltyObject`; generic → `genericClass`/`genericObject`.
- Upsert: GET → PUT si existe, POST si no.
- Save link: JWT RS256 `typ: savetowallet` con `payload.{loyaltyObjects|genericObjects}: [{id}]` → `https://pay.google.com/gp/v/save/<jwt>`.
- Actualizar plantilla → upsert de la class; actualizar pase → upsert del object (Google propaga a los dispositivos).

## API

```
GET    /api/settings                    estado
PUT    /api/settings/apple              multipart/JSON con credenciales (acepta .p12 + password o PEMs)
PUT    /api/settings/google             JSON service account + issuerId
GET    /api/templates | POST | GET/PUT/DELETE /api/templates/:id
POST   /api/images                      PNG → {id}
GET    /api/images/:id
GET    /api/passes | POST               emitir
GET    /api/passes/:serial | PUT        actualizar → bump updatedAt, sync Google, push Apple
DELETE /api/passes/:serial              void
GET    /api/passes/:serial/pkpass       descarga
GET    /api/passes/:serial/google-link  save link
POST   /api/templates/:id/publish       sync class Google + push Apple a todos los pases de la plantilla
```

Actualizar una plantilla también bumpea `updatedAt` de sus pases (vía `publish`).

## Front

- **Ajustes**: tarjetas Apple / Google, subida de archivos, estado. Instrucciones del bypass de `/v1/*` en Access.
- **Plantillas**: lista + editor (apariencia, imágenes, campos por sección, barcode, back fields) con preview Apple y Google en vivo; botón *Guardar y actualizar pases*.
- **Pases**: tabla con búsqueda; emitir (plantilla, nombre, datos); detalle con descarga `.pkpass`, link Google + QR, edición de datos y *Guardar y actualizar*.

Componentes spartan: button, input, label, card, badge, table, tabs, select, dialog/sheet, sonner (toasts), switch.

## Errores

- Respuestas JSON `{error, detail}`; el front muestra toasts.
- Fallo de Google o APNs no bloquea guardar: se registra en `pass.google.error` y se devuelve un resumen `{apple: {sent, failed}, google: {ok, error}}`.

## Testing

Vitest con `@cloudflare/vitest-pool-workers`: manifest/firma (cert autofirmado de prueba), JWT Google (verificación con clave pública), rutas del web service Apple, CRUD API sobre KV, cifrado de settings, render de placeholders.

## Fuera de alcance v1

Event ticket, coupon, boarding pass; mensajes push custom (changeMessage sí); multi-tenant; analíticas.
