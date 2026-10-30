import { api as axios } from '../api/client';

export type ConversationKind = 'adoption' | 'vet_appointment';

export type AdoptionVisit = {
  at: string;
  place?: string;
  note?: string;
  status: 'propuesta' | 'aceptada';
};

export type ConversationContext =
  | { type: 'adoption'; adoptionId: string; status?: string; visit: AdoptionVisit | null; role: 'shelter' | 'adopter'; cession?: boolean }
  | { type: 'vet_appointment'; appointmentId: string; status?: string; at?: string; service?: string; reason?: string; role: 'vet' | 'owner' };

/** Conversación tal y como la pinta la bandeja: con quién, sobre qué y el último mensaje. */
export type ConversationSummary = {
  _id: string;
  kind: ConversationKind;
  refId: string;
  lastMessageAt?: string;
  unreadForMe: number;
  other: { id: string; name: string; role?: string; avatarUrl?: string };
  animal: { id: string; name: string; photo?: string; species?: string } | null;
  context: ConversationContext;
  lastMessage: {
    type: 'user' | 'system';
    body?: string;
    systemCode?: string;
    mine: boolean;
    hasAttachment: boolean;
    createdAt: string;
  } | null;
};

export type Message = {
  _id: string;
  conversationId: string;
  senderId: string;
  type: 'user' | 'system';
  body?: string;
  attachmentUrl?: string;
  systemCode?: string;
  payload?: any;
  readBy?: string[];
  createdAt: string;
};

export async function listConversations(params: { page?: number; limit?: number } = {}) {
  const { data } = await axios.get<ConversationSummary[]>(`/api/chat/conversations`, { params });
  return data;
}

export async function getConversation(conversationId: string) {
  const { data } = await axios.get<ConversationSummary>(`/api/chat/conversations/${conversationId}`);
  return data;
}

export async function ensureConversation(kind: ConversationKind, refId: string) {
  const { data } = await axios.post<ConversationSummary>(`/api/chat/conversations/ensure`, { kind, refId });
  return data;
}

export async function getUnreadCount() {
  const { data } = await axios.get<{ total: number; conversations: number }>(`/api/chat/unread-count`);
  return data;
}

export async function sendMessage(conversationId: string, body: string, attachmentUrl?: string) {
  const { data } = await axios.post<Message>(`/api/chat/${conversationId}/messages`, { body, attachmentUrl });
  return data;
}

export async function getMessages(conversationId: string, opts: { before?: string; after?: string; limit?: number } = {}) {
  const { data } = await axios.get<Message[]>(`/api/chat/${conversationId}/messages`, { params: opts });
  return data;
}

export async function getSeenUntil(conversationId: string) {
  const { data } = await axios.get<{ seenUntil: string | null }>(`/api/chat/${conversationId}/seen`);
  return data.seenUntil;
}

export async function markRead(conversationId: string) {
  await axios.post(`/api/chat/${conversationId}/read`);
}

export async function getChatPrefs() {
  const { data } = await axios.get<{ emailUnread: boolean }>(`/api/chat/prefs`);
  return data;
}

export async function setChatPrefs(emailUnread: boolean) {
  const { data } = await axios.put<{ emailUnread: boolean }>(`/api/chat/prefs`, { emailUnread });
  return data;
}
