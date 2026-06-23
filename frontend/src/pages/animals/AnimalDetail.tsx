import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getAnimal } from '../../api/animals';
import { createAdoption } from '../../api/adoptions';
import { useAuth } from '../../context/AuthContext';
import { useAuthModal } from '../../context/AuthModalContext';
import { toast } from 'react-hot-toast';
import { echoPatita } from '../../api/patitas';
import { getQuestionnaireByProtectora } from '../../api/questionnaire';
import { toAbsoluteUrl } from '../../utils/media';

export default function AnimalDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { openAuth } = useAuthModal();
  const nav = useNavigate();
  const { data, isLoading, refetch } = useQuery({
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

  const questions = questionnaireData?.questions || [];
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});

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
  }, [questions.join('|')]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const adoptionMutation = useMutation({
    mutationFn: async (answersPayload?: Array<{ question: string; answer: string }>) => {
      return createAdoption(String(id), undefined, answersPayload);
    },
    onSuccess: res => {
      toast.success(res.status === 'pending' ? 'Solicitud enviada' : 'OK');
      setQuestionnaireOpen(false);
      setQuestionAnswers({});
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error || 'No se pudo crear la solicitud');
    },
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

  const submitAnswers = () => {
    const payload = questions.map(question => ({ question, answer: (questionAnswers[question] || '').trim() }));
    if (payload.some(entry => !entry.answer)) {
      toast.error('Responde todas las preguntas');
      return;
    }
    adoptionMutation.mutate(payload);
  };

  const donate = () => {
    nav(`/donate?animalId=${encodeURIComponent(String(id))}`);
  };

  const patitaMutation = useMutation({
    mutationFn: async () => {
      if (!data?.shelter) throw new Error('missing_shelter');
      const shelterId = typeof data.shelter === 'object' ? data.shelter._id || data.shelter.id : data.shelter;
      return echoPatita({ shelterId: String(shelterId || ''), animalId: String(data._id || data.id || '') });
    },
    onSuccess: () => toast.success('Tu ayuda llegó donde hace falta 🤍'),
    onError: () => toast.error('No se pudo registrar. Inténtalo de nuevo'),
  });
  const showDonateButton = false;

  if (isLoading || !data) return <div className="p-6">Cargando…</div>;
  if (data.isPersonalPet) {
    return <Navigate to="/pet" replace />;
  }
  const a: any = data;
  const canAdopt = a.status === 'publicado';
  const images = Array.isArray(a.images) ? a.images : [];
  const currentImage = images[activeIndex] || images[0];
  const personality = Array.isArray(a.personality) ? a.personality.slice(0, 3) : [];
  const likes = Array.isArray(a.likes) ? a.likes : [];
  const environment = Array.isArray(a.environment) ? a.environment : [];
  const story = a.story || a.description || 'Aún no tenemos historia para este peludo amigo.';
  const shelterIdResolved = shelterId;

  return (
    <div style={{ background: '#F6F3EC', minHeight: '100vh', paddingBottom: 48 }}>
      <div className="w-full" style={{ height: 380, background: '#E7E2D8', position: 'relative' }}>
        {currentImage ? (
          <img src={toAbsoluteUrl(currentImage)} alt={a.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">Sin imagen</div>
        )}
        {images.length > 1 && (
          <div className="absolute inset-0 flex items-center justify-between px-4">
            <button className="px-3 py-1 rounded-full bg-white/80" onClick={() => setActiveIndex(prev => (prev - 1 + images.length) % images.length)}>
              ◀
            </button>
            <button className="px-3 py-1 rounded-full bg-white/80" onClick={() => setActiveIndex(prev => (prev + 1) % images.length)}>
              ▶
            </button>
          </div>
        )}
      </div>
      <div className="mx-auto max-w-4xl p-5 grid gap-6" style={{ color: '#3F4A3C' }}>
        <section className="grid gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-3xl font-semibold flex items-center gap-3">
                {a.name}
                {a.code && (
                  <span className="text-sm font-semibold tracking-wide" style={{ color: '#6A7B4F' }}>{a.code}</span>
                )}
              </h1>
            </div>
            <button className="px-4 py-2 border rounded" onClick={() => refetch()}>
              Refrescar
            </button>
          </div>
          <p className="text-sm" style={{ color: '#7A8273' }}>
            {a.species}
            {a.age ? ` · ${a.age}` : ''}
          </p>
          {personality.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {personality.map((trait: string) => (
                <span key={trait} className="text-xs px-3 py-1 rounded-full border" style={{ borderColor: '#E7E1D5' }}>
                  {trait}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-2">
          <h3 className="text-xl font-semibold">Su historia</h3>
          <p className="leading-relaxed">{story}</p>
        </section>

        {likes.length > 0 && (
          <section className="grid gap-2">
            <h3 className="text-xl font-semibold">Cosas que le hacen feliz</h3>
            <ul className="list-disc ml-6 space-y-1">
              {likes.map((item: string) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        {environment.length > 0 && (
          <section className="grid gap-2">
            <h3 className="text-xl font-semibold">Entorno ideal</h3>
            <ul className="list-disc ml-6 space-y-1">
              {environment.map((item: string) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="grid gap-3 border rounded-2xl p-4" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
          <div>
            {canAdopt && !a.isPersonalPet ? (
              <>
                <p style={{ color: '#7A8273' }}>Si crees que puedes darle un hogar, solicita la adopción.</p>
                <button
                  className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-50"
                  onClick={handleAdoptClick}
                  disabled={!user || !canAdopt || adoptionMutation.isPending}
                  title={!user ? 'Inicia sesión para adoptar' : 'Solicitar adopción'}
                >
                  {adoptionMutation.isPending ? 'Enviando…' : 'Solicitar adopción'}
                </button>
              </>
            ) : (
              <p style={{ color: '#7A8273' }}>Actualmente en: {a.status}</p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {showDonateButton && (
              <button className="px-4 py-2 rounded border" onClick={donate}>
                Donar a este animal
              </button>
            )}
            <button
              className="px-4 py-2 rounded border"
              onClick={() => patitaMutation.mutate()}
              disabled={patitaMutation.isPending || !shelterIdResolved}
            >
              {patitaMutation.isPending ? 'Registrando…' : 'Echar una Patita'}
            </button>
          </div>
        </section>

        {Array.isArray(a.healthHistory) && a.healthHistory.length > 0 && (
          <section className="grid gap-2">
            <h3 className="text-xl font-semibold">Historial de salud</h3>
            <ul className="list-disc ml-6 space-y-1">
              {a.healthHistory.map((entry: any, idx: number) => (
                <li key={idx}>
                  <span className="text-xs" style={{ color: '#7A8273' }}>
                    {entry.date ? new Date(entry.date).toLocaleDateString() : ''}
                  </span>
                  <div>
                    {entry.type}
                    {entry.notes ? ` · ${entry.notes}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

      {Array.isArray(a.vetHistory) && a.vetHistory.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-xl font-semibold">Historial veterinario</h3>
            <ul className="list-disc ml-6 space-y-1">
              {a.vetHistory.map((vh: any, idx: number) => (
                <li key={idx}>
                  <span className="text-xs" style={{ color: '#7A8273' }}>{new Date(vh.date).toLocaleDateString()}</span>
                  <div>
                    {vh.note}
                    {vh.treatment ? ` · ${vh.treatment}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {questionnaireOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg bg-white rounded-2xl p-5 border" style={{ borderColor: '#E7E1D5' }}>
            <h3 className="text-lg font-semibold" style={{ color: '#3F4A3C' }}>Cuestionario de adopción</h3>
            <p className="text-sm" style={{ color: '#7A8273' }}>
              Responde estas preguntas para continuar con la solicitud.
            </p>
            <div className="mt-3 grid gap-3">
              {questions.map(question => (
                <label key={question} className="grid gap-1 text-sm" style={{ color: '#3F4A3C' }}>
                  {question}
                  <textarea
                    className="border rounded px-3 py-2"
                    value={questionAnswers[question] || ''}
                    onChange={e => setQuestionAnswers(prev => ({ ...prev, [question]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setQuestionnaireOpen(false)} className="px-4 py-2 rounded border">
                Cancelar
              </button>
              <button type="button" onClick={submitAnswers} className="px-4 py-2 rounded border" disabled={adoptionMutation.isPending}>
                {adoptionMutation.isPending ? 'Enviando…' : 'Enviar respuestas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
