/**
 * 湘潭大学就业信息网 MCP
 * Cloudflare Worker · Streamable HTTP（无状态 JSON-RPC）
 *
 * 官网：https://jiuye.xtu.edu.cn/
 * 搜索数据源：https://dc.bysjy.com.cn/search/provider_new
 *
 * 2026-09 站内搜索已不是传统 HTML 表单：
 *   1. 先请求 is_total=1 获取总数
 *   2. 再请求 provider_new 获取当前页数据
 * 返回格式是：var __result = {...};
 */

const DEFAULT_UUID = "1725d2a2-4a65-4608-a623-20667e1cae3f";

const SITE = "https://jiuye.xtu.edu.cn";
const SEARCH_API = "https://dc.bysjy.com.cn/search/provider_new";
const SCHOOL_TOKEN = "yxqqnn0000000005";
const PROTOCOL = "2025-03-26";
const UA =
  "Mozilla/5.0 (compatible; XTU-JIUYE-MCP/1.0; +https://jiuye.xtu.edu.cn/)";

const SERVER_INFO = {
  name: "xtu-jiuye-mcp",
  title: "湘潭大学就业信息网检索",
  version: "1.0.0",
};

const TYPE_INFO = {
  "1": { name: "双选会", detail: "jobfair" },
  "2": { name: "双选会参会单位", detail: null },
  "3": { name: "宣讲会", detail: "career" },
  "4": { name: "在线招聘", detail: "online" },
  "5": { name: "职位", detail: "job" },
  "6": { name: "通知公告", detail: "news" },
};

const TOOLS = [
  {
    name: "search_jiuye",
    description:
      "搜索湘潭大学就业信息网公开内容。会先调用云就业 provider_new 的 is_total=1 接口获取总数，再请求当前页数据；支持招聘公告、双选会、宣讲会、在线招聘、职位、通知公告等。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "关键词，例如：华为、中铁、算法、软件工程、长沙" },
        page: { type: "integer", minimum: 1, default: 1, description: "页码，从 1 开始" },
        page_size: { type: "integer", minimum: 1, maximum: 50, default: 10, description: "每页数量，默认 10，最大 50" },
        type: { type: "string", enum: ["", "1", "2", "3", "4", "5", "6"], default: "", description: "搜索类型：空字符串=全部；1=双选会；2=双选会参会单位；3=宣讲会；4=在线招聘；5=职位；6=通知公告" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_detail",
    description:
      "读取湘潭大学就业信息网公开详情页正文。可直接传 search_jiuye 返回的 detail_url；也可传 type + id 自动生成详情页。",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "完整的 jiuye.xtu.edu.cn 详情页 URL；有此参数时优先使用" },
        type: { type: "string", enum: ["1", "2", "3", "4", "5", "6"], description: "搜索结果 type" },
        id: { type: "string", description: "搜索结果 id" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_sections",
    description:
      "列出湘潭大学就业信息网常用公开栏目：招聘公告、双选会、宣讲会、全职/实习岗位、常用下载、政策法规、就业指导等。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const SECTIONS = {
  home: `${SITE}/`,
  search: `${SITE}/module/search`,
  recruitment_news: `${SITE}/module/news?menu_id=46519&self_id=46523&type_id=47`,
  job_fairs: `${SITE}/module/jobfairs?menu_id=46519&self_id=46524`,
  careers: `${SITE}/module/careers?menu_id=46519&self_id=46525`,
  full_time_jobs: `${SITE}/module/jobs?is_practice=0&menu_id=46519&self_id=46526`,
  internships: `${SITE}/module/jobs?is_practice=1&menu_id=46519&self_id=46527`,
  downloads: `${SITE}/module/news?menu_id=46520&self_id=46528&type_id=9572383`,
  policies: `${SITE}/module/news?menu_id=46520&self_id=46529&type_id=9572393`,
  career_guidance: `${SITE}/module/news?menu_id=46522&self_id=46540&type_id=28`,
};

export default {
  async fetch(request, env) {
    const uuid = String(env.ACCESS_UUID || DEFAULT_UUID).toLowerCase();
    const url = new URL(request.url);
    const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (request.method === "GET" && parts.length === 1 && parts[0].toLowerCase() === "health") {
      return cors(json({ ok: true, service: SERVER_INFO.name, version: SERVER_INFO.version, source: SEARCH_API, hint: "MCP 地址为 /<ACCESS_UUID>/mcp，使用 Streamable HTTP / http。" }));
    }
    if (parts[0]?.toLowerCase() !== uuid) return new Response("Not Found", { status: 404 });
    const rest = parts.slice(1).join("/") || "";
    const isMcpPath = rest === "" || rest === "health" || rest === "mcp" || rest === "sse" || rest === "message" || rest === "messages" || rest === "mcp/sse" || rest === "mcp/message" || rest === "mcp/messages";
    if (!isMcpPath) return new Response("Not Found", { status: 404 });
    if (request.method === "GET" && (rest === "" || rest === "health") && !acceptsEventStream(request)) {
      return cors(json({ ok: true, service: SERVER_INFO.name, version: SERVER_INFO.version, mcp: `/${uuid}/mcp`, hint: "type 使用 streamableHttp / http，不要使用旧 SSE。" }));
    }
    if (request.method === "GET") return cors(new Response("Method Not Allowed. Use POST JSON-RPC (Streamable HTTP).", { status: 405, headers: { Allow: "POST, OPTIONS", "Content-Type": "text/plain; charset=utf-8" } }));
    if (request.method === "DELETE") return cors(new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS" } }));
    if (request.method !== "POST") return cors(new Response("Method Not Allowed", { status: 405 }));
    return handleMcp(request);
  },
};

async function handleMcp(request) {
  let body;
  try { body = await request.json(); }
  catch { return cors(json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400)); }
  if (Array.isArray(body)) {
    const out = [];
    for (const item of body) { const res = await dispatch(item); if (res) out.push(res); }
    return cors(json(out));
  }
  const res = await dispatch(body);
  if (!res) return cors(new Response(null, { status: 202 }));
  return cors(json(res));
}

async function dispatch(msg) {
  if (!msg || typeof msg !== "object") return rpcError(null, -32600, "Invalid Request");
  const { id, method, params } = msg;
  const isNotify = id === undefined || id === null;
  try {
    switch (method) {
      case "initialize": return rpcResult(id, { protocolVersion: params?.protocolVersion || PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: "检索湘潭大学就业信息网。优先用 search_jiuye 搜索，它会先查总数再取当前页；需要阅读全文时把结果中的 detail_url 交给 get_detail。" });
      case "notifications/initialized":
      case "notifications/cancelled":
      case "notifications/progress": return null;
      case "ping": return isNotify ? null : rpcResult(id, {});
      case "tools/list": return rpcResult(id, { tools: TOOLS });
      case "tools/call": return rpcResult(id, await callTool(params || {}));
      case "resources/list": return rpcResult(id, { resources: [] });
      case "resources/templates/list": return rpcResult(id, { resourceTemplates: [] });
      case "prompts/list": return rpcResult(id, { prompts: [] });
      default: if (isNotify) return null; return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    if (isNotify) return null;
    return rpcError(id, -32000, String(err?.message || err));
  }
}

async function callTool(params) {
  const name = params.name;
  const args = params.arguments || {};
  if (name === "search_jiuye") {
    const query = String(args.query || "").trim();
    if (!query) return textResult("请提供 query。", true);
    const page = Math.max(1, Number(args.page || 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(args.page_size || 10) || 10));
    const type = normalizeType(args.type);
    return textResult(JSON.stringify(await searchJiuye(query, page, pageSize, type), null, 2));
  }
  if (name === "get_detail") {
    let target = String(args.url || "").trim();
    if (!target) {
      const type = normalizeType(args.type);
      const id = String(args.id || "").trim();
      if (!type || !id) return textResult("请提供 url，或同时提供 type 和 id。", true);
      target = buildDetailUrl(type, id);
      if (!target) return textResult(`暂时无法为 type=${type} 自动生成详情链接，请直接提供详情页 url。`, true);
    }
    return textResult(JSON.stringify(await getDetail(target), null, 2));
  }
  if (name === "list_sections") {
    return textResult(JSON.stringify({ sections: SECTIONS, search_types: { "": "全部", "1": "双选会", "2": "双选会参会单位", "3": "宣讲会", "4": "在线招聘", "5": "职位", "6": "通知公告" } }, null, 2));
  }
  return textResult(`未知工具: ${name}`, true);
}

function textResult(text, isError = false) { return { content: [{ type: "text", text }], isError }; }
function normalizeType(value) { const t = String(value ?? "").trim(); return ["", "1", "2", "3", "4", "5", "6"].includes(t) ? t : ""; }

async function searchJiuye(query, page, pageSize, type) {
  const totalUrl = new URL(SEARCH_API);
  totalUrl.searchParams.set("token", SCHOOL_TOKEN);
  totalUrl.searchParams.set("start", "0");
  totalUrl.searchParams.set("count", "0");
  totalUrl.searchParams.set("keyword", query);
  totalUrl.searchParams.set("type", type);
  totalUrl.searchParams.set("is_total", "1");
  totalUrl.searchParams.set("_", String(Date.now()));
  const totalPayload = await fetchProvider(totalUrl);
  const total = extractTotal(totalPayload);
  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return { query, type, type_name: type ? TYPE_INFO[type]?.name || "" : "全部", page, page_size: pageSize, total: 0, total_pages: 0, count: 0, items: [], source: SEARCH_API };
  const start = (page - 1) * pageSize + 1;
  const listUrl = new URL(SEARCH_API);
  listUrl.searchParams.set("start_page", String(page));
  listUrl.searchParams.set("token", SCHOOL_TOKEN);
  listUrl.searchParams.set("keyword", query);
  listUrl.searchParams.set("type", type);
  listUrl.searchParams.set("count", String(pageSize));
  listUrl.searchParams.set("start", String(start));
  listUrl.searchParams.set("_", String(Date.now() + 1));
  const listPayload = await fetchProvider(listUrl);
  const rawItems = Array.isArray(listPayload?.data) ? listPayload.data : [];
  const items = rawItems.map((item) => {
    const itemType = String(item?.type ?? "");
    const id = String(item?.id ?? "");
    return { type: itemType, type_name: TYPE_INFO[itemType]?.name || "", id, title: String(item?.title ?? ""), subtitle: String(item?.subtitle ?? ""), time: String(item?.time ?? ""), address: String(item?.address ?? ""), professionals: String(item?.professionals ?? ""), job_recruitment: String(item?.job_recruitment ?? ""), original_time: String(item?.original_time ?? ""), detail_url: buildDetailUrl(itemType, id), raw: item };
  });
  return { query, type, type_name: type ? TYPE_INFO[type]?.name || "" : "全部", page, page_size: pageSize, total, total_pages: totalPages, count: items.length, items, source: SEARCH_API };
}

async function fetchProvider(url) {
  const res = await fetch(url, { method: "GET", headers: { Accept: "*/*", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8", Referer: `${SITE}/`, "User-Agent": UA, "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error(`云就业搜索接口失败 HTTP ${res.status}`);
  return parseProviderResult(await res.text());
}

function parseProviderResult(text) {
  let s = String(text || "").trim();
  if (s.startsWith("{") || s.startsWith("[")) return JSON.parse(s);
  const m = s.match(/^(?:var\s+)?__result\s*=\s*([\s\S]*?)\s*;?\s*$/);
  if (!m) throw new Error(`无法解析云就业搜索返回格式：${s.slice(0, 160)}`);
  return JSON.parse(m[1]);
}

function extractTotal(payload) {
  if (!payload || Number(payload.code) !== 1) { if (payload?.msg) throw new Error(`搜索接口返回错误：${payload.msg}`); }
  const row = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (!row || row.total === undefined || row.total === null) return null;
  const n = Number(row.total);
  return Number.isFinite(n) ? n : null;
}

function buildDetailUrl(type, id) {
  if (!type || !id) return null;
  const detail = TYPE_INFO[type]?.detail;
  if (!detail) return null;
  const u = new URL(`${SITE}/detail/${detail}`);
  u.searchParams.set("id", id);
  return u.href;
}

async function getDetail(input) {
  let target = String(input || "").trim();
  if (!/^https?:\/\//i.test(target)) target = new URL(target.replace(/^\/+/, ""), SITE + "/").href;
  const url = new URL(target);
  if (url.hostname !== "jiuye.xtu.edu.cn") throw new Error("get_detail 仅允许读取 jiuye.xtu.edu.cn 公开页面。");
  if (!url.pathname.startsWith("/detail/")) throw new Error("get_detail 仅允许读取 /detail/ 下的公开详情页。");
  const res = await fetch(url, { headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8", Referer: `${SITE}/`, "User-Agent": UA } });
  if (!res.ok) throw new Error(`详情页抓取失败 HTTP ${res.status}`);
  const html = await res.text();
  const title = extractTitle(html);
  const text = extractPageText(html);
  const links = extractUsefulLinks(html, url.href);
  return { title, url: url.href, chars: text.length, links, text: text.slice(0, 20000) };
}

function extractTitle(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) { const t = strip(h1[1]); if (t) return t; }
  const title = strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ""])[1]);
  return title || "湘潭大学就业信息网";
}

function extractPageText(html) {
  let chunk = String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, " ");
  const lines = decodeEntities(chunk).split(/\n+/).map((x) => x.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
  const dropExact = new Set(["网站首页", "学生导航", "单位导航", "关于我们", "招聘公告", "招聘会", "宣讲会", "全职岗位", "实习岗位", "常用下载", "政策法规", "就业指导"]);
  const out = [];
  for (const line of lines) { if (dropExact.has(line)) continue; if (/湘潭大学版权所有/.test(line)) break; if (/^联系地址：湖南省湘潭市湘潭大学服务大楼/.test(line)) break; out.push(line); }
  return out.join("\n").trim();
}

function extractUsefulLinks(html, pageUrl) {
  const out = [];
  const seen = new Set();
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[1]).trim();
    if (!href || href === "#" || /^javascript:/i.test(href)) continue;
    let abs;
    try { abs = new URL(href, pageUrl).href; } catch { continue; }
    if (seen.has(abs)) continue;
    seen.add(abs);
    const label = strip(m[2]).slice(0, 160);
    if (/\/detail\//i.test(abs) || /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z)(?:$|[?#])/i.test(abs) || label) out.push({ name: label || abs, url: abs });
    if (out.length >= 50) break;
  }
  return out;
}

function decodeEntities(s) { return String(s || "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, n) => { const code = Number(n); return Number.isFinite(code) ? String.fromCodePoint(code) : " "; }).replace(/&#x([0-9a-f]+);/gi, (_, n) => { const code = parseInt(n, 16); return Number.isFinite(code) ? String.fromCodePoint(code) : " "; }); }
function strip(s) { return decodeEntities(String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); }
function rpcResult(id, result) { return { jsonrpc: "2.0", id: id ?? null, result }; }
function rpcError(id, code, message) { return { jsonrpc: "2.0", id: id ?? null, error: { code, message } }; }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
function acceptsEventStream(request) { const accept = request.headers.get("Accept") || ""; return /text\/event-stream/i.test(accept); }
function cors(res) { const headers = new Headers(res.headers); headers.set("Access-Control-Allow-Origin", "*"); headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); headers.set("Access-Control-Allow-Headers", "Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name, Last-Event-ID"); headers.set("Access-Control-Expose-Headers", "Mcp-Session-Id"); return new Response(res.body, { status: res.status, headers }); }
