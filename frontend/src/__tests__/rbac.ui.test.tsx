import { navItemsForRole, generalItemsForRole, resolvePath } from '../layout/navItems';

// Qué ve cada rol en el menú. Antes esto se probaba contra `Sidebar`, un
// componente que ya no usaba nadie (la navegación viva es `layout/AppShell`),
// así que el único test de RBAC de la UI cubría código muerto — y encima estaba
// en rojo. Ahora prueba la regla real, la que comparten el menú lateral de
// escritorio y el drawer móvil.

const labels = (role?: string) => navItemsForRole(role).map(i => i.label);

describe('Menú por rol', () => {
  it('el adoptante ve lo suyo y nada de administración', () => {
    const menu = labels('tenant');
    expect(menu).toContain('Mis adopciones');
    expect(menu).toContain('Mi Mascota');
    expect(menu).not.toContain('Usuarios');
    expect(menu).not.toContain('Caja');
  });

  it('la protectora ve su gestión, no la de admin ni la de partner', () => {
    const menu = labels('landlord');
    expect(menu).toContain('Mis animales');
    expect(menu).toContain('Solicitudes de adopción');
    expect(menu).not.toContain('Usuarios');
    expect(menu).not.toContain('Caja');
  });

  it('el admin es el único con Usuarios y Ajustes', () => {
    expect(labels('admin')).toEqual(expect.arrayContaining(['Usuarios', 'Ajustes', 'Verificaciones']));
    for (const role of ['tenant', 'landlord', 'store', 'vet', 'pro', undefined]) {
      expect(labels(role)).not.toContain('Usuarios');
    }
  });

  it('tienda y veterinario tienen caja; solo el vet tiene agenda', () => {
    expect(labels('store')).toContain('Caja');
    expect(labels('vet')).toContain('Caja');
    expect(labels('vet')).toContain('Agenda de citas');
    expect(labels('store')).not.toContain('Agenda de citas');
  });

  it('sin sesión se cae al menú general, que es todo público', () => {
    const menu = labels(undefined);
    expect(menu).toEqual(generalItemsForRole(undefined).map(i => i.label));
    expect(menu).not.toContain('Usuarios');
    expect(menu).not.toContain('Caja');
    expect(menu).not.toContain('Mis adopciones');
  });

  it('un rol con sección propia no arrastra además la general', () => {
    // La regla que hace que el menú no salga duplicado.
    const general = generalItemsForRole('admin').map(i => i.label);
    const menu = labels('admin');
    expect(general.some(l => menu.includes(l) && l !== 'Cupones')).toBe(false);
  });

  it('todas las entradas apuntan a algún sitio', () => {
    for (const role of ['tenant', 'landlord', 'admin', 'store', 'vet', 'pro', undefined]) {
      for (const item of navItemsForRole(role)) {
        expect(resolvePath(item)).not.toBe('#');
      }
    }
  });
});
