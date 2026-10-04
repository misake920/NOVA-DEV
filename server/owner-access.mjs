import { DomainError } from './workspace.mjs';

// Vercel performs the visitor authentication. Verify its protection setting
// before exposing the one personal workspace through the application API.
export function createOwnerAccess({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  let checking;
  return async function requirePrivateDeployment(req) {
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req?.socket?.remoteAddress);
    if (!env.VERCEL && loopback) return;
    if (!env.VERCEL || !env.VERCEL_TOKEN || !env.VERCEL_PROJECT_ID) {
      throw new DomainError(503, 'PRIVATE_ACCESS_NOT_CONFIGURED', 'Conecte seu projeto Vercel e ative a proteção de acesso para abrir seu painel pessoal.');
    }
    if (!checking) checking = (async () => {
      const endpoint = new URL('https://api.vercel.com/v9/projects/' + encodeURIComponent(env.VERCEL_PROJECT_ID));
      if (env.VERCEL_ORG_ID?.startsWith('team_')) endpoint.searchParams.set('teamId', env.VERCEL_ORG_ID);
      let response;
      try {
        response = await fetchImpl(endpoint, { headers: { Authorization: 'Bearer ' + env.VERCEL_TOKEN }, signal: AbortSignal.timeout(8000) });
      } catch {
        throw new DomainError(503, 'PRIVATE_ACCESS_UNAVAILABLE', 'Não foi possível verificar a proteção de acesso. Tente novamente.');
      }
      if (!response.ok) throw new DomainError(503, 'PRIVATE_ACCESS_UNAVAILABLE', 'Confira a conexão privada com seu projeto Vercel.');
      let project;
      try { project = await response.json(); } catch { throw new DomainError(503, 'PRIVATE_ACCESS_UNAVAILABLE', 'Não foi possível verificar a proteção de acesso.'); }
      if (project.ssoProtection?.deploymentType !== 'all') {
        throw new DomainError(503, 'PRIVATE_ACCESS_REQUIRED', 'Ative Vercel Authentication para All Deployments nas configurações de proteção do projeto.');
      }
      if (project.protectionBypass && Object.keys(project.protectionBypass).length) {
        throw new DomainError(503, 'PRIVATE_ACCESS_BYPASS', 'Remova os bypasses e links de compartilhamento da proteção do seu projeto pessoal.');
      }
    })().finally(() => { checking = undefined; });
    await checking;
  };
}
