import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { isAppError } from '../utils/errors';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const appError = isAppError(err) ? err : undefined;
  const status = appError?.status || 500;
  const log = res.locals.logger ?? logger;
  const requestId = res.locals.requestId;
  const code = appError?.code || status;
  log.error({ err, status, code, requestId }, 'Unhandled error caught by middleware');
  // Solo un `AppError` deliberado (badRequest/notFound/...) trae un mensaje
  // pensado para el cliente. Cualquier otra excepción (un CastError de
  // Mongoose por un ID mal formado, un TypeError de una validación que
  // faltaba...) es un fallo interno, y su `.message` describe la interna:
  // nombre del modelo, campo, o el propio código fuente del error. Eso no
  // sale de aquí; lo que se registra arriba en el log sí lo lleva entero.
  res.status(status).json({
    code,
    message: appError ? appError.message : 'Internal Server Error',
    details: appError?.details,
    requestId,
  });
}
