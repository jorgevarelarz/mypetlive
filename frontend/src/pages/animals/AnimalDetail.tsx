import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, Heart, Home, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getAnimal } from '../../api/animals';
import { createAdoption } from '../../api/adoptions';
import { echoPatita } from '../../api/patitas';
import { getQuestionnaireByProtectora } from '../../api/questionnaire';
import { useAuth } from '../../context/AuthContext';
import { useAuthModal } from '../../context/AuthModalContext';
import { toAbsoluteUrl } from '../../utils/media';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, PawMark, sexLabel, sizeLabel, speciesLabel } from '../../styles/mypetlive';
import PublicHeader from '../../components/PublicHeader';
import { isFavorite, toggleFavorite } from '../../utils/favorites';

function InfoPill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ background: MPL.bg, color: MPL.muted, fontSize: 12.5, fontWeight: 800, padding: '7px 12px', borderRadius: 999 }}>
      {children}
    </span>
  );
}

function DetailBlock({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: MPL.teal100, color: MPL.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </span>
        <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, fontWeight: 800, margin: 0 }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function AnimalDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { openAuth } = useAuthModal();
  const nav = useNavigate();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['animal', id],
    queryFn: () => getAnimal(id || ''),
    enabled: !!id,
  });

  const shelterId = useMemo(() => {
    const value = data?.shelter;
    if (!value) return undefined;
    if (typeof value === 'object') return value?._id || value?.id;
    return value;
  }, [data?.shelter]);

  const { data: questionnaireData } = useQuery({
    queryKey: ['questionnaire', shelterId],
    queryFn: () => getQuestionnaireByProtectora(String(shelterId)),
    enabled: Boolean(shelterId),
  });

  const questions = useMemo(() => questionnaireData?.questions || [], [questionnaireData?.questions]);
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [favorite, setFavorite] = useState(() => isFavorite(String(id || '')));

  useEffect(() => {
    if (!questions.length) {
      setQuestionAnswers({});
      return;
    }
    setQuestionAnswers(prev => {
      const next: Record<string, string> = {};
      questions.forEach(q => {
        next[q] = prev[q] || '';
      });
      return next;
    });
  }, [questions]);

  useEffect(() => {
    window.scrollTo(0, 0);
    setFavorite(isFavorite(String(id || '')));
  }, [id]);

  const handleFavoriteClick = () => {
    const favorites = toggleFavorite(String(id || ''));
    setFavorite(favorites.includes(String(id || '')));
  };

  const adoptionMutation = useMutation({
    mutationFn: async (answersPayload?: Array<{ question: string; answer: string }>) => createAdoption(String(id), undefined, answersPayload),
    onSuccess: res => {
      toast.success(res.status === 'pending' ? 'Solicitud enviada' : 'Solicitud creada');
      setQuestionnaireOpen(false);
      setQuestionAnswers({});
      nav('/adoptions/mine');
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error || 'No se pudo crear la solicitud');
    },
  });

  const patitaMutation = useMutation({
    mutationFn: async () => {
      if (!data?.shelter) throw new Error('missing_shelter');
      const resolvedShelterId = typeof data.shelter === 'object' ? data.shelter._id || data.shelter.id : data.shelter;
      return echoPatita({ shelterId: String(resolvedShelterId || ''), animalId: String(data._id || data.id || '') });
    },
    onSuccess: () => toast.success('Tu ayuda llegó donde hace falta'),
    onError: () => toast.error('No se pudo registrar. Inténtalo de nuevo'),
  });

  const proceedAdopt = () => {
    if (questions.length > 0) {
      setQuestionnaireOpen(true);
      return;
    }
    adoptionMutation.mutate(undefined);
  };

  const handleAdoptClick = () => {
    if (!user) {
      openAuth({
        mode: 'register',
        message: 'Crea tu cuenta para solicitar la adopción.',
        onSuccess: proceedAdopt,
      });
      return;
    }
    proceedAdopt();
  };

  const handlePatitaClick = () => {
    if (!user) {
      openAuth({
        mode: 'login',
        message: 'Inicia sesión para echar una Patita.',
        onSuccess: () => patitaMutation.mutate(),
      });
      return;
    }
    patitaMutation.mutate();
  };

  const submitAnswers = () => {
    const payload = questions.map(question => ({ question, answer: (questionAnswers[question] || '').trim() }));
    if (payload.some(entry => !entry.answer)) {
      toast.error('Responde todas las preguntas');
      return;
    }
    adoptionMutation.mutate(payload);
  };

  if (isLoading || !data) {
    return <div style={{ fontFamily: MPL_FONT_BODY, background: MPL.bg, minHeight: '100vh', padding: 32, color: MPL.muted }}>Cargando ficha...</div>;
  }
  if (data.isPersonalPet) return <Navigate to="/pet" replace />;

  const a: any = data;
  const canAdopt = a.status === 'publicado';
  const images = Array.isArray(a.images) ? a.images : [];
  const currentImage = images[activeIndex] || images[0];
  const personality = Array.isArray(a.personality) ? a.personality.slice(0, 4) : [];
  const likes = Array.isArray(a.likes) ? a.likes : [];
  const environment = Array.isArray(a.environment) ? a.environment : [];
  const story = a.story || a.description || 'Aún no tenemos historia para este compañero.';
  const shelterName = typeof a.shelter === 'object' ? a.shelter?.name || a.shelter?.email : 'Protectora verificada';
  const gallery: Array<string | null> = images.slice(0, 4);
  const meta = [speciesLabel(a.species), sexLabel(a.sex), sizeLabel(a.size), a.age].filter(Boolean);

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, background: MPL.bg, color: MPL.ink, minHeight: '100vh' }}>
      <style>{`
        .detail-wrap{max-width:1180px;margin:0 auto;padding:30px 32px 64px;}
        .detail-grid{display:grid;grid-template-columns:minmax(0,1.1fr) 360px;gap:28px;align-items:start;}
        .detail-gallery{display:grid;grid-template-columns:1fr 112px;gap:12px;}
        .detail-mobile-cta{display:none;}
        @media (max-width: 920px){.detail-grid{grid-template-columns:1fr}.detail-side{position:static!important}.detail-adopt-card{display:none!important}.detail-gallery{grid-template-columns:1fr}.detail-thumbs{display:flex!important;overflow:auto}.detail-wrap{padding:0 0 96px}.detail-wrap > button{margin:16px 20px!important}.detail-gallery{display:block}.detail-gallery > div:first-child{min-height:300px!important;border-radius:0!important;box-shadow:none!important}.detail-thumbs{display:none!important}.detail-grid{gap:0!important}.detail-grid > div:first-child{gap:14px!important}.detail-grid section:not(.detail-gallery){margin-left:20px!important;margin-right:20px!important}.detail-grid h1{font-size:30px!important}.detail-mobile-cta{position:fixed;left:0;right:0;bottom:0;z-index:36;display:flex;gap:12px;align-items:center;background:#fff;border-top:1px solid ${MPL.border};padding:14px 20px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -12px 30px -24px rgba(31,55,40,.35)}}
      `}</style>
      <PublicHeader />

      <main className="detail-wrap">
        <button type="button" onClick={() => nav('/animals')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: 0, background: 'none', color: MPL.muted, font: 'inherit', fontWeight: 800, cursor: 'pointer', marginBottom: 18 }}>
          <ArrowLeft size={17} />
          Volver a compañeros
        </button>

        <div className="detail-grid">
          <div style={{ display: 'grid', gap: 22 }}>
            <section className="detail-gallery">
              <div style={{ minHeight: 460, borderRadius: 24, background: '#E6E0D2', overflow: 'hidden', position: 'relative', boxShadow: '0 18px 50px -32px rgba(31,55,40,.45)' }}>
                {currentImage ? (
                  <img src={toAbsoluteUrl(currentImage)} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                ) : (
                  <div style={{ height: 460, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MPL.faint }}>Sin imagen</div>
                )}
                {images.length > 1 && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, pointerEvents: 'none' }}>
                    <button type="button" aria-label="Imagen anterior" onClick={() => setActiveIndex(prev => (prev - 1 + images.length) % images.length)} style={{ pointerEvents: 'auto', width: 40, height: 40, borderRadius: 999, border: 0, background: 'rgba(255,255,255,.88)', color: MPL.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <ChevronLeft size={18} />
                    </button>
                    <button type="button" aria-label="Imagen siguiente" onClick={() => setActiveIndex(prev => (prev + 1) % images.length)} style={{ pointerEvents: 'auto', width: 40, height: 40, borderRadius: 999, border: 0, background: 'rgba(255,255,255,.88)', color: MPL.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </div>
              <div className="detail-thumbs" style={{ display: 'grid', gap: 12 }}>
                {(gallery.length ? gallery : [null]).map((img, idx) => (
                  <button key={img || idx} type="button" onClick={() => setActiveIndex(idx)} style={{ height: 104, borderRadius: 16, border: activeIndex === idx ? `2px solid ${MPL.teal}` : `1px solid ${MPL.border}`, background: '#E6E0D2', overflow: 'hidden', padding: 0, minWidth: 104, cursor: 'pointer' }}>
                    {img && <img src={toAbsoluteUrl(img)} alt={`${a.name} ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </button>
                ))}
              </div>
            </section>

            <section style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, padding: 28 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: MPL.teal100, color: MPL.tealDark, fontSize: 12.5, fontWeight: 800, padding: '7px 12px', borderRadius: 999, marginBottom: 14 }}>
                    <PawMark size={14} />
                    {canAdopt ? 'Disponible para adopción' : `Estado: ${a.status}`}
                  </div>
                  <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 46, lineHeight: 1, fontWeight: 800, margin: 0 }}>{a.name}</h1>
                  {shelterName && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: MPL.muted, fontSize: 14.5, marginTop: 10 }}>
                      <MapPin size={16} />
                      {shelterName}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={handleFavoriteClick} style={{ width: 42, height: 42, borderRadius: 13, border: `1px solid ${favorite ? MPL.coral : MPL.border}`, background: favorite ? '#FCE9E4' : '#fff', color: favorite ? MPL.coral : MPL.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} aria-label={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}>
                    <Heart size={18} fill={favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button type="button" onClick={() => refetch()} style={{ width: 42, height: 42, borderRadius: 13, border: `1px solid ${MPL.border}`, background: '#fff', color: MPL.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} aria-label="Actualizar ficha">
                    <RefreshCw size={17} className={isFetching ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
                {meta.map(item => <InfoPill key={item}>{item}</InfoPill>)}
                {personality.map((trait: string) => <InfoPill key={trait}>{trait}</InfoPill>)}
              </div>
            </section>

            <DetailBlock icon={<Heart size={18} />} title="Su historia">
              <p style={{ fontSize: 16, lineHeight: 1.65, color: MPL.muted, margin: 0 }}>{story}</p>
            </DetailBlock>

            {(likes.length > 0 || environment.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18 }}>
                {likes.length > 0 && (
                  <DetailBlock icon={<Check size={18} />} title="Le gusta">
                    <ul style={{ display: 'grid', gap: 8, padding: 0, margin: 0, listStyle: 'none', color: MPL.muted }}>
                      {likes.map((item: string) => <li key={item}>• {item}</li>)}
                    </ul>
                  </DetailBlock>
                )}
                {environment.length > 0 && (
                  <DetailBlock icon={<Home size={18} />} title="Entorno ideal">
                    <ul style={{ display: 'grid', gap: 8, padding: 0, margin: 0, listStyle: 'none', color: MPL.muted }}>
                      {environment.map((item: string) => <li key={item}>• {item}</li>)}
                    </ul>
                  </DetailBlock>
                )}
              </div>
            )}

            {Array.isArray(a.healthHistory) && a.healthHistory.length > 0 && (
              <DetailBlock icon={<ShieldCheck size={18} />} title="Historial de salud">
                <ul style={{ display: 'grid', gap: 10, padding: 0, margin: 0, listStyle: 'none', color: MPL.muted }}>
                  {a.healthHistory.map((entry: any, idx: number) => (
                    <li key={idx} style={{ borderBottom: `1px solid ${MPL.bg}`, paddingBottom: 10 }}>
                      <span style={{ fontSize: 12, color: MPL.faint }}>{entry.date ? new Date(entry.date).toLocaleDateString() : ''}</span>
                      <div>{entry.type}{entry.notes ? ` · ${entry.notes}` : ''}</div>
                    </li>
                  ))}
                </ul>
              </DetailBlock>
            )}
          </div>

          <aside className="detail-side" style={{ position: 'sticky', top: 92, display: 'grid', gap: 16 }}>
            <section className="detail-adopt-card" style={{ background: MPL.teal, color: '#fff', borderRadius: 22, padding: 24, position: 'relative', overflow: 'hidden' }}>
              <span style={{ position: 'absolute', right: -22, bottom: -28, color: 'rgba(255,255,255,.10)' }}><PawMark size={150} /></span>
              <div style={{ position: 'relative' }}>
                <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 28, lineHeight: 1.05, fontWeight: 800, marginBottom: 10 }}>
                  ¿Encaja contigo?
                </div>
                <p style={{ color: 'rgba(255,255,255,.86)', lineHeight: 1.5, margin: '0 0 20px' }}>
                  Solicita la adopción y la protectora revisará tu candidatura.
                </p>
                <button type="button" onClick={handleAdoptClick} disabled={!canAdopt || adoptionMutation.isPending} style={{ width: '100%', background: canAdopt ? MPL.coral : 'rgba(255,255,255,.25)', color: '#fff', border: 0, borderRadius: 14, padding: '14px 18px', font: 'inherit', fontWeight: 800, cursor: canAdopt ? 'pointer' : 'not-allowed' }}>
                  {adoptionMutation.isPending ? 'Enviando...' : 'Solicitar adopción'}
                </button>
              </div>
            </section>

            <section style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, padding: 22 }}>
              <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800, margin: '0 0 12px' }}>Impacto</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 38, height: 38, borderRadius: 12, background: MPL.gold100, color: MPL.goldDark, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PawMark size={18} /></span>
                  <div>
                    <div style={{ fontWeight: 800 }}>Echar una Patita</div>
                    <div style={{ color: MPL.faint, fontSize: 12.5 }}>Apoyo directo a la protectora</div>
                  </div>
                </div>
                <button type="button" onClick={handlePatitaClick} disabled={patitaMutation.isPending || !shelterId} style={{ background: '#fff', color: MPL.teal, border: `1.5px solid ${MPL.teal}`, borderRadius: 13, padding: '12px 16px', font: 'inherit', fontWeight: 800, cursor: shelterId ? 'pointer' : 'not-allowed' }}>
                  {patitaMutation.isPending ? 'Registrando...' : 'Sumar Patita'}
                </button>
              </div>
            </section>

            <section style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: MPL.muted, fontSize: 14 }}>
                <CalendarDays size={18} color={MPL.teal} />
                Si la solicitud avanza, la protectora propondrá una cita desde el panel.
              </div>
            </section>
          </aside>
        </div>
      </main>

      <div className="detail-mobile-cta">
        <button type="button" onClick={handleAdoptClick} disabled={!canAdopt || adoptionMutation.isPending} style={{ flex: 1, background: canAdopt ? MPL.coral : MPL.faint, color: '#fff', border: 0, borderRadius: 14, padding: '15px 16px', font: 'inherit', fontWeight: 800, cursor: canAdopt ? 'pointer' : 'not-allowed', boxShadow: canAdopt ? '0 8px 18px -8px rgba(232,101,74,.7)' : 'none' }}>
          {adoptionMutation.isPending ? 'Enviando...' : 'Solicitar adopción'}
        </button>
        <button type="button" onClick={handlePatitaClick} disabled={patitaMutation.isPending || !shelterId} aria-label="Echar una Patita" style={{ width: 50, height: 50, flex: 'none', border: `1.5px solid ${MPL.border}`, background: '#fff', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MPL.gold, cursor: shelterId ? 'pointer' : 'not-allowed' }}>
          <PawMark size={22} />
        </button>
        <button type="button" onClick={handleFavoriteClick} aria-label={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} style={{ width: 50, height: 50, flex: 'none', border: `1.5px solid ${favorite ? MPL.coral : MPL.border}`, background: favorite ? '#FCE9E4' : '#fff', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: favorite ? MPL.coral : MPL.muted, cursor: 'pointer' }}>
          <Heart size={22} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      {questionnaireOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(31,55,40,.42)', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 22, padding: 24, border: `1px solid ${MPL.border}`, boxShadow: '0 24px 70px -36px rgba(31,55,40,.65)' }}>
            <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, margin: '0 0 6px' }}>Cuestionario de adopción</h3>
            <p style={{ color: MPL.muted, margin: '0 0 18px' }}>Responde estas preguntas para continuar con la solicitud.</p>
            <div style={{ display: 'grid', gap: 13 }}>
              {questions.map(question => (
                <label key={question} style={{ display: 'grid', gap: 7, fontSize: 14, fontWeight: 700 }}>
                  {question}
                  <textarea
                    style={{ border: `1.5px solid ${MPL.border}`, borderRadius: 14, padding: 12, minHeight: 84, resize: 'vertical', font: 'inherit', color: MPL.ink }}
                    value={questionAnswers[question] || ''}
                    onChange={e => setQuestionAnswers(prev => ({ ...prev, [question]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setQuestionnaireOpen(false)} style={{ border: `1px solid ${MPL.border}`, background: '#fff', borderRadius: 13, padding: '11px 16px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button type="button" onClick={submitAnswers} disabled={adoptionMutation.isPending} style={{ border: 0, background: MPL.coral, color: '#fff', borderRadius: 13, padding: '11px 16px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                {adoptionMutation.isPending ? 'Enviando...' : 'Enviar respuestas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
