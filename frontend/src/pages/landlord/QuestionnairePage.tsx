import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus, Trash2, Info, AlertTriangle } from 'lucide-react';
import { getMyQuestionnaire, saveQuestionnaire } from '../../api/questionnaire';
import { toast } from 'react-hot-toast';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

const normalize = (value: string) => value.trim().toLowerCase();

export default function QuestionnairePage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-questionnaire'],
    queryFn: getMyQuestionnaire,
  });
  const [questions, setQuestions] = useState<string[]>([]);
  // Última versión confirmada por el servidor: sirve para saber si hay cambios sin
  // guardar y para no ofrecer "Guardar" cuando no hay nada que guardar.
  const [saved, setSaved] = useState<string[] | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    // Solo hidratamos una vez. Con `[data?.questions]` cualquier refetch (react-query
    // recarga al volver a la pestaña) devolvía un array nuevo y machacaba en silencio
    // las preguntas que la protectora estaba escribiendo.
    if (!data || hydrated) return;
    setQuestions(data.questions || []);
    setSaved(data.questions || []);
    setHydrated(true);
  }, [data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: (payload: string[]) => saveQuestionnaire(payload),
    onSuccess: response => {
      setQuestions(response.questions);
      setSaved(response.questions);
      toast.success('Cuestionario guardado');
    },
    onError: () => toast.error('No se pudo guardar el cuestionario. Inténtalo de nuevo.'),
  });

  const cleaned = useMemo(() => questions.map(q => q.trim()).filter(Boolean), [questions]);
  const hasBlank = questions.some(q => !q.trim());
  // El texto de la pregunta es su identificador: el adoptante responde en un
  // `Record<pregunta, respuesta>` y `adoption.create` casa las respuestas por texto
  // exacto. Dos preguntas iguales comparten casilla en el formulario del adoptante y
  // la protectora recibe una sola respuesta, así que hay que impedirlas.
  const duplicates = useMemo(() => {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const question of cleaned) {
      const key = normalize(question);
      if (seen.has(key)) repeated.add(key);
      seen.add(key);
    }
    return repeated;
  }, [cleaned]);
  const dirty = saved !== null && JSON.stringify(cleaned) !== JSON.stringify(saved);

  const addQuestion = () => {
    const value = draft.trim();
    if (!value) return;
    if (questions.some(q => normalize(q) === normalize(value))) {
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

  const onSave = () => {
    if (hasBlank) {
      // El servidor descarta las vacías sin decir nada y la protectora veía
      // desaparecer una fila al guardar sin entender por qué.
      toast.error('Hay preguntas en blanco: complétalas o elimínalas.');
      return;
    }
    if (duplicates.size) {
      toast.error('Hay preguntas repetidas. El adoptante solo podría responder una vez.');
      return;
    }
    if (!cleaned.length && (saved?.length || 0) > 0) {
      const confirmed = window.confirm(
        'Vas a dejar el cuestionario vacío.\n\n' +
          'A partir de ese momento los adoptantes podrán enviar su solicitud sin responder nada. ¿Continuar?',
      );
      if (!confirmed) return;
    }
    saveMutation.mutate(cleaned);
  };

  const card: React.CSSProperties = {
    background: '#fff',
    border: `1px solid ${MPL.border}`,
    borderRadius: 20,
    padding: 24,
  };

  return (
    <div className="grid gap-5" style={{ maxWidth: 760, fontFamily: undefined }}>
      {/* Cabecera */}
      <div className="flex items-center gap-3">
        <span
          style={{
            width: 44, height: 44, borderRadius: 13, background: MPL.teal100, color: MPL.teal,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
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

      {/* Aviso de cómo se usa */}
      <div
        className="flex items-start gap-2.5"
        style={{ background: MPL.teal100, color: MPL.tealDark, borderRadius: 14, padding: '12px 14px', fontSize: 13.5 }}
      >
        <Info size={18} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Estas preguntas son <strong>obligatorias</strong>: el adoptante no podrá enviar su solicitud sin responderlas.
          Verás sus respuestas en <strong>Solicitudes de adopción</strong>. Las respuestas que ya has recibido se
          conservan tal cual aunque cambies o borres una pregunta.
        </span>
      </div>

      {isError ? (
        // Un fallo de red pintaba "Aún no tienes preguntas" con el botón de guardar
        // activo: bastaba pulsarlo para borrar el cuestionario real y dejar que
        // cualquiera solicitara adopciones sin responder nada.
        <div style={{ ...card, display: 'grid', gap: 10, justifyItems: 'start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: MPL.ink }}>
            <AlertTriangle size={18} color={MPL.coralDark} />
            No hemos podido cargar tu cuestionario
          </div>
          <div style={{ color: MPL.muted, fontSize: 14 }}>
            No lo damos por vacío para no arriesgarnos a sobrescribir tus preguntas. Vuelve a intentarlo.
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '9px 18px', fontSize: 13.5, fontWeight: 800, color: MPL.tealDark, cursor: 'pointer' }}
          >
            Reintentar
          </button>
        </div>
      ) : isLoading || !hydrated ? (
        <div style={card}>Cargando…</div>
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
                const isDuplicate = !!question.trim() && duplicates.has(normalize(question));
                const isBlank = !question.trim();
                const wrong = isDuplicate || isBlank;
                return (
                  <div key={idx} className="grid gap-1">
                    <div className="flex items-start gap-2.5">
                      <span
                        style={{
                          width: 26, height: 26, marginTop: 6, flexShrink: 0, borderRadius: 8,
                          background: MPL.teal100, color: MPL.teal, fontWeight: 800, fontSize: 13,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {idx + 1}
                      </span>
                      <textarea
                        className="flex-1"
                        rows={2}
                        style={{ border: `1px solid ${wrong ? MPL.coral : MPL.border}`, borderRadius: 12, padding: '10px 12px', fontSize: 14, color: MPL.ink, resize: 'vertical' }}
                        value={question}
                        onChange={e => updateQuestion(idx, e.target.value)}
                      />
                      <button
                        type="button"
                        aria-label="Eliminar pregunta"
                        onClick={() => removeQuestion(idx)}
                        style={{ marginTop: 4, padding: 8, borderRadius: 10, color: '#B4503C' }}
                        className="hover:bg-[#F7EDE9]"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    {wrong && (
                      <span style={{ marginLeft: 36, fontSize: 12.5, color: MPL.coralDark }}>
                        {isBlank
                          ? 'Sin texto: complétala o elimínala.'
                          : 'Pregunta repetida: el adoptante solo vería una casilla para las dos.'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Añadir pregunta */}
          <div className="flex items-center gap-2" style={{ borderTop: `1px solid ${MPL.border}`, paddingTop: 16 }}>
            <input
              className="flex-1"
              style={{ border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '10px 12px', fontSize: 14, color: MPL.ink }}
              placeholder="Ej. ¿Has tenido mascotas antes?"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addQuestion(); }
              }}
            />
            <button
              type="button"
              onClick={addQuestion}
              className="flex items-center gap-1.5"
              style={{ background: MPL.teal100, color: MPL.teal, fontWeight: 700, fontSize: 14, padding: '10px 16px', borderRadius: 12 }}
            >
              <Plus size={17} /> Añadir
            </button>
          </div>

          {/* Guardar */}
          <div className="flex items-center justify-between gap-3" style={{ borderTop: `1px solid ${MPL.border}`, paddingTop: 16 }}>
            <span style={{ color: dirty ? MPL.coralDark : MPL.muted, fontSize: 13, fontWeight: dirty ? 700 : 400 }}>
              {/* Sin este aviso nada indicaba que lo escrito todavía no está guardado
                  y que, por tanto, el adoptante sigue viendo el cuestionario anterior. */}
              {dirty
                ? `${cleaned.length} pregunta(s) · cambios sin guardar`
                : `${cleaned.length} pregunta(s) guardadas`}
            </span>
            <button
              type="button"
              onClick={onSave}
              disabled={saveMutation.isPending || !dirty}
              style={{ background: MPL.teal, color: '#fff', fontWeight: 700, fontSize: 14.5, padding: '11px 24px', borderRadius: 12, opacity: saveMutation.isPending || !dirty ? 0.55 : 1, cursor: saveMutation.isPending || !dirty ? 'default' : 'pointer' }}
            >
              {saveMutation.isPending ? 'Guardando…' : 'Guardar cuestionario'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
