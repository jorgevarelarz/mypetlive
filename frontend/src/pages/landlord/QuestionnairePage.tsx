import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getMyQuestionnaire, saveQuestionnaire } from '../../api/questionnaire';
import { toast } from 'react-hot-toast';

export default function QuestionnairePage() {
  const { data, isLoading } = useQuery({ queryKey: ['my-questionnaire'], queryFn: getMyQuestionnaire });
  const [questions, setQuestions] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (data?.questions) {
      setQuestions(data.questions);
    }
  }, [data?.questions]);

  const saveMutation = useMutation({
    mutationFn: () => saveQuestionnaire(questions.filter(q => q.trim())),
    onSuccess: (response) => {
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

  const updateQuestion = (idx: number, value: string) => {
    setQuestions(prev => prev.map((q, i) => (i === idx ? value : q)));
  };

  const removeQuestion = (idx: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="p-4 grid gap-4">
      <div>
        <h1 className="text-xl font-semibold">Cuestionario de adopción</h1>
        <p className="text-sm text-gray-600">Define las preguntas que quieres que respondan los adoptantes antes de enviar su solicitud.</p>
      </div>
      {isLoading ? (
        <div>Cargando…</div>
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-2">
            {questions.length === 0 && (
              <div className="text-sm text-gray-500">Aún no tienes preguntas configuradas.</div>
            )}
            {questions.map((question, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <textarea
                  className="flex-1 border rounded px-3 py-2 text-sm"
                  value={question}
                  onChange={e => updateQuestion(idx, e.target.value)}
                />
                <button type="button" className="text-sm text-red-600" onClick={() => removeQuestion(idx)}>
                  Eliminar
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              className="flex-1 border rounded px-3 py-2 text-sm"
              placeholder="Nueva pregunta"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addQuestion();
                }
              }}
            />
            <button type="button" className="px-3 py-1.5 text-sm border rounded" onClick={addQuestion}>
              Añadir
            </button>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              className="px-4 py-2 rounded border"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Guardando…' : 'Guardar cuestionario'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
