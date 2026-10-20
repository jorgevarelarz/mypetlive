import { brandedEmail, emailChangeNoticeEmail } from '../utils/emailTemplates';
import { escapeHtml } from '../utils/escapeHtml';

// RentalApp d900292: datos escritos por usuarios (nombre de mascota, correo nuevo)
// entraban tal cual en el HTML de los correos.
describe('Correos: los datos de usuario van escapados', () => {
  const evil = '<a href="https://phishing.example">Toby</a>';

  it('escapeHtml neutraliza marcado y comillas', () => {
    expect(escapeHtml(evil)).toBe('&lt;a href=&quot;https://phishing.example&quot;&gt;Toby&lt;/a&gt;');
  });

  it('el título, el preencabezado y el botón de la plantilla son texto plano', () => {
    const html = brandedEmail({ heading: `¡Bienvenido a casa, ${evil}!`, preheader: evil, bodyHtml: '<p>ok</p>', button: { text: evil, url: 'https://mypetlive.es' } });
    expect(html).not.toContain('<a href="https://phishing.example">');
    expect(html).toContain('&lt;a href=&quot;https://phishing.example&quot;&gt;');
    expect(html).toContain('<p>ok</p>');
  });

  it('el aviso de cambio de correo escapa la dirección nueva', () => {
    const { html, text } = emailChangeNoticeEmail('x@y.es<script>alert(1)</script>', false);
    expect(html).not.toContain('<script>');
    expect(text).toContain('<script>'); // el texto plano no se toca
  });
});
