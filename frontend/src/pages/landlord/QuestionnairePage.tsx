import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus, Trash2, Info, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import { getMyQuestionnaire, saveQuestionnaire } from '../../api/questionnaire';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

// El adoptante responde estas preguntas en un modal donde cada respuesta se
// indexa por el TEXTO de la pregunta (`questionAnswers[question]` en
// AnimalDetail) y el backend las casa igual (`answerMap` en adoption.controller).
// Dos preguntas con el mismo texto comparten caja y el backend guarda una
// respuesta repetida: hay que impedir duplicados aquí, en el origen.
const normalizeQuestion = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

// Límites de sentido común: el cuestionario se responde de una sentada en un
// modal, y el backend no acota ni el número ni la longitud.
const MAX_QUESTIONS = 15;
const MAX_LENGTH = 240;

const BACKEND_ERRORS: Record<string, string> = {
  forbidden: 'Tu sesión no tiene permiso para editar el cuestionario. Vuelve a iniciar sesión.',
  unauthorized: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
};

function backendErrorMessage(error: any, fallback: string) {
  const code = error?.response?.data?.error;
  if (code && BACKEND_ERRORS[code]) return BACKEND_ERRORS[code];
  return fallback;
}

export default function QuestionnairePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['my-questionnaire'],
    queryFn: getMyQuestionnaire,
  });
  const [questions, setQuestions] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  // Lo último confirmado por el servidor: sirve para saber si hay cambios sin
  // guardar y para no pintar como "guardado" lo que solo está en el navegador.
  const [saved, setSaved] = useState<string[] | null>(null);

  useEffect(() => {
    if (!data?.questions) return;
    setQuestions(data.questions);
    setSaved(data.questions);
  }, [data?.questions]);

  const saveMutation = useMutation({
    mutationFn: () => saveQuestionnaire(cleaned),
    onSuccess: response => {
      setQuestions(response.questions);
      setSaved(response.questions);
      // La ficha pública del animal lee el cuestionario por id de protectora con
      // su propia clave de caché: sin invalidarla, el adoptante seguiría viendo
      // las preguntas viejas hasta que caducase.
      qc.setQueryData(['my-questionnaire'], response);
      if (user?._id) qc.invalidateQueries({ queryKey: ['questionnaire', String(user._id)] });
      toast.success('Cuestionario guardado');
    },
    onError: (error: any) => toast.error(backendErrorMessage(error, 'No se pudo guardar el cuestionario')),
  });

  // Lo que se enviaría: el backend descarta vacíos, así que replicamos ese
  // filtro para que el contador y el botón digan la verdad.
  const cleaned = useMemo(() => questions.map(q => q.trim()).filter(Boolean), [questions]);
  const hasBlank = questions.some(q => !q.trim());
  const duplicated = useMemo(() => {
    const seen = new Set<string>();
    const repeated = new Set<number>();
    questions.forEach((q, idx) => {
      const key = normalizeQuestion(q);
      if (!key) return;
      if (seen.has(key)) repeated.add(idx);
      else seen.add(key);
    });
    return repeated;
  }, [questions]);
  const tooLong = questions.some(q => q.trim().length > MAX_LENGTH);
  const dirty = saved !== null && (cleaned.length !== saved.length || cleaned.some((q, i) => q !== saved[i]));
  const blocked = duplicated.size > 0 || tooLong;

  const addQuestion = () => {
    const value = draft.trim().replace(/\s+/g, ' ');
    if (!value) return;
    if (value.length > MAX_LENGTH) {
      toast.error(`Cada pregunta puede tener como máximo ${MAX_LENGTH} caracteres.`);
      return;
    }
    if (questions.length >= MAX_QUESTIONS) {
      toast.error(`Máximo ${MAX_QUESTIONS} preguntas: un cuestionario más largo desanima a los adoptantes.`);
      return;
    }
    if (questions.some(q => normalizeQuestion(q) === normalizeQuestion(value))) {
      toast.error('Esa pregunta ya está en la lista.');
      return;
    }
    setQuestions(prev => [...prev, value]);
    setDraft('');
  };
  const updateQuestion = (idx: number, value: string) =>
    setQuestions(prev => prev.map((q, i) => (i === idx ? value : q)));
  const removeQuestion = (idx: number) =>
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  // El orden se guarda tal cual y es el que ve el adoptante (y el que tendrán sus
  // respuestas en la solicitud), así que hay que poder reordenar.
  const moveQuestion = (idx: number, delta: number) =>
    setQuestions(prev => {
      const next = [...prev];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const card: React.CSSProperties = {
    background: '#fff',
    border: `1px solid ${MPL.border}`,
    borderRadius: 20,
    padding: 24,
  };

  return (
    <div className="grid gap-5" style={{ maxWidth: 760 }}>
      {/* Cabecera */}
      <div className="flex items-center gap-3">
        <span
          style={{
            width: 44, height: 44, borderRadius: 13, background: MPL.teal100, color: MPL.teal,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <ClipboardList size={22} />
        </span>
        <div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, fontWeight: 800, margin: 0, color: MPL.ink }}>
            Cuestionario de adopción
          </h1>
          <p style={{ margin: 0, color: MPL.muted, fontSize: 14 }}>
            Las preguntas que cada adoptante debe responder al solicitar uno de tus animales.
          </p>
        </div>
      </div>

      {/* Aviso de cómo se usa. Con la lista vacía el texto anterior mentía: sin
          preguntas guardadas el adoptante no responde nada y la solicitud entra directa. */}
      <div
        className="flex items-start gap-2.5"
        style={{
          background: saved && saved.length === 0 ? MPL.gold100 : MPL.teal100,
          color: saved && saved.length === 0 ? MPL.goldDark : MPL.tealDark,
          borderRadius: 14, padding: '12px 14px', fontSize: 13.5,
        }}
      >
        <Info size={18} style={{ flexShrink: 0, marginTop: 1 }} />
        {saved && saved.length === 0 ? (
          <span>
            Ahora mismo <strong>no tienes preguntas guardadas</strong>: las solicitudes de adopción te
            llegan sin cuestionario. Añade abajo las preguntas que quieras y guarda.
          </span>
        ) : (
          <span>
            Estas preguntas son <strong>obligatorias</strong>: el adoptante no podrá enviar su solicitud sin
            responderlas todas. Verás sus respuestas en <strong>Solicitudes de adopción</strong>.
          </span>
        )}
      </div>

      {isLoading ? (
        <div style={{ ...card, color: MPL.muted }}>Cargando cuestionario…</div>
      ) : isError ? (
        /* Sin este estado, un fallo de red se leía como "aún no tienes preguntas"
           y al pulsar Guardar se sobrescribía el cuestionario real con una lista vacía. */
        <div style={{ ...card, display: 'grid', gap: 12, justifyItems: 'start' }}>
          <div className="flex items-start gap-2.5" style={{ color: MPL.coralDark }}>
            <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ margin: 0, fontWeight: 800 }}>No hemos podido cargar tu cuestionario</p>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: MPL.muted }}>
                No lo editamos hasta poder leerlo: si guardáramos ahora, borraríamos las preguntas que ya tienes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            style={{ background: MPL.teal, color: '#fff', fontWeight: 700, fontSize: 14, padding: '10px 18px', borderRadius: 12, border: 'none', cursor: 'pointer', opacity: isFetching ? 0.6 : 1 }}
          >
            {isFetching ? 'Reintentando…' : 'Reintentar'}
          </button>
        </div>
      ) : (
        <div style={card} className="grid gap-4">
          {/* Lista de preguntas */}
          {questions.length === 0 ? (
            <div
              className="text-center"
              style={{ color: MPL.muted, border: `1px dashed ${MPL.border}`, borderRadius: 14, padding: '28px 16px' }}
            >
              <p style={{ margin: 0, fontWeight: 700, color: MPL.ink }}>Aún no tienes preguntas</p>
              <p style={{ margin: '4px 0 0', fontSize: 14 }}>Añade abajo la primera pregunta para tus adoptantes.</p>
            </div>
          ) : (
            <div className="grid gap-2.5">
              {questions.map((question, idx) => {
                const isDuplicate = duplicated.has(idx);
                const isEmpty = !question.trim();
                const excess = question.trim().length > MAX_LENGTH;
                const invalid = isDuplicate || excess;
                return (
                  <div key={idx} className="grid gap-1">
                    <div className="flex items-start gap-2.5">
                      <span
                        style={{
                          width: 26, height: 26, marginTop: 6, flexShrink: 0, borderRadius: 8,
                          background: invalid ? MPL.coral100 : MPL.teal100, color: invalid ? MPL.coralDark : MPL.teal,
                          fontWeight: 800, fontSize: 13,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {idx + 1}
                      </span>
                      <textarea
                        className="flex-1"
                        rows={2}
                        maxLength={MAX_LENGTH}
                        style={{ border: `1px solid ${invalid ? MPL.coral : MPL.border}`, borderRadius: 12, padding: '10px 12px', fontSize: 14, color: MPL.ink, resize: 'vertical', minWidth: 0 }}
                        value={question}
                        onChange={e => updateQuestion(idx, e.target.value)}
                      />
                      <div className="flex flex-col" style={{ flexShrink: 0 }}>
                        <button
                          type="button"
                          aria-label="Subir pregunta"
                          disabled={idx === 0}
                          onClick={() => moveQuestion(idx, -1)}
                          style={{ padding: 4, borderRadius: 8, color: MPL.muted, background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1 }}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label="Bajar pregunta"
                          disabled={idx === questions.length - 1}
                          onClick={() => moveQuestion(idx, 1)}
                          style={{ padding: 4, borderRadius: 8, color: MPL.muted, background: 'none', border: 'none', cursor: idx === questions.length - 1 ? 'default' : 'pointer', opacity: idx === questions.length - 1 ? 0.3 : 1 }}
                        >
                          <ArrowDown size={16} />
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label="Eliminar pregunta"
                        onClick={() => removeQuestion(idx)}
                        style={{ marginTop: 4, padding: 8, borderRadius: 10, color: '#B4503C', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                        className="hover:bg-[#F7EDE9]"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    {isDuplicate && (
                      <p style={{ margin: '0 0 0 36px', fontSize: 12.5, color: MPL.coralDark }}>
                        Repetida: el adoptante vería una sola caja para las dos. Cámbiala o bórrala.
                      </p>
                    )}
                    {excess && (
                      <p style={{ margin: '0 0 0 36px', fontSize: 12.5, color: MPL.coralDark }}>
                        Demasiado larga (máximo {MAX_LENGTH} caracteres).
                      </p>
                    )}
                    {isEmpty && (
                      <p style={{ margin: '0 0 0 36px', fontSize: 12.5, color: MPL.muted }}>
                        Vacía: no se guardará.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Añadir pregunta */}
          <div className="grid gap-1" style={{ borderTop: `1px solid ${MPL.border}`, paddingTop: 16 }}>
            <div className="flex items-center gap-2">
              <input
                className="flex-1"
                style={{ border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '10px 12px', fontSize: 14, color: MPL.ink, minWidth: 0 }}
                placeholder="Ej. ¿Has tenido mascotas antes?"
                maxLength={MAX_LENGTH}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); addQuestion(); }
                }}
              />
              <button
                type="button"
                onClick={addQuestion}
                disabled={!draft.trim() || questions.length >= MAX_QUESTIONS}
                className="flex items-center gap-1.5"
                style={{ background: MPL.teal100, color: MPL.teal, fontWeight: 700, fontSize: 14, padding: '10px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', opacity: !draft.trim() || questions.length >= MAX_QUESTIONS ? 0.5 : 1, flexShrink: 0 }}
              >
                <Plus size={17} /> Añadir
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: MPL.muted }}>
              {questions.length >= MAX_QUESTIONS
                ? `Has llegado al máximo de ${MAX_QUESTIONS} preguntas.`
                : `Hasta ${MAX_QUESTIONS} preguntas. Cambiar o borrar preguntas no altera las respuestas de las solicitudes ya recibidas.`}
            </p>
          </div>

          {/* Guardar */}
          <div className="flex flex-wrap items-center justify-between gap-3" style={{ borderTop: `1px solid ${MPL.border}`, paddingTop: 16 }}>
            <span style={{ color: dirty ? MPL.goldDark : MPL.muted, fontSize: 13, fontWeight: dirty ? 700 : 400 }}>
              {cleaned.length} {cleaned.length === 1 ? 'pregunta' : 'preguntas'}
              {hasBlank ? ' · hay preguntas vacías que no se guardarán' : ''}
              {dirty ? ' · cambios sin guardar' : ''}
            </span>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !dirty || blocked}
              title={blocked ? 'Corrige las preguntas marcadas en rojo' : undefined}
              style={{ background: MPL.teal, color: '#fff', fontWeight: 700, fontSize: 14.5, padding: '11px 24px', borderRadius: 12, border: 'none', cursor: 'pointer', opacity: saveMutation.isPending || !dirty || blocked ? 0.5 : 1 }}
            >
              {saveMutation.isPending ? 'Guardando…' : 'Guardar cuestionario'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
