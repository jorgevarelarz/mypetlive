import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DailyCareCard from '../DailyCareCard';
import * as animalsApi from '../../../api/animals';

// La regla que más fácil se rompe al tocar esta tarjeta: qué acción se ofrece
// según la especie. Un perro no tiene arenero y un gato no sale a pasear, y
// hasta ahora al perro simplemente le faltaba el botón: no tenía sustituto.

jest.mock('react-hot-toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// react-router-dom v7 no resuelve bajo el jest de CRA (pide 'react-router/dom'),
// y aquí solo hace falta que <Link> pinte un <a>.
jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}), { virtual: true });

/** Producto de despensa sin cuenta de existencias, que es el caso por defecto. */
const supply = (name: string, extra: any = {}) => ({
  name, usesLeft: null, daysLeft: null, runningLow: false, ...extra,
});

const care = {
  items: [],
  summary: { feedings: 0, litterChanges: 0, walks: 0, walkKm: 0, walkMinutes: 0 },
  pantry: { foods: [], litters: [] },
  last: {},
};

function renderCard(species: string, data: any = care) {
  jest.spyOn(animalsApi, 'getAnimalCare').mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DailyCareCard animalId="abc123" species={species} />
    </QueryClientProvider>,
  );
}

afterEach(() => jest.restoreAllMocks());

describe('Tarjeta de cuidado diario', () => {
  it('a un perro le ofrece paseo y no arena', async () => {
    renderCard('perro');
    await waitFor(() => expect(screen.getByText('Marcar paseo')).toBeInTheDocument());
    expect(screen.queryByText('Cambiar arena')).not.toBeInTheDocument();
  });

  it('a un gato le ofrece arena y no paseo', async () => {
    renderCard('gato');
    await waitFor(() => expect(screen.getByText('Cambiar arena')).toBeInTheDocument());
    expect(screen.queryByText('Marcar paseo')).not.toBeInTheDocument();
  });

  it('otras especies solo tienen comida', async () => {
    renderCard('conejo');
    await waitFor(() => expect(screen.getByText('Marcar comida')).toBeInTheDocument());
    expect(screen.queryByText('Marcar paseo')).not.toBeInTheDocument();
    expect(screen.queryByText('Cambiar arena')).not.toBeInTheDocument();
  });

  it('el paseo no se puede guardar sin elegir tipo, y guarda lo que se rellena', async () => {
    const markWalk = jest.spyOn(animalsApi, 'markAnimalWalk').mockResolvedValue({ ok: true } as any);
    renderCard('perro');

    fireEvent.click(await screen.findByText('Marcar paseo'));
    // El botón de la tarjeta y el de la hoja se llaman igual: hay que mirar dentro.
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByRole('button', { name: 'Marcar paseo' })).toBeDisabled();

    fireEvent.click(sheet.getByText('Senderismo'));
    fireEvent.change(sheet.getByPlaceholderText('45'), { target: { value: '95' } });
    fireEvent.change(sheet.getByPlaceholderText('3,2'), { target: { value: '8,2' } });
    fireEvent.click(sheet.getByRole('button', { name: 'Marcar paseo' }));

    await waitFor(() =>
      expect(markWalk).toHaveBeenCalledWith('abc123', {
        kind: 'senderismo',
        minutes: 95,
        // La coma decimal es como se escribe aquí; tiene que llegar como número.
        distanceKm: 8.2,
        place: undefined,
      }),
    );
  });

  it('la despensa se ofrece como chips y no deja marcar más de dos', async () => {
    const markFeeding = jest.spyOn(animalsApi, 'markAnimalFeeding').mockResolvedValue({ ok: true } as any);
    renderCard('gato', { ...care, pantry: { foods: [supply('Acana Adult'), supply('Latita Almo'), supply('Snack')], litters: [] } });

    fireEvent.click(await screen.findByText('Marcar comida'));
    // El nombre también sale en la lista de despensa: hay que mirar dentro de la hoja.
    const sheet = within(screen.getByRole('dialog'));
    fireEvent.click(sheet.getByText('Acana Adult'));
    fireEvent.click(sheet.getByText('Latita Almo'));
    fireEvent.click(sheet.getByText('Snack')); // sobra: solo caben dos
    fireEvent.click(sheet.getByRole('button', { name: 'Marcar' }));

    await waitFor(() => expect(markFeeding).toHaveBeenCalledWith('abc123', ['Acana Adult', 'Latita Almo']));
  });

  it('resume la semana cuando hay registros', async () => {
    renderCard('perro', {
      ...care,
      summary: { feedings: 12, litterChanges: 0, walks: 5, walkKm: 11.4, walkMinutes: 300 },
      items: [
        {
          _id: '1',
          type: 'walk',
          actorName: 'Jorge',
          walk: { kind: 'senderismo', minutes: 95, distanceKm: 8.2, place: 'Monte Xalo' },
          createdAt: new Date().toISOString(),
        },
      ],
    });

    expect(await screen.findByText('5 paseos · 11.4 km')).toBeInTheDocument();
    expect(screen.getByText('12 comidas')).toBeInTheDocument();
    expect(screen.getByText('Senderismo · 8.2 km · 95 min · Monte Xalo')).toBeInTheDocument();
    expect(screen.getByText('marcado por Jorge')).toBeInTheDocument();
  });
});

describe('Existencias de la despensa', () => {
  it('dice para cuántas comidas queda y avisa cuando se acaba', async () => {
    renderCard('gato', {
      ...care,
      pantry: {
        foods: [
          supply('Acana Adult', { unit: 'kg', packSize: 6000, perUse: 80, remaining: 960, usesLeft: 12, daysLeft: 6 }),
          supply('Latita', { unit: 'ud', packSize: 12, perUse: 1, remaining: 2, usesLeft: 2, daysLeft: 1, runningLow: true }),
        ],
        litters: [],
      },
    });

    expect(await screen.findByText(/Para 12 comidas · 6 días/)).toBeInTheDocument();
    expect(screen.getByText(/queda 960 g/)).toBeInTheDocument();
    expect(screen.getByText(/Se está acabando: 2 comidas · 1 día/)).toBeInTheDocument();
  });

  it('reponer devuelve el paquete entero sin preguntar cuánto había', async () => {
    const upsert = jest.spyOn(animalsApi, 'upsertAnimalSupply').mockResolvedValue({ ok: true } as any);
    renderCard('gato', {
      ...care,
      pantry: { foods: [supply('Pienso', { unit: 'kg', packSize: 6000, perUse: 80, remaining: 160, usesLeft: 2 })], litters: [] },
    });

    fireEvent.click(await screen.findByText('Reponer'));
    await waitFor(() => expect(upsert).toHaveBeenCalledWith('abc123', { kind: 'food', name: 'Pienso', refill: true }));
  });

  it('sin paquete configurado no ofrece reponer, solo editar', async () => {
    renderCard('gato', { ...care, pantry: { foods: [supply('Lo que haya')], litters: [] } });

    expect(await screen.findByText('Editar')).toBeInTheDocument();
    expect(screen.queryByText('Reponer')).not.toBeInTheDocument();
    expect(screen.getByText('Sin cuenta de existencias')).toBeInTheDocument();
  });

  it('guarda paquete y ración en las unidades que se escriben', async () => {
    const upsert = jest.spyOn(animalsApi, 'upsertAnimalSupply').mockResolvedValue({ ok: true } as any);
    renderCard('gato');

    fireEvent.click(await screen.findByText('+ Añadir producto'));
    const form = within(screen.getByRole('dialog'));
    fireEvent.change(form.getByPlaceholderText('Acana Adult'), { target: { value: 'Acana Adult' } });
    fireEvent.change(form.getByPlaceholderText('6'), { target: { value: '6' } });
    fireEvent.change(form.getByPlaceholderText('80'), { target: { value: '80' } });
    fireEvent.click(form.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(upsert).toHaveBeenCalledWith('abc123', {
        kind: 'food',
        name: 'Acana Adult',
        packSize: 6,
        packUnit: 'kg',
        perUse: 80,
        perUseUnit: 'g',
      }),
    );
  });
});

describe('Dónde comprarlo', () => {
  it('ofrece dónde comprar solo cuando el producto se está acabando', async () => {
    renderCard('gato', {
      ...care,
      pantry: {
        foods: [
          supply('Se acaba', { packSize: 6000, perUse: 80, remaining: 160, usesLeft: 2, runningLow: true }),
          supply('Va sobrado', { packSize: 6000, perUse: 80, remaining: 5000, usesLeft: 62 }),
        ],
        litters: [],
      },
    });

    const links = await screen.findAllByText('Dónde comprarlo');
    expect(links).toHaveLength(1);
    expect(links[0].closest('a')).toHaveAttribute('href', '/comprar?producto=Se%20acaba');
  });
});
