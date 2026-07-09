import { api as axios } from '../api/client';

export type Conversation = {
  _id: string;
  kind: 'ticket' | 'contract' | 'appointment' | 'application';
  refId: string;
  participants: string[];
  participantsInfo?: Array<{ id: string; name?: string; isPro?: boolean; proLimit?: number }>;
  meta?: any;
  unread?: Record<string, number>;
  lastMessageAt?: string;
};

export type Message = {
  _id: string;
  conversationId: string;
  senderId: string;
  type: 'user' | 'system';
  body?: string;
  systemCode?: string;
  payload?: any;
  createdAt?: string;
};

export async function listConversations(params: { page?: number; limit?: number } = {}) {
  const { data } = await axios.get<Conversation[]>(`/api/chat/conversations`, { params });
  return data;
}

export async function ensureConversation(kind: 'ticket'|'contract'|'appointment'|'application'|'adoption', refId: string) {
  const { data } = await axios.post<Conversation>(`/api/chat/conversations/ensure`, { kind, refId });
  return data;
}

export async function sendMessage(conversationId: string, body: string, attachmentUrl?: string) {
  const { data } = await axios.post<Message>(`/api/chat/${conversationId}/messages`, { body, attachmentUrl });
  return data;
}

export async function getMessages(conversationId: string, opts: { before?: string; limit?: number } = {}) {
  const { data } = await axios.get<Message[]>(`/api/chat/${conversationId}/messages`, { params: opts });
  return data;
}

export async function markRead(conversationId: string) {
  await axios.post(`/api/chat/${conversationId}/read`);
}
