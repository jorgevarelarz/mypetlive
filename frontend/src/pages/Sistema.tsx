import React from 'react';
import { Link } from 'react-router-dom';

const FONT_DISPLAY = "'Bricolage Grotesque', sans-serif";
const FONT_BODY = "'Hanken Grotesk', sans-serif";

function Paw({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <ellipse cx="24" cy="32" rx="11" ry="8.5" fill="currentColor" />
      <circle cx="11" cy="23" r="4.6" fill="currentColor" />
      <circle cx="19.5" cy="15" r="5" fill="currentColor" />
      <circle cx="28.5" cy="15" r="5" fill="currentColor" />
      <circle cx="37" cy="23" r="4.6" fill="currentColor" />
    </svg>
  );
}

// Cuerpo estático de la guía de estilo (secciones 01–05). Diseño importado de Claude Design.
const STYLEGUIDE_HTML = `
<div style="max-width:1080px;margin:0 auto;padding:0 32px 100px;">
  <header style="padding:72px 0 56px;border-bottom:1px solid #E5E1D6;">
    <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#98A088;font-weight:700;margin-bottom:18px;">Sistema de diseño · v1.0</div>
    <h1 style="font-family:'Bricolage Grotesque';font-size:58px;line-height:.98;font-weight:800;letter-spacing:-.03em;margin:0 0 20px;max-width:760px;">La identidad de <span style="color:#1F6F6F;">MyPet</span><span style="color:#E8654A;">Live</span></h1>
    <p style="font-size:18px;line-height:1.6;max-width:600px;color:#6B7464;margin:0;">Marca, tokens y componentes para construir el ecosistema pet. Cálido y de confianza; <strong style="color:#3F4A3C;">simple, seguro y sostenible</strong>.</p>
  </header>

  <section style="padding:64px 0;border-bottom:1px solid #E5E1D6;">
    <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:32px;"><span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#E8654A;font-weight:500;">02</span><h2 style="font-family:'Bricolage Grotesque';font-size:30px;font-weight:700;letter-spacing:-.02em;margin:0;">Paleta de color</h2></div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:36px;">
      <div><div style="height:120px;border-radius:16px;background:#1F6F6F;"></div><div style="margin-top:12px;font-weight:700;font-size:14px;">Teal · Marca</div><div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#6B7464;margin-top:3px;">#1F6F6F</div><div style="font-size:11.5px;color:#98A088;margin-top:5px;line-height:1.4;">Estructura, navegación, confianza.</div></div>
      <div><div style="height:120px;border-radius:16px;background:#E8654A;"></div><div style="margin-top:12px;font-weight:700;font-size:14px;">Coral · Acción</div><div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#6B7464;margin-top:3px;">#E8654A</div><div style="font-size:11.5px;color:#98A088;margin-top:5px;line-height:1.4;">CTA principal «Adoptar».</div></div>
      <div><div style="height:120px;border-radius:16px;background:#6A7B4F;"></div><div style="margin-top:12px;font-weight:700;font-size:14px;">Oliva · Apoyo</div><div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#6B7464;margin-top:3px;">#6A7B4F</div><div style="font-size:11.5px;color:#98A088;margin-top:5px;line-height:1.4;">Sostenibilidad, éxito.</div></div>
      <div><div style="height:120px;border-radius:16px;background:#E9A93C;"></div><div style="margin-top:12px;font-weight:700;font-size:14px;">Oro · Patitas</div><div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#6B7464;margin-top:3px;">#E9A93C</div><div style="font-size:11.5px;color:#98A088;margin-top:5px;line-height:1.4;">Moneda de impacto.</div></div>
      <div><div style="height:120px;border-radius:16px;background:#3F4A3C;"></div><div style="margin-top:12px;font-weight:700;font-size:14px;">Tinta · Texto</div><div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#6B7464;margin-top:3px;">#3F4A3C</div><div style="font-size:11.5px;color:#98A088;margin-top:5px;line-height:1.4;">Texto principal.</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:10px;">
      <div><div style="height:56px;border-radius:10px;background:#F6F3EC;border:1px solid #E5E1D6;"></div><div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#6B7464;margin-top:6px;">#F6F3EC</div><div style="font-size:10px;color:#98A088;">Fondo</div></div>
      <div><div style="height:56px;border-radius:10px;background:#EFEADF;border:1px solid #E5E1D6;"></div><div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#6B7464;margin-top:6px;">#EFEADF</div><div style="font-size:10px;color:#98A088;">Panel</div></div>
      <div><div style="height:56px;border-radius:10px;background:#fff;border:1px solid #E5E1D6;"></div><div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#6B7464;margin-top:6px;">#FFFFFF</div><div style="font-size:10px;color:#98A088;">Tarjeta</div></div>
      <div><div style="height:56px;border-radius:10px;background:#E5E1D6;"></div><div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#6B7464;margin-top:6px;">#E5E1D6</div><div style="font-size:10px;color:#98A088;">Borde</div></div>
      <div><div style="height:56px;border-radius:10px;background:#6B7464;"></div><div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#6B7464;margin-top:6px;">#6B7464</div><div style="font-size:10px;color:#98A088;">Texto 2º</div></div>
      <div><div style="height:56px;border-radius:10px;background:#E2EEEC;"></div><div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#6B7464;margin-top:6px;">#E2EEEC</div><div style="font-size:10px;color:#98A088;">Teal 100</div></div>
      <div><div style="height:56px;border-radius:10px;background:#FBE7E0;"></div><div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#6B7464;margin-top:6px;">#FBE7E0</div><div style="font-size:10px;color:#98A088;">Coral 100</div></div>
      <div><div style="height:56px;border-radius:10px;background:#FBEFD4;"></div><div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#6B7464;margin-top:6px;">#FBEFD4</div><div style="font-size:10px;color:#98A088;">Oro 100</div></div>
    </div>
  </section>

  <section style="padding:64px 0;border-bottom:1px solid #E5E1D6;">
    <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:32px;"><span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#E8654A;font-weight:500;">03</span><h2 style="font-family:'Bricolage Grotesque';font-size:30px;font-weight:700;letter-spacing:-.02em;margin:0;">Tipografía</h2></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px;">
      <div style="background:#fff;border:1px solid #E5E1D6;border-radius:20px;padding:34px;"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#98A088;font-weight:700;margin-bottom:10px;">Display · Titulares</div><div style="font-family:'Bricolage Grotesque';font-size:46px;font-weight:800;letter-spacing:-.03em;line-height:1;margin-bottom:6px;">Bricolage Grotesque</div><div style="font-family:'Bricolage Grotesque';font-size:15px;color:#6B7464;font-weight:500;">Aa Bb Cc · 800 / 700 · expresiva, con carácter</div></div>
      <div style="background:#fff;border:1px solid #E5E1D6;border-radius:20px;padding:34px;"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#98A088;font-weight:700;margin-bottom:10px;">UI · Texto y formularios</div><div style="font-size:46px;font-weight:700;letter-spacing:-.02em;line-height:1;margin-bottom:6px;">Hanken Grotesk</div><div style="font-size:15px;color:#6B7464;">Aa Bb Cc · 400/500/600/700 · humanista, legible</div></div>
    </div>
    <div style="background:#fff;border:1px solid #E5E1D6;border-radius:20px;padding:8px 34px;">
      <div style="display:flex;align-items:baseline;gap:20px;padding:18px 0;border-bottom:1px solid #F0ECE2;"><span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#98A088;width:120px;flex:none;">Display / 48</span><span style="font-family:'Bricolage Grotesque';font-size:40px;font-weight:800;letter-spacing:-.03em;">Adopta con propósito</span></div>
      <div style="display:flex;align-items:baseline;gap:20px;padding:18px 0;border-bottom:1px solid #F0ECE2;"><span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#98A088;width:120px;flex:none;">H1 / 30</span><span style="font-family:'Bricolage Grotesque';font-size:30px;font-weight:700;letter-spacing:-.02em;">Encuentra a tu compañero</span></div>
      <div style="display:flex;align-items:baseline;gap:20px;padding:18px 0;border-bottom:1px solid #F0ECE2;"><span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#98A088;width:120px;flex:none;">H3 / 20</span><span style="font-size:20px;font-weight:700;">Salud y requisitos</span></div>
      <div style="display:flex;align-items:baseline;gap:20px;padding:18px 0;border-bottom:1px solid #F0ECE2;"><span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#98A088;width:120px;flex:none;">Body / 15</span><span style="font-size:15px;line-height:1.55;color:#3F4A3C;">Texto base para descripciones e historias de los animales.</span></div>
      <div style="display:flex;align-items:baseline;gap:20px;padding:18px 0;"><span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#98A088;width:120px;flex:none;">Small / 13</span><span style="font-size:13px;color:#6B7464;">Etiquetas, metadatos y ayudas de formulario.</span></div>
    </div>
  </section>

  <section style="padding:64px 0;border-bottom:1px solid #E5E1D6;">
    <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:32px;"><span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#E8654A;font-weight:500;">05</span><h2 style="font-family:'Bricolage Grotesque';font-size:30px;font-weight:700;letter-spacing:-.02em;margin:0;">Componentes</h2></div>
    <div style="background:#fff;border:1px solid #E5E1D6;border-radius:20px;padding:32px;margin-bottom:20px;">
      <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#98A088;font-weight:700;margin-bottom:20px;">Botones</div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;">
        <span style="background:#E8654A;color:#fff;font-size:15px;font-weight:700;padding:13px 26px;border-radius:14px;box-shadow:0 6px 16px -8px rgba(232,101,74,.7);">Adoptar</span>
        <span style="background:#1F6F6F;color:#fff;font-size:15px;font-weight:700;padding:13px 26px;border-radius:14px;">Acción secundaria</span>
        <span style="background:#fff;color:#1F6F6F;border:1.5px solid #1F6F6F;font-size:15px;font-weight:700;padding:12px 24px;border-radius:14px;">Soy protectora</span>
        <span style="background:#EFEADF;color:#3F4A3C;font-size:15px;font-weight:700;padding:13px 24px;border-radius:14px;">Sutil</span>
        <span style="color:#1F6F6F;font-size:15px;font-weight:700;padding:13px 8px;text-decoration:underline;text-underline-offset:3px;">Enlace</span>
      </div>
    </div>
    <div style="background:#fff;border:1px solid #E5E1D6;border-radius:20px;padding:32px;">
      <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#98A088;font-weight:700;margin-bottom:8px;">Badges de estado</div>
      <div style="font-size:13px;color:#6B7464;margin-bottom:20px;">Sistema semántico compartido por estados de animal y de solicitud.</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px;">
        <span style="background:#E2EEEC;color:#176363;font-size:12.5px;font-weight:700;padding:7px 13px;border-radius:8px;">● Publicado</span>
        <span style="background:#FBEFD4;color:#A77B1C;font-size:12.5px;font-weight:700;padding:7px 13px;border-radius:8px;">● En revisión</span>
        <span style="background:#FBE7E0;color:#C0512F;font-size:12.5px;font-weight:700;padding:7px 13px;border-radius:8px;">● Cita propuesta</span>
        <span style="background:#ECEFE2;color:#566A3D;font-size:12.5px;font-weight:700;padding:7px 13px;border-radius:8px;">● Aprobada</span>
        <span style="background:#F3E0DA;color:#A8503A;font-size:12.5px;font-weight:700;padding:7px 13px;border-radius:8px;">● Rechazada</span>
        <span style="background:#ECEAE2;color:#857F6E;font-size:12.5px;font-weight:700;padding:7px 13px;border-radius:8px;">● Borrador</span>
      </div>
      <div style="display:flex;gap:18px;font-size:12px;color:#98A088;flex-wrap:wrap;">
        <span><span style="color:#1F6F6F;font-weight:700;">Teal</span> activo/válido</span>
        <span><span style="color:#A77B1C;font-weight:700;">Oro</span> pendiente</span>
        <span><span style="color:#C0512F;font-weight:700;">Coral</span> requiere acción</span>
        <span><span style="color:#566A3D;font-weight:700;">Oliva</span> cerrado con éxito</span>
        <span><span style="color:#A8503A;font-weight:700;">Arcilla</span> rechazo</span>
        <span><span style="color:#857F6E;font-weight:700;">Gris</span> inactivo</span>
      </div>
    </div>
  </section>

  <footer style="padding:36px 0;display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#98A088;">
    <span>MyPetLive · Sistema de diseño v1.0</span>
    <span>Continúa → <a href="/" style="color:#1F6F6F;font-weight:600;text-decoration:none;">Home</a></span>
  </footer>
</div>
`;

export default function Sistema() {
  return (
    <div style={{ fontFamily: FONT_BODY, color: '#3F4A3C', background: '#F6F3EC', minHeight: '100vh' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(246,243,236,.86)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #E5E1D6' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}>
            <span style={{ color: '#1F6F6F', display: 'inline-flex' }}><Paw size={22} /></span>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 800, letterSpacing: '-.02em' }}>MyPet<span style={{ color: '#E8654A' }}>Live</span></span>
          </Link>
          <div style={{ display: 'flex', gap: 22, fontSize: 14, fontWeight: 600 }}>
            <Link to="/sistema" style={{ textDecoration: 'none', color: '#1F6F6F' }}>Sistema</Link>
            <Link to="/mood" style={{ textDecoration: 'none', color: '#6B7464' }}>Mood</Link>
            <Link to="/" style={{ textDecoration: 'none', color: '#6B7464' }}>Home</Link>
            <Link to="/animals" style={{ textDecoration: 'none', color: '#6B7464' }}>Compañeros</Link>
          </div>
        </div>
      </div>
      <div dangerouslySetInnerHTML={{ __html: STYLEGUIDE_HTML }} />
    </div>
  );
}
