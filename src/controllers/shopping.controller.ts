import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { findWhereToBuy } from '../utils/shopping';
import { ShopClick } from '../models/shopClick.model';
import { Product } from '../models/product.model';
import logger from '../utils/logger';

/** Dónde comprar un producto concreto. La UI la usa cuando algo se está acabando. */
export async function whereToBuy(req: Request, res: Response) {
  const product = String(req.query.product || '').trim();
  if (!product) return res.status(400).json({ error: 'product_required' });
  const options = await findWhereToBuy(product);
  res.json({ product, options });
}

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'https://mypetlive.es';

/**
 * Registra el clic y redirige. Es el único dato que decide si el marketplace
 * merece existir, así que se mide desde el primer día y desde los dos sitios
 * (correo y ficha).
 *
 * Nunca falla hacia el usuario: si el registro peta, se redirige igual. Perder
 * una métrica es barato; dejar a alguien mirando un error, no.
 */
export async function trackShopClick(req: Request, res: Response) {
  const { partnerId } = req.params;
  const product = String(req.query.product || '').slice(0, 120);
  const source = String(req.query.src || 'unknown').slice(0, 40);
  const animalId = String(req.query.animal || '');
  const user: any = (req as any).user;

  try {
    if (Types.ObjectId.isValid(partnerId)) {
      await ShopClick.create({
        partnerId,
        product,
        source,
        ...(user?._id || user?.id ? { userId: user._id || user.id } : {}),
        ...(Types.ObjectId.isValid(animalId) ? { animalId } : {}),
      });
    }
  } catch (err) {
    logger.error({ err, partnerId }, '[shop] no se pudo registrar el clic');
  }

  const target = new URL('/comprar', FRONTEND_URL());
  if (product) target.searchParams.set('producto', product);
  if (Types.ObjectId.isValid(partnerId)) target.searchParams.set('tienda', partnerId);
  res.redirect(302, target.toString());
}

/**
 * Igual que el anterior, pero para un producto comprable del marketplace: lleva
 * a su ficha en vez de a la lista.
 *
 * El destino se **construye aquí** a partir del id, en vez de aceptar una URL
 * por query. Un redirector que obedece al parámetro que le manden es un redirect
 * abierto, y este enlace viaja en correos: sería regalar un salto con nuestro
 * dominio delante a quien quisiera usarlo para pescar.
 */
export async function trackProductClick(req: Request, res: Response) {
  const { productId } = req.params;
  const product = String(req.query.product || '').slice(0, 120);
  const source = String(req.query.src || 'unknown').slice(0, 40);
  const animalId = String(req.query.animal || '');
  const user: any = (req as any).user;

  if (!Types.ObjectId.isValid(productId)) {
    // Sin ficha a la que ir, la lista sigue siendo una respuesta útil.
    const fallback = new URL('/comprar', FRONTEND_URL());
    if (product) fallback.searchParams.set('producto', product);
    return res.redirect(302, fallback.toString());
  }

  try {
    const doc = await Product.findById(productId).select('sellerId name').lean();
    await ShopClick.create({
      productId,
      product: product || (doc as any)?.name || '',
      source,
      ...((doc as any)?.sellerId ? { partnerId: (doc as any).sellerId } : {}),
      ...(user?._id || user?.id ? { userId: user._id || user.id } : {}),
      ...(Types.ObjectId.isValid(animalId) ? { animalId } : {}),
    });
  } catch (err) {
    logger.error({ err, productId }, '[shop] no se pudo registrar el clic de producto');
  }

  res.redirect(302, new URL(`/tienda/${productId}`, FRONTEND_URL()).toString());
}
