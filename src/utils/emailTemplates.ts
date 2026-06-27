// Plantillas de email de marca MyPetLive.
// HTML compatible con clientes de correo: layout en tablas + estilos inline.

const BRAND = {
  name: 'MyPetLive',
  url: 'https://mypetlive.es',
  teal: '#1F6F6F',
  tealDark: '#155656',
  text: '#3F4A3C',
  muted: '#7A8273',
  bg: '#F1F3E8',
  card: '#FFFFFF',
  border: '#E7E1D5',
};

interface BrandedEmailOpts {
  /** Texto oculto que aparece en la vista previa de la bandeja. */
  preheader?: string;
  heading: string;
  /** HTML del cuerpo (párrafos ya formateados). */
  bodyHtml: string;
  button?: { text: string; url: string };
  /** Nota tenue al final del cuerpo (p. ej. "si no fuiste tú, ignora"). */
  footnote?: string;
}

/** Envuelve contenido en la maqueta de marca y devuelve el HTML completo. */
export function brandedEmail(opts: BrandedEmailOpts): string {
  const { preheader = '', heading, bodyHtml, button, footnote } = opts;
  const year = new Date().getFullYear();

  const buttonBlock = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
         <tr><td align="center" bgcolor="${BRAND.teal}" style="border-radius:10px;">
           <a href="${button.url}" target="_blank"
              style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">
             ${button.text}
           </a>
         </td></tr>
       </table>`
    : '';

  const footnoteBlock = footnote
    ? `<p style="margin:24px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${BRAND.muted};">${footnote}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding:8px 0 24px;">
              <a href="${BRAND.url}" target="_blank" style="text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:bold;color:${BRAND.teal};">
                🐾 ${BRAND.name}
              </a>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;padding:36px 36px 32px;">
              <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:${BRAND.text};">${heading}</h1>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${BRAND.text};">
                ${bodyHtml}
              </div>
              ${buttonBlock}
              ${footnoteBlock}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 16px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.muted};">
              <p style="margin:0 0 4px;">${BRAND.name} · Adopción responsable 🐾</p>
              <p style="margin:0;">
                <a href="${BRAND.url}" target="_blank" style="color:${BRAND.muted};text-decoration:underline;">mypetlive.es</a>
                · © ${year} ${BRAND.name}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Email de recuperación de contraseña: devuelve versión texto y HTML. */
export function resetPasswordEmail(resetUrl: string): { text: string; html: string } {
  const text = [
    'Hola,',
    '',
    'Hemos recibido una solicitud para restablecer tu contraseña en MyPetLive.',
    'Puedes crear una nueva contraseña usando el siguiente enlace (caduca en 60 minutos):',
    resetUrl,
    '',
    'Si no has solicitado este cambio, simplemente ignora este mensaje.',
    '',
    'Gracias,',
    'Equipo MyPetLive',
  ].join('\n');

  const html = brandedEmail({
    preheader: 'Restablece tu contraseña de MyPetLive (el enlace caduca en 60 minutos).',
    heading: 'Restablece tu contraseña',
    bodyHtml: `
      <p style="margin:0 0 14px;">Hola,</p>
      <p style="margin:0 0 14px;">Hemos recibido una solicitud para restablecer tu contraseña en <strong>MyPetLive</strong>.</p>
      <p style="margin:0;">Pulsa el botón para crear una nueva contraseña. El enlace caduca en <strong>60 minutos</strong>.</p>`,
    button: { text: 'Crear nueva contraseña', url: resetUrl },
    footnote: `Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="${resetUrl}" target="_blank" style="color:${BRAND.teal};word-break:break-all;">${resetUrl}</a><br><br>Si no has solicitado este cambio, ignora este mensaje: tu contraseña seguirá siendo la misma.`,
  });

  return { text, html };
}
