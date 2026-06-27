import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus, Trash2, Info } from 'lucide-react';
import { getMyQuestionnaire, saveQuestionnaire } from '../../api/questionnaire';
import { toast } from 'react-hot-toast';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

export default function QuestionnairePage() {
  const { data, isLoading } = useQuery({ queryKey: ['my-questionnaire'], queryFn: getMyQuestionnaire });
  const [questions, setQuestions] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (data?.questions) setQuestions(data.questions);
  }, [data?.questions]);

  const saveMutation = useMutation({
    mutationFn: () => saveQuestionnaire(questions.filter(q => q.trim())),
    onSuccess: response => {
      setQuestions(response.questions);
      toast.success('Cuestionario guardado');
    },
    onError: () => toast.error('No se pudo guardar'),
  });

  const addQuestion = () => {
    const value = draft.trim();
    if (!value) return;
    setQuestions(prev => [...prev, value]);
    setDraft('');
  };
  const updateQuestion = (idx: number, value: string) =>
    setQuestions(prev => prev.map((q, i) => (i === idx ? value : q)));
  const removeQuestion = (idx: number) =>
    setQuestions(prev => prev.filter((_, i) => i !== idx));

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
          Verás sus respuestas en <strong>Solicitudes de adopción</strong>.
        </span>
      </div>

      {isLoading ? (
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
              {questions.map((question, idx) => (
                <div key={idx} className="flex items-start gap-2.5">
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
                    style={{ border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '10px 12px', fontSize: 14, color: MPL.ink, resize: 'vertical' }}
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
              ))}
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
          <div className="flex items-center justify-between" style={{ borderTop: `1px solid ${MPL.border}`, paddingTop: 16 }}>
            <span style={{ color: MPL.muted, fontSize: 13 }}>
              {questions.filter(q => q.trim()).length} pregunta(s)
            </span>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              style={{ background: MPL.teal, color: '#fff', fontWeight: 700, fontSize: 14.5, padding: '11px 24px', borderRadius: 12, opacity: saveMutation.isPending ? 0.6 : 1 }}
            >
              {saveMutation.isPending ? 'Guardando…' : 'Guardar cuestionario'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
