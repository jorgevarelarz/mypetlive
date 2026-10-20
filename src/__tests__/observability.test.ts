import request from 'supertest';
import { app } from '../app';
import { User } from '../models/user.model';

describe('Observabilidad y errores estructurados', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('propaga el X-Request-Id de entrada', async () => {
    const response = await request(app).get('/health').set('x-request-id', 'test-id-123');
    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe('test-id-123');
    expect(response.body).toHaveProperty('mongo');
  });

  it('devuelve AppError estructurado en login', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValueOnce(null as any);

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unknown@example.com', password: 'secret' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'invalid_credentials',
      message: 'Usuario o contraseña incorrectos. Si te registraste con Google o Apple, entra con ese botón.',
    });
    expect(response.headers).toHaveProperty('x-request-id');
  });
});
