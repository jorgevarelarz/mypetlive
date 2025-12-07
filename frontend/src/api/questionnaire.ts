import { api as client } from './client';

export type QuestionnaireResponse = { questions: string[] };

export async function getMyQuestionnaire() {
  const { data } = await client.get('/api/questionnaire');
  return data as QuestionnaireResponse;
}

export async function saveQuestionnaire(questions: string[]) {
  const { data } = await client.post('/api/questionnaire', { questions });
  return data as QuestionnaireResponse;
}

export async function getQuestionnaireByProtectora(protectoraId: string) {
  const { data } = await client.get(`/api/questionnaire/${protectoraId}`);
  return data as QuestionnaireResponse;
}
