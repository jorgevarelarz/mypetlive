import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CartPage from '../CartPage';
import * as marketplaceApi from '../../../api/marketplace';
import { addToCart, clearCart, getCart } from '../../../utils/cart';
import type { Product } from '../../../api/marketplace';

// Lo que se prueba aquí es que **se puede pagar sin cuenta**. Es la decisión de
// producto del checkout: obligar a registrarse para gastar dinero es la forma
// más rápida de perder un pedido ya decidido, así que si esto se rompe hay que
// enterarse por un test y no por las ventas.

const mockNavigate = jest.fn();

jest.mock('react-hot-toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// react-router-dom v7 no resuelve bajo el jest de CRA (pide 'react-router/dom').
jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
  useNavigate: () => mockNavigate,
}), { virtual: true });

let mockUser: any = null;
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const product: Product = {
  id: 'p1',
  name: 'Pienso cachorro 3kg',
  images: [],
  category: 'comida',
  species: [],
  priceEur: 19.99,
  stock: 10,
  listedBy: 'partner',
  seller: { id: 'tienda-1', name: 'Tienda Norte' },
};

beforeEach(() => {
  localStorage.clear();
  clearCart();
  mockUser = null;
  mockNavigate.mockClear();
});

afterEach(() => jest.restoreAllMocks());

describe('Carrito y checkout', () => {
  it('sin nada dentro no ofrece pagar', () => {
    render(<CartPage />);
    expect(screen.getByText('Todavía no has añadido nada.')).toBeInTheDocument();
    expect(screen.queryByText('Ir a pagar')).not.toBeInTheDocument();
  });

  it('muestra el subtotal con sus dos decimales y de qué tienda es el pedido', () => {
    addToCart(product, 2);
    render(<CartPage />);

    expect(screen.getByText('Pedido de Tienda Norte')).toBeInTheDocument();
    // Dos veces: el total de la línea y el subtotal del pedido.
    expect(screen.getAllByText('39,98 €')).toHaveLength(2);
    // El envío no se promete aquí: lo calcula el servidor con la tienda y el importe.
    expect(screen.getByText(/Los gastos de envío se calculan en el paso siguiente/)).toBeInTheDocument();
  });

  it('a un invitado le pide email y nombre, y crea el pedido sin cuenta', async () => {
    const checkout = jest
      .spyOn(marketplaceApi, 'createCheckout')
      .mockResolvedValue({ orderId: 'o1', reference: 'MP-1', guestToken: 'tok' });

    addToCart(product, 1);
    render(<CartPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'invitada@test.com' } });
    fireEvent.change(screen.getByLabelText('Nombre y apellidos'), { target: { value: 'Invitada' } });
    fireEvent.change(screen.getByLabelText('Calle y número'), { target: { value: 'Rúa Real 12' } });
    fireEvent.change(screen.getByLabelText('Código postal'), { target: { value: '15003' } });
    fireEvent.change(screen.getByLabelText('Ciudad'), { target: { value: 'A Coruña' } });

    fireEvent.click(screen.getByText('Ir a pagar'));

    await waitFor(() => expect(checkout).toHaveBeenCalled());
    expect(checkout.mock.calls[0][0]).toMatchObject({
      items: [{ productId: 'p1', qty: 1 }],
      email: 'invitada@test.com',
      name: 'Invitada',
      shippingAddress: { line1: 'Rúa Real 12', postalCode: '15003', city: 'A Coruña' },
    });

    // El pedido ya vive en el servidor: el carrito local ha cumplido, y el
    // invitado se va a su pedido con el token, que es su única credencial.
    await waitFor(() => expect(getCart()).toEqual([]));
    expect(mockNavigate).toHaveBeenCalledWith('/pedido/o1?token=tok');
  });

  it('a quien tiene sesión no le vuelve a pedir sus datos', () => {
    mockUser = { _id: 'u1', name: 'Ana', email: 'ana@test.com', role: 'tenant' };
    addToCart(product, 1);
    render(<CartPage />);

    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Calle y número')).toBeInTheDocument();
  });

  it('un 503 con el pedido creado no pierde los datos: lleva al pedido', async () => {
    jest.spyOn(marketplaceApi, 'createCheckout').mockRejectedValue({
      response: { status: 503, data: { error: 'payments_unavailable', orderId: 'o9', guestToken: 'tok9' } },
    });

    addToCart(product, 1);
    render(<CartPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'invitada@test.com' } });
    fireEvent.change(screen.getByLabelText('Nombre y apellidos'), { target: { value: 'Invitada' } });
    fireEvent.change(screen.getByLabelText('Calle y número'), { target: { value: 'Rúa Real 12' } });
    fireEvent.change(screen.getByLabelText('Código postal'), { target: { value: '15003' } });
    fireEvent.change(screen.getByLabelText('Ciudad'), { target: { value: 'A Coruña' } });
    fireEvent.click(screen.getByText('Ir a pagar'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pedido/o9?token=tok9'));
  });
});
