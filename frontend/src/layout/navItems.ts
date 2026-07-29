import navConfig from '../config/nav.config.json';

export type NavItem = { label: string; path?: string; to?: string };

export type NavRole = 'tenant' | 'landlord' | 'pro' | 'admin' | 'store' | 'vet';

export const resolvePath = (item: NavItem) => item.path || item.to || '#';

/** Menú general: el adoptante tiene el suyo, el resto comparten uno. */
export function generalItemsForRole(role?: string): NavItem[] {
  const config: any = navConfig;
  if (role === 'tenant' && Array.isArray(config.tenantGeneral)) return config.tenantGeneral as NavItem[];
  return (config.general || []) as NavItem[];
}

/**
 * Menú unificado: si el rol tiene su propia sección (protectora, admin, partner),
 * ESA es su navegación, sin la sección "General" duplicada. Los roles sin sección
 * propia (adoptante, anónimo) usan la lista general como menú único.
 *
 * Lo usan el menú lateral de escritorio y el drawer móvil, que tienen que decir
 * lo mismo: es la regla de qué ve cada rol, y estaba escrita dos veces.
 */
export function navItemsForRole(role?: string): NavItem[] {
  const roleItems = (role && (navConfig as any)[role] ? (navConfig as any)[role] : []) as NavItem[];
  return roleItems.length > 0 ? roleItems : generalItemsForRole(role);
}
