# Plantillas de correo (Supabase → Authentication → Email Templates)

Copiar cada asunto y cuerpo en su plantilla. `{{ .ConfirmationURL }}` lo rellena Supabase.

## Confirm signup (activar cuenta)

**Asunto:** Activa tu cuenta en Divina Providentia

```html
<h2>¡Bienvenido a Divina Providentia!</h2>
<p>Para activar tu cuenta y empezar a publicar inmuebles, pulsa este botón:</p>
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 20px;background:#0f6b5c;color:#fff;border-radius:8px;text-decoration:none">Activar mi cuenta</a></p>
<p>Si no creaste esta cuenta, ignora este correo.</p>
<p>— Divina Providentia · Inmuebles en Venezuela</p>
```

## Reset password (recuperar contraseña)

**Asunto:** Elige una contraseña nueva

```html
<h2>Recuperar contraseña</h2>
<p>Pulsa el botón para elegir una contraseña nueva. El enlace caduca en una hora.</p>
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 20px;background:#0f6b5c;color:#fff;border-radius:8px;text-decoration:none">Elegir contraseña nueva</a></p>
<p>Si no lo pediste tú, ignora este correo: tu contraseña sigue igual.</p>
<p>— Divina Providentia</p>
```

## Ajustes que hacen falta en Supabase

- **Authentication → Sign In / Providers → Email:** «Confirm email» activado.
- **Authentication → URL Configuration:** Site URL `https://divinaprovidentia.com`; Redirect URLs `https://divinaprovidentia.com/**`.
- **Authentication → Emails → SMTP Settings:** un proveedor propio (Resend, Brevo…). Sin esto, Supabase solo envía correos a los miembros del equipo del proyecto y con un límite de pocos por hora.
- **Authentication → Attack Protection → CAPTCHA:** proveedor Cloudflare Turnstile + clave secreta. La clave del sitio va en `site/comun.js` (`TURNSTILE_SITE_KEY`).
