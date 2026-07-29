import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DailyCareCard from '../DailyCareCard';
import * as animalsApi from '../../../api/animals';

// La regla que más fácil se rompe al tocar esta tarjeta: qué acción se ofrece
// según la especie. Un perro no tiene arenero y un gato no sale a pasear, y
// hasta ahora al perro simplemente le faltaba el botón: no tenía sustituto.

jest.mock('react-hot-toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

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
    renderCard('gato', { ...care, pantry: { foods: ['Acana Adult', 'Latita Almo', 'Snack'], litters: [] } });

    fireEvent.click(await screen.findByText('Marcar comida'));
    fireEvent.click(screen.getByText('Acana Adult'));
    fireEvent.click(screen.getByText('Latita Almo'));
    fireEvent.click(screen.getByText('Snack')); // sobra: solo caben dos
    fireEvent.click(screen.getByRole('button', { name: 'Marcar' }));

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
