import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { MessageCircle } from 'lucide-react';
import { ensureConversation, type ConversationKind } from '../../api/chat';
import { MPL } from '../../styles/mypetlive';

/** Abre (o crea) la conversación de una solicitud o una cita y lleva a ella. */
export default function OpenChatButton({
  kind, refId, label = 'Escribir', primary = false, style,
}: {
  kind: ConversationKind;
  refId: string;
  label?: string;
  primary?: boolean;
  style?: React.CSSProperties;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const conv = await ensureConversation(kind, refId);
      navigate(`/mensajes/${conv._id}`);
    } catch {
      toast.error('No se pudo abrir la conversación');
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={open} disabled={busy}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'start',
        border: primary ? 0 : `1.5px solid ${MPL.border}`, background: primary ? MPL.teal : '#fff',
        color: primary ? '#fff' : MPL.ink, borderRadius: 12, padding: '9px 15px', font: 'inherit',
        fontWeight: 800, fontSize: 14, cursor: 'pointer', opacity: busy ? .7 : 1, ...style,
      }}>
      <MessageCircle size={17} /> {busy ? 'Abriendo…' : label}
    </button>
  );
}
