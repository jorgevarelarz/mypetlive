import { Router } from 'express';
import { PushSubscription } from '../models/pushSubscription.model';
import { NativePushToken } from '../models/nativePushToken.model';
import { getUserId } from '../utils/getUserId';
import { pushConfigured, sendPushToUser } from '../utils/push';

const r = Router();

// Clave pública VAPID que necesita el navegador para suscribirse.
r.get('/push/vapid-key', (_req, res) => {
  if (!pushConfigured) return res.status(503).json({ error: 'push_not_configured' });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Registra (o renueva) la suscripción del dispositivo actual.
r.post('/push/subscribe', async (req, res) => {
  try {
    const userId = getUserId(req);
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return res.status(400).json({ error: 'invalid_subscription' });
    }
    await PushSubscription.findOneAndUpdate(
      { endpoint: sub.endpoint },
      { userId, endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, userAgent: req.header('user-agent') },
      { upsert: true, new: true },
    );
    res.status(201).json({ ok: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Da de baja el dispositivo actual (p. ej. al desactivar desde el perfil).
r.delete('/push/subscribe', async (req, res) => {
  try {
    getUserId(req);
    const endpoint = req.body?.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'missing_endpoint' });
    await PushSubscription.deleteOne({ endpoint });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Token de la app nativa (iPhone). El mismo móvil con otra cuenta se reasigna.
r.post('/push/native', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { token, platform } = req.body || {};
    if (typeof token !== 'string' || !/^[0-9a-f]{32,200}$/i.test(token) || platform !== 'ios') {
      return res.status(400).json({ error: 'invalid_token' });
    }
    await NativePushToken.findOneAndUpdate({ token }, { userId, token, platform }, { upsert: true, new: true });
    res.status(201).json({ ok: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Al cerrar sesión en la app: ese móvil deja de recibir los avisos de la cuenta.
r.delete('/push/native', async (req, res) => {
  try {
    const userId = getUserId(req);
    const token = req.body?.token;
    if (typeof token !== 'string') return res.status(400).json({ error: 'missing_token' });
    await NativePushToken.deleteOne({ token, userId });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Notificación de prueba al propio usuario, para verificar el circuito completo.
r.post('/push/test', async (req, res) => {
  try {
    const userId = getUserId(req);
    await sendPushToUser(userId, {
      title: 'MyPetLive 🐾',
      body: 'Las notificaciones funcionan. ¡Todo listo!',
      url: '/profile',
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default r;
