import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { searchAnimals } from '../../api/animals';
import { useAuthModal } from '../../context/AuthModalContext';
import { toAbsoluteUrl } from '../../utils/media';

const FONT_DISPLAY = "'Bricolage Grotesque', sans-serif";
const FONT_BODY = "'Hanken Grotesk', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

const C = {
  bg: '#F6F3EC', ink: '#3F4A3C', teal: '#1F6F6F', coral: '#E8654A', olive: '#6A7B4F',
  gold: '#E9A93C', muted: '#6B7464', faint: '#98A088', border: '#E5E1D6', panel: '#EFEADF', teal100: '#E2EEEC',
};

function Paw({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} style={{ display: 'inline-block', color }} aria-hidden="true">
      <ellipse cx="24" cy="32" rx="11" ry="8.5" fill="currentColor" />
      <circle cx="11" cy="23" r="4.6" fill="currentColor" />
      <circle cx="19.5" cy="15" r="5" fill="currentColor" />
      <circle cx="28.5" cy="15" r="5" fill="currentColor" />
      <circle cx="37" cy="23" r="4.6" fill="currentColor" />
    </svg>
  );
}

const STEPS = [
  { n: '01', title: 'Descubre', desc: 'Explora animales y filtra por lo que encaja contigo.' },
  { n: '02', title: 'Solicita', desc: 'Envía tu solicitud y completa un breve cuestionario.' },
  { n: '03', title: 'Conoce', desc: 'La protectora propone una cita o visita.' },
  { n: '04', title: 'Adopta', desc: 'Se cierra el proceso y registras a tu mascota.' },
  { n: '05', title: 'Sigue', desc: 'Cupones, recordatorios y Patitas tras adoptar.' },
];

const SIZE_LABEL: Record<string, string> = { small: 'Pequeño', medium: 'Mediano', large: 'Grande' };

export default function Landing() {
  const { openAuth } = useAuthModal();
  const { data } = useQuery({
    queryKey: ['landing-featured'],
    queryFn: () => searchAnimals({ limit: 4, page: 1, sort: 'createdAt', dir: 'desc' }),
    staleTime: 60_000,
  });
  const pets = (data?.items || []).slice(0, 4);
  const heroImg = pets.find((p: any) => Array.isArray(p.images) && p.images[0]);

  return (
    <div style={{ fontFamily: FONT_BODY, color: C.ink, background: C.bg, minHeight: '100vh' }}>
      <style>{`
        .lp-ph{background-image:repeating-linear-gradient(135deg,rgba(63,74,60,.06) 0 8px,rgba(63,74,60,0) 8px 16px);}
        .lp a{color:inherit;text-decoration:none;}
        .lp-navlink:hover{color:${C.teal} !important;}
        .lp-card{transition:transform .18s ease, box-shadow .18s ease;}
        .lp-card:hover{transform:translateY(-4px);box-shadow:0 1px 3px rgba(31,55,40,.06),0 22px 44px -22px rgba(31,55,40,.28) !important;}
        .lp-cta:hover{filter:brightness(1.05);}
      `}</style>

      <div className="lp">
        {/* NAV */}
        <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(246,243,236,.86)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '15px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ color: C.teal, display: 'inline-flex' }}><Paw size={24} /></span>
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>MyPet<span style={{ color: C.coral }}>Live</span></span>
            </Link>
            <div style={{ display: 'flex', gap: 28, fontSize: 14.5, fontWeight: 600, color: '#6B7464', alignItems: 'center' }}>
              <Link className="lp-navlink" to="/animals">Adoptar</Link>
              <a className="lp-navlink" href="#como">Cómo funciona</a>
              <a className="lp-navlink" href="#impacto">Impacto</a>
              <button className="lp-navlink" onClick={() => openAuth({ mode: 'register', message: 'Crea tu cuenta de protectora.' })} style={{ background: 'none', border: 'none', font: 'inherit', cursor: 'pointer', color: '#6B7464' }}>Protectoras</button>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button className="lp-navlink" onClick={() => openAuth({ mode: 'login' })} style={{ background: 'none', border: 'none', font: 'inherit', cursor: 'pointer', fontSize: 14.5, fontWeight: 600, color: C.ink }}>Entrar</button>
              <Link className="lp-cta" to="/animals" style={{ background: C.coral, color: '#fff', fontSize: 14.5, fontWeight: 700, padding: '11px 22px', borderRadius: 14, boxShadow: '0 6px 16px -8px rgba(232,101,74,.7)' }}>Adoptar</Link>
            </div>
          </div>
        </div>

        {/* HERO */}
        <section style={{ maxWidth: 1180, margin: '0 auto', padding: '60px 32px 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 48, alignItems: 'center' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.teal100, color: '#176363', fontSize: 13, fontWeight: 700, padding: '8px 15px', borderRadius: 999, marginBottom: 24 }}>
                <Paw size={15} />
                Adopción responsable
              </div>
              <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 62, lineHeight: .98, fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 22px' }}>Encuentra a tu <span style={{ color: C.teal }}>nuevo mejor</span> <span style={{ color: C.coral }}>amigo</span></h1>
              <p style={{ fontSize: 19, lineHeight: 1.55, color: C.muted, margin: '0 0 32px', maxWidth: 480 }}>Adopción responsable, simple y transparente. Conectamos protectoras y familias, y acompañamos cada paso después de adoptar.</p>
              <div style={{ display: 'flex', gap: 14, marginBottom: 34, flexWrap: 'wrap' }}>
                <Link className="lp-cta" to="/animals" style={{ background: C.coral, color: '#fff', fontSize: 16, fontWeight: 700, padding: '16px 30px', borderRadius: 14, boxShadow: '0 8px 20px -8px rgba(232,101,74,.7)' }}>Quiero adoptar</Link>
                <button className="lp-cta" onClick={() => openAuth({ mode: 'register', message: 'Crea tu cuenta de protectora.' })} style={{ background: '#fff', color: C.teal, border: `1.5px solid ${C.teal}`, fontSize: 16, fontWeight: 700, padding: '15px 28px', borderRadius: 14, cursor: 'pointer' }}>Soy protectora</button>
              </div>
              <div style={{ display: 'flex', gap: 32 }}>
                <div><div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 800, color: C.ink }}>{data?.total ?? '—'}</div><div style={{ fontSize: 13, color: C.faint, fontWeight: 600 }}>animales</div></div>
                <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 32 }}><div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 800, color: C.ink }}>+85</div><div style={{ fontSize: 13, color: C.faint, fontWeight: 600 }}>protectoras</div></div>
                <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 32 }}><div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 800, color: C.gold }}>126k</div><div style={{ fontSize: 13, color: C.faint, fontWeight: 600 }}>Patitas generadas</div></div>
              </div>
            </div>
            {/* hero visual */}
            <div style={{ position: 'relative' }}>
              <div className={heroImg ? '' : 'lp-ph'} style={{ aspectRatio: '4/4.4', borderRadius: 28, backgroundColor: '#E6E0D2', overflow: 'hidden', boxShadow: '0 20px 60px -30px rgba(31,55,40,.5)' }}>
                {heroImg && <img src={toAbsoluteUrl(heroImg.images[0])} alt={heroImg.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ position: 'absolute', bottom: 24, left: -26, background: '#fff', borderRadius: 18, padding: '14px 16px', boxShadow: '0 16px 40px -20px rgba(31,55,40,.4)', display: 'flex', alignItems: 'center', gap: 12, width: 230 }}>
                <div style={{ width: 50, height: 50, borderRadius: 12, background: C.teal100, color: C.teal, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Paw size={26} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 16 }}>Adopción responsable</div>
                  <div style={{ fontSize: 12, color: C.faint }}>protectoras verificadas</div>
                </div>
              </div>
              <div style={{ position: 'absolute', top: 20, right: -20, background: '#fff', borderRadius: 16, padding: '11px 15px', boxShadow: '0 16px 40px -20px rgba(31,55,40,.4)', display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ color: C.gold, display: 'inline-flex' }}><Paw size={20} /></span>
                <div><div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 15, color: '#A77B1C', lineHeight: 1 }}>+40</div><div style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}>Patitas</div></div>
              </div>
            </div>
          </div>
        </section>

        {/* DESTACADOS */}
        <section style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 26 }}>
            <div>
              <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 34, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 6px' }}>Buscan hogar ahora</h2>
              <p style={{ fontSize: 16, color: C.muted, margin: 0 }}>Animales destacados de protectoras verificadas.</p>
            </div>
            <Link className="lp-navlink" to="/animals" style={{ fontSize: 15, fontWeight: 700, color: C.teal }}>Ver catálogo →</Link>
          </div>
          {pets.length === 0 ? (
            <div style={{ color: C.muted, padding: '24px 0' }}>Pronto verás aquí los animales destacados.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
              {pets.map((p: any) => {
                const img = Array.isArray(p.images) ? p.images[0] : null;
                const meta = [p.species, SIZE_LABEL[p.size] || p.size].filter(Boolean).join(' · ');
                const tags = Array.isArray(p.personality) ? p.personality.slice(0, 2) : [];
                return (
                  <Link key={p._id || p.id} className="lp-card" to={`/animals/${p._id || p.id}`} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 1px 3px rgba(31,55,40,.06),0 8px 24px -16px rgba(31,55,40,.18)', display: 'block' }}>
                    <div className={img ? '' : 'lp-ph'} style={{ height: 190, backgroundColor: '#E6E0D2', position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: 12, overflow: 'hidden' }}>
                      {img && <img src={toAbsoluteUrl(img)} alt={p.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                      <span style={{ position: 'relative', background: C.teal100, color: '#176363', fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 8 }}>● Publicado</span>
                    </div>
                    <div style={{ padding: '16px 18px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 800 }}>{p.name}</span>
                        <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{p.age}</span>
                      </div>
                      <div style={{ fontSize: 13, color: C.muted, margin: '4px 0 12px' }}>{meta}</div>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        {tags.map((t: string) => (
                          <span key={t} style={{ background: C.bg, color: C.muted, fontSize: 11.5, fontWeight: 600, padding: '5px 11px', borderRadius: 999 }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* COMO FUNCIONA */}
        <section id="como" style={{ background: C.panel, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, marginTop: 32 }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '68px 32px' }}>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: C.faint, fontWeight: 700, marginBottom: 12 }}>Cómo funciona</div>
              <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 40, fontWeight: 800, letterSpacing: '-.02em', margin: 0 }}>De conocer a convivir, en 5 pasos</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 18 }}>
              {STEPS.map(s => (
                <div key={s.n} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 20, padding: '26px 22px' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: C.teal100, color: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                    <Paw size={22} />
                  </div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.coral, fontWeight: 500, marginBottom: 6 }}>PASO {s.n}</div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 800, marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, color: C.muted }}>{s.desc}</div>
                </div>
              ))}
            </div>
            <p style={{ textAlign: 'center', fontSize: 15, color: C.muted, margin: '36px 0 0' }}>Después de adoptar sigues con nosotros: <strong style={{ color: C.ink }}>cupones, recordatorios y servicios</strong> para tu mascota.</p>
          </div>
        </section>

        {/* IMPACTO */}
        <section id="impacto" style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: 48, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: C.faint, fontWeight: 700, marginBottom: 14 }}>Nuestro impacto</div>
              <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 42, lineHeight: 1.02, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 18px' }}>Cada adopción mueve todo un ecosistema</h2>
              <p style={{ fontSize: 17, lineHeight: 1.6, color: C.muted, margin: '0 0 24px' }}>Las <strong style={{ color: '#A77B1C' }}>Patitas</strong> son nuestra moneda de impacto: cada compra con cupón, donación o campaña genera valor que financia directamente a las protectoras.</p>
              <Link className="lp-navlink" to="/animals" style={{ fontSize: 15, fontWeight: 700, color: C.teal }}>Empieza a sumar Patitas →</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <div style={{ background: C.teal, color: '#fff', borderRadius: 20, padding: 28 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 40, fontWeight: 800, lineHeight: 1 }}>85</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,.85)', marginTop: 8 }}>protectoras activas</div>
              </div>
              <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 20, padding: 28 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 40, fontWeight: 800, lineHeight: 1, color: C.ink }}>1.247</div>
                <div style={{ fontSize: 14, color: C.muted, marginTop: 8 }}>adopciones completadas</div>
              </div>
              <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 20, padding: 28 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 40, fontWeight: 800, lineHeight: 1, color: C.ink }}>€38.200</div>
                <div style={{ fontSize: 14, color: C.muted, marginTop: 8 }}>donados a protectoras</div>
              </div>
              <div style={{ background: C.gold, color: '#fff', borderRadius: 20, padding: 28 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 40, fontWeight: 800, lineHeight: 1 }}>126k</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,.9)', marginTop: 8 }}>Patitas generadas</div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA BANNER */}
        <section style={{ maxWidth: 1180, margin: '0 auto 72px', padding: '0 32px' }}>
          <div style={{ background: C.teal, borderRadius: 28, padding: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32, overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'relative', zIndex: 2 }}>
              <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 38, fontWeight: 800, letterSpacing: '-.02em', color: '#fff', margin: '0 0 12px' }}>¿Listo para conocer a tu compañero?</h2>
              <p style={{ fontSize: 17, color: 'rgba(255,255,255,.85)', margin: 0, maxWidth: 440 }}>Explora el catálogo y filtra por lo que de verdad encaja contigo.</p>
            </div>
            <Link className="lp-cta" to="/animals" style={{ background: C.coral, color: '#fff', fontSize: 17, fontWeight: 700, padding: '18px 34px', borderRadius: 16, flex: 'none', position: 'relative', zIndex: 2, boxShadow: '0 10px 24px -10px rgba(0,0,0,.4)' }}>Ver animales</Link>
            <span style={{ position: 'absolute', right: -30, bottom: -40, color: 'rgba(255,255,255,.08)' }}><Paw size={260} /></span>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ background: C.ink, color: '#E6E0D2' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 32px 32px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 32, paddingBottom: 40, borderBottom: '1px solid rgba(255,255,255,.12)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
                  <span style={{ color: '#fff', display: 'inline-flex' }}><Paw size={24} /></span>
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 800, color: '#fff' }}>MyPet<span style={{ color: '#F2856D' }}>Live</span></span>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(230,224,210,.7)', maxWidth: 280, margin: 0 }}>La infraestructura digital del ecosistema pet: adopción responsable, protectoras y comunidad.</p>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 14 }}>Adoptantes</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, color: 'rgba(230,224,210,.7)' }}>
                  <Link to="/animals">Catálogo</Link><a href="#como">Cómo adoptar</a><Link to="/coupons">Cupones</Link>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 14 }}>Protectoras</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, color: 'rgba(230,224,210,.7)' }}>
                  <button onClick={() => openAuth({ mode: 'register' })} style={{ background: 'none', border: 'none', font: 'inherit', cursor: 'pointer', color: 'rgba(230,224,210,.7)', textAlign: 'left', padding: 0 }}>Panel</button>
                  <Link to="/donate">Donaciones</Link>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 14 }}>Marca</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, color: 'rgba(230,224,210,.7)' }}>
                  <Link to="/sistema">Sistema de diseño</Link>
                </div>
              </div>
            </div>
            <div style={{ paddingTop: 24, fontSize: 13, color: 'rgba(230,224,210,.5)', display: 'flex', justifyContent: 'space-between' }}>
              <span>© 2026 MyPetLive</span>
              <span>Hecho para protectoras y familias</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
