# Pass Gen

Portal para diseñar, emitir y actualizar pases de **Apple Wallet** y **Google Wallet** (tipos *Fidelidad* y *Genérico*).

Un único Cloudflare Worker con [Hono](https://hono.dev) sirve:

| Ruta | Qué es | Acceso |
|---|---|---|
| `/` | Admin en Angular 21 + [spartan-ng](https://spartan.ng) (Static Assets, fallback SPA) | Cloudflare Access |
| `/api/*` | API del admin | Cloudflare Access |
| `/v1/*` | [Web service de Apple Wallet](https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes) (registro de dispositivos y descarga del pase actualizado) | **Bypass** (token por pase) |
| `/public/images/:id` | Imágenes que descarga Google Wallet | **Bypass** (ids aleatorios) |
| `/public/passes/:serial/:token.pkpass` | Link de descarga del `.pkpass` para el titular | **Bypass** (token por pase) |

Todo se guarda en un namespace **KV**. Las credenciales se cifran con AES-GCM usando el secret `ENCRYPTION_KEY` y nunca vuelven al navegador.

## Cómo funcionan las actualizaciones

- **Google Wallet**: al guardar un pase o publicar una plantilla, el Worker hace upsert de la *class* y el *object* por la API REST. Google propaga los cambios a los teléfonos.
- **Apple Wallet**: el `.pkpass` incluye `webServiceURL` y `authenticationToken`. El iPhone se registra en `/v1/devices/...`. Al actualizar, el Worker manda un push vacío por APNs y el dispositivo descarga el pase nuevo desde `/v1/passes/...`.
  - Push con **certificado (mTLS)**: es la vía documentada por Apple. Requiere el binding `APNS_CERT` (ver abajo).
  - Push con **clave `.p8`** (JWT ES256, topic = Pass Type ID): se configura desde Ajustes. Si existe `APNS_CERT`, tiene prioridad.
  - Apple solo entrega estos pushes en producción y exige HTTPS, así que en `wrangler dev` (http) el pase se emite sin web service.

## Puesta en marcha

```bash
npm install
```

1. Crear el KV y pegar el id en `wrangler.jsonc` (`kv_namespaces[0].id`):

   ```bash
   npx wrangler kv namespace create PASSGEN
   ```

2. Secret de cifrado:

   ```bash
   openssl rand -base64 32 | npx wrangler secret put ENCRYPTION_KEY
   ```

3. Deploy (publica en `https://pass.frant.dev`, configurado como custom domain en `wrangler.jsonc`; la zona `frant.dev` tiene que estar en tu cuenta de Cloudflare):

   ```bash
   npm run deploy
   ```

4. **Cloudflare Access** (Zero Trust → Access → Applications):
   - Una aplicación *self-hosted* para `pass.frant.dev`, con tu política de login.
   - Una política **Bypass / Everyone** para las rutas `/v1/*` y `/public/*`. Puede ser una segunda aplicación con esos paths.
   - `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` ya están en `wrangler.jsonc`: el Worker valida el header `Cf-Access-Jwt-Assertion` en `/api/*`. Si cambiás de aplicación de Access, actualizá el *Application Audience Tag*.

5. Cargar credenciales en **Ajustes**:
   - **Apple** ([cómo conseguir cada certificado](docs/apple-certificates.md)): el `.p12` del Pass Type ID con su contraseña (o certificado + clave en PEM) y el certificado [WWDR G4](https://www.apple.com/certificateauthority/). Team ID y Pass Type ID se leen del certificado. Para el push, la clave `.p8` de APNs con su Key ID.
   - **Google**: Issuer ID (Google Pay & Wallet Console) y el JSON de un service account con acceso de emisor.

### Push de Apple con certificado (mTLS, opcional)

```bash
openssl pkcs12 -in pass.p12 -clcerts -nokeys -out pass-cert.pem
```

```bash
openssl pkcs12 -in pass.p12 -nocerts -nodes -out pass-key.pem
```

```bash
npx wrangler mtls-certificate upload --cert pass-cert.pem --key pass-key.pem --name apns-pass
```

Después agregá el binding en `wrangler.jsonc`, con el id que devuelve el comando:

```jsonc
"mtls_certificates": [{ "binding": "APNS_CERT", "certificate_id": "<id>" }]
```

## Desarrollo

```bash
printf 'ENCRYPTION_KEY=%s\nACCESS_TEAM_DOMAIN=\nACCESS_AUD=\n' "$(openssl rand -base64 32)" > .dev.vars
```

(En local no hay Access delante, por eso `.dev.vars` vacía `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD`.)

```bash
npm run dev          # wrangler dev en :8787 (compila el front con build.command)
```

```bash
npm run dev:web      # ng serve con proxy de /api a :8787 (recarga en caliente)
```

```bash
npm test && npm run typecheck
```

## Estructura

```
src/worker/            Worker Hono
  routes/api.ts        API del admin
  routes/apple-ws.ts   web service de Apple Wallet
  lib/apple/           pass.json, firma PKCS#7 (node-forge), .p12, APNs
  lib/google/          OAuth del service account, classes/objects, link "Save to Google Wallet"
  lib/sync.ts          sincroniza Google + push Apple
  lib/store.ts         acceso a KV
  types.ts             tipos compartidos con el front
src/web/               Angular + spartan-ng (helm en src/web/libs/ui)
test/                  Vitest en el runtime de Workers (@cloudflare/vitest-plugin)
docs/superpowers/      spec y plan
```

## Notificaciones

Pantalla *Notifications*: envía un mensaje a un pase o a todos los pases activos de una plantilla.

| Elemento | Apple Wallet | Google Wallet |
|---|---|---|
| Título y mensaje (con `{{placeholders}}`) | Campo `pg.message` del pase: label = título, value = mensaje | `addMessage` con `header` y `body` |
| Texto de la notificación | `changeMessage` (`%@` = mensaje, admite `{{header}}`) | El propio mensaje |
| Push | Push vacío por APNs; el iPhone notifica porque el campo cambió | `messageType: TEXT_AND_NOTIFY` (o `TEXT` silencioso). Máx. 3 por pase cada 24 h |
| Link | `attributedValue` con `<a href>` (solo en el reverso) | Se agrega al final del mensaje |
| Ubicación | Reverso, fila secundaria o auxiliar del frente | Detalle del pase |
| Traducciones | — | `localizedHeader` / `localizedBody` |
| Vigencia | El mensaje queda hasta el próximo | `displayInterval` (desde / hasta) |
| Alcance plantilla | Un mensaje por pase | Por pase (con placeholders) o uno solo en la class (sin placeholders) |

Además, al editar un pase *Loyalty* se puede marcar **Notify Google holders**: envía `notifyPreference: NOTIFY_ON_UPDATE` y Google notifica el cambio de saldo. En Apple, los campos de la plantilla con *change message* notifican solos al cambiar.

Limitaciones: Apple no notifica si el texto es idéntico al anterior; Google rechaza con `QuotaExceededException` más de 3 notificaciones por pase en 24 h (el error se ve en el historial). Los envíos a plantillas grandes comparten los límites de subrequests del Worker.

## NFC

Cada plantilla puede habilitar NFC (sección *NFC* del editor):

- **Apple (Value Added Services)**: agrega `nfc` al `pass.json` con el payload (máx. 64 bytes, admite placeholders), la clave pública ECDH P-256 de la terminal (SubjectPublicKeyInfo en base64, la entrega el proveedor de la terminal) y opcionalmente `requiresAuthentication`. Requiere un Pass Type ID con el entitlement de NFC aprobado por Apple; sin la clave pública el pase se emite sin NFC.
- **Google (Smart Tap)**: habilita `enableSmartTap` y `redemptionIssuers` en la class y envía el payload como `smartTapRedemptionValue` en cada object. Smart Tap tiene que estar habilitado para el issuer en la Google Pay & Wallet Console (collector ID y claves de la terminal).

## Plantillas y datos

Los valores de los campos admiten `{{clave}}`. Cada pase completa sus propias claves; `{{holderName}}` y `{{serial}}` están siempre disponibles. Para actualizar todos los pases de una plantilla tras cambiar el diseño, usá **Guardar y actualizar pases**.
