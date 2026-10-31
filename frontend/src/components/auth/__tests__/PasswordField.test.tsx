import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PasswordField from '../PasswordField';

describe('El campo de contraseña con el ojo', () => {
  it('nace oculto y el ojo la enseña y la vuelve a esconder', () => {
    render(<PasswordField aria-label="Contraseña" defaultValue="unaclavelarga" />);
    const campo = screen.getByLabelText('Contraseña') as HTMLInputElement;
    expect(campo.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar la contraseña' }));
    expect(campo.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar la contraseña' }));
    expect(campo.type).toBe('password');
  });

  // El fallo clásico: dentro de un <form>, un <button> sin `type` es `submit`,
  // así que mirar la contraseña enviaba el formulario a medio escribir.
  it('el ojo no envía el formulario', () => {
    const onSubmit = jest.fn(e => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordField aria-label="Contraseña" />
        <button type="submit">Entrar</button>
      </form>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar la contraseña' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('deja pasar lo que le den: autocompletado, longitud mínima y obligatoriedad', () => {
    render(
      <PasswordField aria-label="Contraseña" autoComplete="new-password" minLength={12} required />,
    );
    const campo = screen.getByLabelText('Contraseña') as HTMLInputElement;
    expect(campo.autocomplete).toBe('new-password');
    expect(campo.minLength).toBe(12);
    expect(campo.required).toBe(true);
  });
});
