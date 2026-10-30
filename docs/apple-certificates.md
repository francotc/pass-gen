# Certificados de Apple

Todo sale de **developer.apple.com** (requiere el Apple Developer Program pago) y de **apple.com/certificateauthority**.

## 1. Certificado del Pass Type ID (`.p12`)

1. developer.apple.com → Certificates, IDs & Profiles → **Identifiers** → «+» → **Pass Type IDs** → crear uno (ej. `pass.dev.frant.loyalty`).
2. Entrar al ID → **Create Certificate**. Pide un pedido de certificado (CSR):
   - **Con Mac:** Llavero → Asistente de Certificados → «Solicitar un certificado de una autoridad» → guardar en disco.
   - **Sin Mac:**

     ```bash
     openssl req -new -newkey rsa:2048 -nodes -keyout pass.key -out pass.csr -subj "/CN=Pass Gen"
     ```

3. Subir el CSR y descargar el `.cer`.
4. Exportar:
   - **Con Mac:** abrir el `.cer` → Llavero → «Mis certificados» → clic derecho → Exportar `.p12` con contraseña.
   - **Sin Mac:** en Settings, dentro de «Use PEM certificate and key instead», subir el `.cer` como certificado y `pass.key` como clave privada.

El certificado vence al año; Settings muestra la fecha. Al renovarlo con el mismo Pass Type ID, los pases emitidos siguen funcionando.

## 2. WWDR G4

apple.com/certificateauthority → **Worldwide Developer Relations - G4** → bajar el `.cer` y subirlo tal cual.

## 3. Clave APNs (`.p8`), para las actualizaciones

1. developer.apple.com → **Keys** → «+» → marcar **Apple Push Notifications service (APNs)** → crear.
2. Descargar la `.p8`. Solo se puede bajar una vez: si se pierde, hay que crear otra.
3. Anotar el **Key ID** de esa pantalla.

Si el push con `.p8` no llega a los dispositivos, la alternativa es el certificado por mTLS (ver «Push de Apple con certificado» en el [README](../README.md)).

## 4. Team ID

Se lee solo del certificado. Si hiciera falta cargarlo a mano: developer.apple.com → **Membership details**.

## En Settings

`.p12` + contraseña + WWDR + `.p8` + Key ID → **Save Apple**.
