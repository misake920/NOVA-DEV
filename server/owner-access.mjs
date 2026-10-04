import { DomainError } from './workspace.mjs';

// Vercel Authentication is the visitor authentication boundary: it must
// protect All Deployments, including /api. The deployment operator sets this
// server flag only after checking protection and the project's access list.
// This flag asserts hosting configuration; it is not a visitor identity.
export function createOwnerAccess({ env = process.env } = {}) {
  return async function requirePrivateDeployment(req) {
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req?.socket?.remoteAddress);
    if (!env.VERCEL && loopback) return;
    if (env.VERCEL && env.GHOST_DEPLOYMENT_PROTECTION === 'vercel') return;
    throw new DomainError(503, 'PRIVATE_ACCESS_NOT_CONFIGURED', 'A proteção de acesso da hospedagem ainda precisa ser configurada para abrir seu painel pessoal.');
  };
}
