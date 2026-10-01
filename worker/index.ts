/**
 * Aksen Labs OTC FX & Remittance Worker
 *
 * Edge routing:
 *   POST /api/chat    OpenRouter LLM conversational agent for OTC quotes & syndicates
 *   POST /api/jev     JEV Forensic Decisions Gate for NIBSS receipt & fraud verification
 *   GET  /api/rates   Real-time corridor rates, spreads, and syndicate yields
 *   GET  /api/health  Edge health & AI model readiness
 *   *                 Static assets via Cloudflare Assets
 */

import { auditTransferReceipt } from './decisions/jev.ts';
import { askChatAi } from './llm/openrouter.ts';
import { Limiter } from './lib/resilience.ts';
import type { ChatRequest, Env, JevForensicRequest } from './types.ts';

const limiter = new Limiter(30, 5000); // 30 burst, refill every 5s
const MAX_BODY_BYTES = 16_384; // 16KB max payload

function jsonResponse(data: unknown, status = 200, requestId = crypto.randomUUID()): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'x-request-id': requestId,
    },
  });
}

function errorResponse(code: string, message: string, status = 400, requestId = crypto.randomUUID()): Response {
  return jsonResponse({ ok: false, error: { code, message }, meta: { requestId, ms: 0, source: 'edge' } }, status, requestId);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
          'access-control-max-age': '86400',
        },
      });
    }

    // Pass non-API routes straight to Cloudflare Assets
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const requestId = crypto.randomUUID();
    const started = Date.now();

    // Rate limiting per IP
    const clientIp = request.headers.get('cf-connecting-ip') ?? 'local';
    if (!limiter.allow(clientIp, started)) {
      return errorResponse('rate_limit', 'Too many requests. Please wait a moment and try again.', 429, requestId);
    }

    try {
      // 1. Health check endpoint
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return jsonResponse(
          {
            ok: true,
            service: 'aksen-fx-desk',
            corridors: ['NGN_GHS', 'GHS_NGN', 'USD_NGN'],
            ai: {
              openrouter: Boolean(env.OPENROUTER_API_KEY?.trim()),
              jevModel: env.JEV_MODEL || 'typesafe/jev-1.13',
            },
            timestamp: new Date().toISOString(),
          },
          200,
          requestId
        );
      }

      // 2. Live Corridor Rates endpoint
      if (url.pathname === '/api/rates' && request.method === 'GET') {
        return jsonResponse(
          {
            ok: true,
            corridors: {
              NGN_GHS: {
                baseRate: 104.55,
                spreadBps: 118,
                minAmount: 50000,
                maxInstantSettle: 1000000,
                payoutMethods: ['MTN MoMo', 'Telecel Cash', 'Ecobank GH'],
              },
              GHS_NGN: {
                baseRate: 103.20,
                spreadBps: 115,
                minAmount: 500,
                maxInstantSettle: 10000,
                payoutMethods: ['GTBank NIP', 'Access Bank', 'Zenith Bank'],
              },
            },
            treasury: {
              ngnFloat: 25000000,
              ghsFloat: 240000,
              activeSyndicates: 2,
              syndicateApy: 0.348,
            },
            meta: {
              requestId,
              ms: Date.now() - started,
            },
          },
          200,
          requestId
        );
      }

      // 3. AI Chat endpoint
      if (url.pathname === '/api/chat' && request.method === 'POST') {
        const bodyText = await request.text();
        if (bodyText.length > MAX_BODY_BYTES) {
          return errorResponse('too_large', 'Payload exceeds maximum allowed size.', 413, requestId);
        }

        let chatReq: ChatRequest;
        try {
          chatReq = JSON.parse(bodyText);
        } catch {
          return errorResponse('bad_json', 'Malformed JSON payload.', 400, requestId);
        }

        if (!chatReq.message || typeof chatReq.message !== 'string') {
          return errorResponse('missing_param', 'The "message" field is required.', 400, requestId);
        }

        const { reply, source, usdMicros } = await askChatAi(
          env.OPENROUTER_API_KEY,
          env.SITE_URL,
          chatReq
        );

        return jsonResponse(
          {
            ok: true,
            reply,
            meta: {
              requestId,
              ms: Date.now() - started,
              source,
              usdMicros,
            },
          },
          200,
          requestId
        );
      }

      // 4. JEV Forensic Decisions endpoint
      if (url.pathname === '/api/jev' && request.method === 'POST') {
        const bodyText = await request.text();
        if (bodyText.length > MAX_BODY_BYTES) {
          return errorResponse('too_large', 'Payload exceeds maximum allowed size.', 413, requestId);
        }

        let jevReq: JevForensicRequest;
        try {
          jevReq = JSON.parse(bodyText);
        } catch {
          return errorResponse('bad_json', 'Malformed JSON payload.', 400, requestId);
        }

        if (!jevReq.receiptRef) {
          return errorResponse('missing_param', 'The "receiptRef" field is required.', 400, requestId);
        }

        const verdict = await auditTransferReceipt(
          env.OPENROUTER_API_KEY,
          env.SITE_URL,
          jevReq
        );

        return jsonResponse(
          {
            ok: true,
            verdict,
            meta: {
              requestId,
              ms: Date.now() - started,
              source: verdict.model.includes('deterministic') ? 'heuristic_engine' : 'jev',
              usdMicros: verdict.usdMicros,
            },
          },
          200,
          requestId
        );
      }

      return errorResponse('not_found', `Endpoint ${url.pathname} not found.`, 404, requestId);
    } catch (err) {
      console.error(JSON.stringify({ at: 'unhandled_worker_error', requestId, error: String(err) }));
      return errorResponse('internal_error', 'Internal server error occurred.', 500, requestId);
    }
  },
} satisfies ExportedHandler<Env>;
