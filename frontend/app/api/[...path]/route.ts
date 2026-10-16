import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function proxy(request: NextRequest, context: Context) {
  const { path } = await context.params;
  const valid =
    (path[0] === "scans" && (
      path.length === 1 ||
      ((path.length === 2 || (path.length === 3 && (path[2] === "export" || path[2] === "share"))) && /^[a-zA-Z0-9-]{1,64}$/.test(path[1]))
    )) ||
    (path[0] === "reports" && (
      (path.length === 2 && /^[a-zA-Z0-9-]{1,64}$/.test(path[1])) ||
      (path.length === 3 && /^[a-zA-Z0-9-]{1,64}$/.test(path[1]) && path[2] === "badge.svg")
    )) ||
    (path[0] === "analyze-raw-html" && path.length === 1);

  if (!valid) return Response.json({ detail: "Not found" }, { status: 404 });

  const method = request.method;
  const isPostAllowed =
    (path[0] === "scans" && path.length === 1) ||
    (path[0] === "scans" && path.length === 3 && path[2] === "share") ||
    (path[0] === "analyze-raw-html" && path.length === 1);
  const isDeleteAllowed = path[0] === "scans" && path.length === 2;
  const isGetAllowed =
    (path[0] === "scans" && (path.length === 1 || path.length === 2 || (path.length === 3 && path[2] === "export"))) ||
    (path[0] === "reports" && (path.length === 2 || (path.length === 3 && path[2] === "badge.svg")));

  if (
    (method === "POST" && !isPostAllowed) ||
    (method === "DELETE" && !isDeleteAllowed) ||
    (method === "GET" && !isGetAllowed) ||
    (method !== "GET" && method !== "POST" && method !== "DELETE")
  ) {
    return Response.json({ detail: "Method not allowed" }, { status: 405 });
  }

  if (method !== "GET") {
    const origin = request.headers.get("origin");
    let allowed = false;
    try { allowed = !!origin && new URL(origin).host === request.headers.get("host"); } catch { /* Invalid origins are rejected. */ }
    if (!allowed) return Response.json({ detail: "Request origin is not allowed" }, { status: 403 });
  }
  try {
    const headers = new Headers({ Accept: path[2] === "badge.svg" ? "image/svg+xml,*/*" : "application/json" });
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    if (process.env.AUDITOR_API_KEY) headers.set("X-API-Key", process.env.AUDITOR_API_KEY);
    let body: string | undefined;
    if (method === "POST") {
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.byteLength;
          const cap = path[0] === "analyze-raw-html" ? 1100000 : 4096;
          if (length > cap) { await reader.cancel(); return Response.json({ detail: "Request is too large" }, { status: 413 }); }
          chunks.push(value);
        }
      }
      body = chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : undefined;
      headers.set("Content-Type", "application/json");
    }
    const base = (process.env.AUDITOR_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    const upstream = await fetch(`${base}/api/${path.join("/")}`, { method, headers, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45000) });
    const contentType = upstream.headers.get("content-type") || (path[2] === "badge.svg" ? "image/svg+xml" : "application/json");
    const responseHeaders = new Headers({ "Content-Type": contentType, "Cache-Control": "no-store" });
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("Set-Cookie", cookie);
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) responseHeaders.set("Retry-After", retryAfter);
    const disposition = upstream.headers.get("content-disposition");
    if (disposition && /^attachment; filename="[A-Za-z0-9._-]{1,128}"$/i.test(disposition)) responseHeaders.set("Content-Disposition", disposition);
    return new Response(upstream.status === 204 ? null : await upstream.text(), { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ detail: "The scanner is temporarily unavailable. Please try again." }, { status: 502 });
  }
}
export { proxy as GET, proxy as POST, proxy as DELETE };
