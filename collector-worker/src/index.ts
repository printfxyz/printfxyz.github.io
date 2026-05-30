export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
}

const MAX_BODY_BYTES = 64 * 1024;
const MAX_PAYLOAD_BYTES = 60 * 1024;
const TOOL_NAME_PATTERN = /^[a-z0-9-]{1,80}$/;

type SubmissionBody = {
  consent?: boolean;
  data?: unknown;
  tool?: unknown;
};

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
}

function allowedOrigins(env: Env): Set<string> {
  return new Set(
    (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");

  if (origin && allowedOrigins(env).has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
    headers.set("Vary", "Origin");
  }

  return headers;
}

function isAllowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return Boolean(origin && allowedOrigins(env).has(origin));
}

async function parseBody(request: Request): Promise<SubmissionBody> {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw new Error("Payload is too large.");
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new Error("Payload is too large.");
  }

  return JSON.parse(text) as SubmissionBody;
}

function validateSubmission(body: SubmissionBody): {
  payload: string;
  tool: string;
} {
  if (body.consent !== true) {
    throw new Error("Consent is required.");
  }

  if (typeof body.tool !== "string" || !TOOL_NAME_PATTERN.test(body.tool)) {
    throw new Error("Invalid tool name.");
  }

  if (body.data === undefined || body.data === null) {
    throw new Error("Missing submission data.");
  }

  const payload = JSON.stringify(body.data);
  if (payload.length > MAX_PAYLOAD_BYTES) {
    throw new Error("Submission data is too large.");
  }

  return {
    payload,
    tool: body.tool
  };
}

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  const headers = corsHeaders(request, env);

  if (!isAllowedOrigin(request, env)) {
    return json({ ok: false, error: "Forbidden origin." }, { status: 403, headers });
  }

  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return json(
      { ok: false, error: "Content-Type must be application/json." },
      { status: 415, headers }
    );
  }

  let submission: ReturnType<typeof validateSubmission>;
  try {
    submission = validateSubmission(await parseBody(request));
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid payload." },
      { status: 400, headers }
    );
  }

  await env.DB.prepare(
    `INSERT INTO submissions (tool, payload, consent, origin, user_agent)
     VALUES (?, ?, 1, ?, ?)`
  )
    .bind(
      submission.tool,
      submission.payload,
      request.headers.get("Origin") || "",
      request.headers.get("User-Agent") || ""
    )
    .run();

  return json({ ok: true }, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(request, env)) {
        return new Response(null, { status: 403 });
      }

      return new Response(null, {
        headers: corsHeaders(request, env),
        status: 204
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/submit") {
      return handleSubmit(request, env);
    }

    return json({ ok: false, error: "Not found." }, { status: 404 });
  }
};
