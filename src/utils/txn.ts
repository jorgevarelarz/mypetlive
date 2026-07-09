import mongoose, { ClientSession } from 'mongoose';

// null = aún no sabemos si el despliegue soporta transacciones (se detecta en la
// primera llamada y se cachea para no pagar el intento fallido en cada request).
let txnSupported: boolean | null = null;

function isTxnUnsupported(err: any): boolean {
  // code 20 (IllegalOperation): mongod standalone, p. ej. mongodb-memory-server en tests.
  const msg = String(err?.message || '');
  return err?.code === 20 || /Transaction numbers are only allowed|does not support transactions/i.test(msg);
}

// Ejecuta fn dentro de una transacción si el despliegue lo permite (replica set o
// mongos, como Atlas); en standalone ejecuta sin sesión. fn debe ser reintentable:
// withTransaction puede reejecutarla ante errores transitorios.
export async function withTxnIfAvailable<T>(fn: (session?: ClientSession) => Promise<T>): Promise<T> {
  if (txnSupported === false) return fn(undefined);
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    txnSupported = true;
    return result;
  } catch (err: any) {
    if (isTxnUnsupported(err)) {
      txnSupported = false;
      return fn(undefined);
    }
    throw err;
  } finally {
    session.endSession();
  }
}
