import { fetchFeaturedAnimal } from '../featuredAnimal';
import { listMyPets, getAnimal } from '../../api/animals';
import { listMyAdoptions } from '../../api/adoptions';

jest.mock('../../api/animals', () => ({
  listMyPets: jest.fn(),
  getAnimal: jest.fn(),
}));

jest.mock('../../api/adoptions', () => ({
  listMyAdoptions: jest.fn(),
}));

const mockListMyPets = listMyPets as jest.Mock;
const mockGetAnimal = getAnimal as jest.Mock;
const mockListMyAdoptions = listMyAdoptions as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  mockListMyAdoptions.mockResolvedValue({ items: [] });
  // GET /api/animals/:id devuelve 404 para mascotas personales (por diseño).
  mockGetAnimal.mockRejectedValue(Object.assign(new Error('not_found'), { response: { status: 404 } }));
});

describe('fetchFeaturedAnimal', () => {
  it('devuelve la mascota personal recién registrada aunque no tenga fotos', async () => {
    mockListMyPets.mockResolvedValue({
      items: [{ type: 'personal', animal: { _id: 'p1', name: 'Rocky', species: 'perro', images: [] } }],
    });

    const result = await fetchFeaturedAnimal(null);

    expect(result?.name).toBe('Rocky');
  });

  it('devuelve la mascota personal con fotos directamente', async () => {
    mockListMyPets.mockResolvedValue({
      items: [{ type: 'personal', animal: { _id: 'p2', name: 'Michi', images: ['/uploads/michi.jpg'] } }],
    });

    const result = await fetchFeaturedAnimal(null);

    expect(result?.name).toBe('Michi');
  });

  it('prefiere el detalle completo cuando getAnimal sí responde', async () => {
    mockListMyPets.mockResolvedValue({
      items: [{ type: 'adopted', animal: { _id: 'a1', name: 'Luna', images: [] } }],
    });
    mockGetAnimal.mockResolvedValue({ _id: 'a1', name: 'Luna', images: [], healthHistory: [{ type: 'vaccine' }] });

    const result = await fetchFeaturedAnimal(null);

    expect(result?.healthHistory).toHaveLength(1);
  });

  it('devuelve null sin mascotas ni adopciones', async () => {
    mockListMyPets.mockResolvedValue({ items: [] });

    const result = await fetchFeaturedAnimal(null);

    expect(result).toBeNull();
  });
});
