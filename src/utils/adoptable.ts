// Quién puede tener animales en el catálogo de adopción: protectoras y, desde
// el 30 oct 2026, particulares que el admin autoriza (cesión gratuita de un
// animal suyo, Ley 7/2023 art. 58.2). Un sitio para la regla en vez de
// `createdByRole: 'protectora'` repetido por los controladores.
export const ADOPTABLE_ROLES = ['protectora', 'particular'] as const;

export const isAdoptableRole = (role?: string) => (ADOPTABLE_ROLES as readonly string[]).includes(String(role));
