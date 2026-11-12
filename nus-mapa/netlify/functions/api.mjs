// Netlify Function: tota l'API del mapa de connexions. Dades a Netlify Blobs.
import { getStore } from '@netlify/blobs';
import { handle } from '../../lib/core.mjs';

export default async (req) => {
  const store = getStore({ name: 'nus-mapa', consistency: 'strong' });
  return handle(req, store, { ADMIN_KEY: Netlify.env.get('ADMIN_KEY'), BASE_URL: Netlify.env.get('BASE_URL') });
};

export const config = { path: ['/api/*', '/qr/*', '/jo/*'] };
