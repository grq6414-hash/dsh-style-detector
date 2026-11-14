/**
 * Host half of the AI 文风检测器 bundle.
 *
 * The whole UI lives in the Web client module (`./client`). This half exists for
 * exactly one reason: the browser side has no model channel, so the client's
 * 「模型复审」action posts the text to `/dsh-style-detector/review` and this route
 * streams one model call through the host `llm` service using the profile's
 * current default model. The route never scores: it only reports which passages
 * read as machine-written, so the score stays deterministic on the client.
 */

const ROUTE_PATH = '/dsh-style-detector/review';
const PROOFREAD_PATH = '/dsh-style-detector/proofread';
const MAX_BODY_BYTES = 400000;

const SYSTEM_PROMPT_GENERAL = [
  '你是中文写作审校。你的任务只有一个：指出这段文字里哪些地方「像 AI 写的」，供作者修改。',
  '只输出一个 JSON 对象，不要 markdown 代码块，不要任何解释文字。',
  '格式：{"items":[{"quote":"原文中逐字出现的片段","type":"empty","severity":2,"title":"问题名","advice":"怎么改","rewrite":"改写后的片段"}]}',
  '字段要求：',
  '1. quote 必须能在原文中逐字找到（含标点原样），长度 6-40 字。',
  '2. type 取 empty（空泛无信息）、logic（假递进/套路逻辑）、translation（翻译腔、生硬搭配）、tone（语气失真）、structure（每段都是观点+解释+总结）之一。',
  '3. severity 取 1（轻微）、2（明显）、3（一眼假）。',
  '4. title 不超过 12 字，advice 不超过 30 字，都是中文。',
  '5. rewrite 是把 quote 那一段改写后的文本，保持原意，更具体、更口语；只在确有更好写法时给出。',
  '6. 最多 5 条，按严重程度从高到低排；没有问题就返回 {"items":[]}。',
  '不要报错别字、标点格式、语法错误，也不要评价整体好坏。',
].join('\n');

// 网文小说模式：AI 写小说的毛病不是套公文词，是「讲故事梗概」——情绪全说了、画面一个没有，
// 所有人一个腔调，靠套句撑场面。关注点与通用模式完全不同，所以提示词单独一份。
const SYSTEM_PROMPT_FICTION = [
  '你是中文网文小说编辑。你的任务只有一个：指出这段小说正文里哪些地方「像 AI 写的」，供作者修改。',
  '只输出一个 JSON 对象，不要 markdown 代码块，不要任何解释文字。',
  '格式：{"items":[{"quote":"原文中逐字出现的片段","type":"tell","severity":2,"title":"问题名","advice":"怎么改","rewrite":"改写后的片段"}]}',
  '字段要求：',
  '1. quote 必须能在原文中逐字找到（含标点原样），长度 6-40 字。',
  '2. type 取 tell（讲述代替呈现：直接给出情绪或结论，没有动作和细节）、cliche（套句：眼中闪过一丝、嘴角勾起、空气仿佛凝固、缓缓地、五味杂陈这类）、flat（对白扁平：所有人一个腔调，或台词在解释设定）、logic（情节靠巧合、强行转折推动）、empty（空泛：形容词堆砌，什么都没发生）之一。',
  '3. severity 取 1（轻微）、2（明显）、3（一眼假）。',
  '4. title 不超过 12 字，advice 不超过 30 字，都是中文。',
  '5. rewrite 是把 quote 那一段改写成小说正文：保留原来的人称与叙述视角，写成能看见的动作、能听见的对白；不要写成故事梗概，不要加旁白评论。',
  '6. 最多 5 条，按严重程度从高到低排；没有问题就返回 {"items":[]}。',
  '不要报错别字、标点格式、语法错误，也不要评价情节好坏或人物设定。',
].join('\n');

// 错字校对：与「AI 味」完全是两件事，所以单独一条路由、单独一份提示词。
// 关键约束是「宁可不报也不猜」——人名、方言、口吻都不能当错字。
const SYSTEM_PROMPT_PROOFREAD = [
  '你是中文校对。任务只有一个：找出这段文字里写错的字或词，也就是本该写成 A 却写成了 B 那种确定性的错误。',
  '只输出一个 JSON 对象，不要 markdown 代码块，不要任何解释文字。',
  '格式：{"items":[{"quote":"含错字的原文片段","wrong":"其中写错的那个词","right":"应该怎么写","reason":"一句理由","confidence":3}]}',
  '字段要求：',
  '1. quote 从原文逐字复制，长度 4-20 字，必须完整包含 wrong。',
  '2. wrong 是原文里写错的那个词，1-4 字，必须与原文一字不差。',
  '3. right 是正确写法，长度与 wrong 尽量相同。',
  '4. reason 不超过 20 字，中文，一句话说清为什么错。',
  '5. confidence 取 3（确定是错）、2（很可能）、1（可疑）。',
  '6. 最多 12 条，按 confidence 从高到低排；没发现就返回 {"items":[]}。',
  '以下情况一律不要报：',
  '- 的/地/得 混用、哪/那、做/作这类两可用法；',
  '- 口语、方言、网络用语、角色口吻，以及上下文中明显是有意为之的写法；',
  '- 人名、地名、门派名、功法名、机构名、作品名等一切专有名词；',
  '- 标点、空格、分段、繁简体、全半角；',
  '- 句子不通顺、表达啰嗦、用词不优美、语法结构问题；',
  '- 你不确定的地方。宁可不报。',
].join('\n');

function proofPrompt() { return SYSTEM_PROMPT_PROOFREAD; }

function systemPrompt(mode) {
  return mode === 'fiction' ? SYSTEM_PROMPT_FICTION : SYSTEM_PROMPT_GENERAL;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求过大'));
        try { req.destroy(); } catch (e) { /* already gone */ }
        return;
      }
      parts.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

function extractJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('读取模型列表超时')), ms);
      if (timer && typeof timer.unref === 'function') timer.unref();
    }),
  ]);
}

// 列出「智能体已经绑定的」provider 与它们目录里的模型，供面板挑选。
// 某一家探测失败只标注该家，不影响其它家。
function badgeText(badge) {
  if (!badge || !badge.text) return '';
  const t = badge.text;
  if (typeof t === 'string') return t;
  if (typeof t === 'object') return t.zh || t.en || '';
  return '';
}

async function listOptions(llm) {
  const providers = typeof llm.listProviders === 'function' ? llm.listProviders() : [];
  const out = [];
  for (const p of providers || []) {
    if (!p || !p.id) continue;
    const row = { id: p.id, name: p.name || p.id, models: [] };
    if (typeof llm.listModels === 'function') {
      try {
        const list = await withTimeout(llm.listModels(p.id), 6000);
        if (Array.isArray(list)) {
          const usable = (m) => m && typeof m.id === 'string'
            && m.id.replace(/[\s\u200b-\u200f\u2060\ufeff]/g, '') !== '';
          row.models = list
            .filter(usable)
            .map((m) => {
              const row = { id: m.id, name: typeof m.name === 'string' && m.name ? m.name : m.id };
              const badge = badgeText(m.badge);
              if (badge) row.badge = badge;
              return row;
            });
          if (!row.models.length && list.length) {
            row.error = '这一家的模型 id 是空白字符，没法选';
          }
        }
      } catch (e) {
        row.error = e && e.message ? String(e.message) : '读取模型列表失败';
      }
    }
    out.push(row);
  }
  return out;
}

async function resolveRoute(ctx, llm, explicit) {
  const providers = typeof llm.listProviders === 'function' ? llm.listProviders() : [];
  const known = new Set((providers || []).map((p) => p && p.id).filter(Boolean));

  let provider = '';
  let model = '';
  let source = 'default';

  // 面板里挑过的模型优先：只影响本插件的复审，不动全局默认。
  const explicitModel = explicit && typeof explicit.model === 'string'
    ? explicit.model.replace(/[\s\u200b-\u200f\u2060\ufeff]/g, '')
    : '';
  const explicitProvider = explicit && typeof explicit.provider === 'string' ? explicit.provider.trim() : '';
  if (!provider && explicitProvider && explicitModel
    && (!known.size || known.has(explicitProvider))) {
    provider = explicitProvider;
    model = explicitModel;
    source = 'picked';
  }

  // 只有没挑过模型时才读全局默认；挑过的值不能被默认覆盖。
  if (source !== 'picked') {
    const defaultModel = typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : null;
    if (defaultModel && typeof defaultModel.currentSelection === 'function') {
      try {
        const sel = defaultModel.currentSelection();
        if (sel) {
          provider = sel.provider || sel.providerId || '';
          model = sel.model || sel.modelId || '';
        }
      } catch (e) {
        /* fall back to the first registered provider */
      }
    }
  }

  if (provider && known.size && !known.has(provider) && source !== 'picked') {
    provider = '';
    model = '';
  }
  if (!provider && known.size) {
    provider = (providers[0] && providers[0].id) || '';
    model = '';
  }
  if (!provider) return null;

  if (!model && source !== 'picked' && typeof llm.listModels === 'function') {
    try {
      const list = await llm.listModels(provider);
      if (Array.isArray(list) && list.length) model = list[0].id;
    } catch (e) {
      /* no catalog: the caller still needs an explicit model id */
    }
  }
  if (!model) return null;
  return { provider, model, source };
}

async function review(ctx, text, mode, explicit) {
  const llm = typeof ctx.get === 'function' ? ctx.get('llm') : null;
  if (!llm || typeof llm.stream !== 'function') {
    return { ok: false, error: '宿主没有模型服务（llm 未挂载）' };
  }

  const route = await resolveRoute(ctx, llm, explicit);
  if (!route) return { ok: false, error: '没有可用的模型，请先在设置里选一个默认模型' };

  let raw = '';
  let failure = null;

  const stream = llm.stream({
    provider: route.provider,
    model: route.model,
    system: systemPrompt(mode),
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: '原文：\n"""\n' + text + '\n"""' }],
      },
    ],
    maxTokens: 1200,
  });

  for await (const chunk of stream) {
    if (!chunk) continue;
    if (chunk.type === 'text-delta') {
      raw += chunk.text;
    } else if (chunk.type === 'finish') {
      const reason = chunk.reason;
      if (reason && (reason.kind === 'error' || reason.kind === 'aborted')) {
        failure = reason.failure || { message: '模型调用失败' };
      }
    }
  }

  if (!raw && failure) {
    return { ok: false, error: failure.message || '模型调用失败', code: failure.code || '' };
  }
  if (!raw) return { ok: false, error: '模型没有返回内容' };

  const data = extractJson(raw);
  if (!data) {
    return { ok: false, error: '模型返回的不是 JSON', raw: raw.slice(0, 300) };
  }

  const items = [];
  let dropped = 0;
  const list = Array.isArray(data.items) ? data.items : [];

  for (const item of list) {
    if (items.length >= 5) break;
    if (!item || typeof item !== 'object') {
      dropped++;
      continue;
    }
    const quote = typeof item.quote === 'string' ? item.quote.trim() : '';
    // 只保留能在原文里逐字定位的片段，保证高亮与替换都不会错位。
    if (!quote || text.indexOf(quote) < 0) {
      dropped++;
      continue;
    }
    const severity = typeof item.severity === 'number' ? Math.min(3, Math.max(1, Math.round(item.severity))) : 2;
    items.push({
      quote,
      type: typeof item.type === 'string' ? item.type : 'empty',
      severity,
      title: typeof item.title === 'string' ? item.title.slice(0, 24) : '',
      advice: typeof item.advice === 'string' ? item.advice.slice(0, 80) : '',
      rewrite: typeof item.rewrite === 'string' ? item.rewrite.slice(0, 300) : '',
    });
  }

  return { ok: true, mode: mode === 'fiction' ? 'fiction' : 'general', provider: route.provider, model: route.model, source: route.source, items, dropped };
}

// 校对：把模型给的三元组（quote / wrong / right）换算成原文里的绝对区间，
// 逐条用 indexOf 复核，对不上就丢掉——高亮与替换因此不会错位。
async function proofread(ctx, text, explicit) {
  const llm = typeof ctx.get === 'function' ? ctx.get('llm') : null;
  if (!llm || typeof llm.stream !== 'function') {
    return { ok: false, error: '宿主没有模型服务（llm 未挂载）' };
  }

  const route = await resolveRoute(ctx, llm, explicit);
  if (!route) return { ok: false, error: '没有可用的模型，请先在设置里选一个默认模型' };

  let raw = '';
  let failure = null;

  const stream = llm.stream({
    provider: route.provider,
    model: route.model,
    system: proofPrompt(),
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: '原文：\n"""\n' + text + '\n"""' }],
      },
    ],
    maxTokens: 1400,
  });

  for await (const chunk of stream) {
    if (!chunk) continue;
    if (chunk.type === 'text-delta') {
      raw += chunk.text;
    } else if (chunk.type === 'finish') {
      const reason = chunk.reason;
      if (reason && (reason.kind === 'error' || reason.kind === 'aborted')) {
        failure = reason.failure || { message: '模型调用失败' };
      }
    }
  }

  if (!raw && failure) {
    return { ok: false, error: failure.message || '模型调用失败', code: failure.code || '' };
  }
  if (!raw) return { ok: false, error: '模型没有返回内容' };

  const data = extractJson(raw);
  if (!data) return { ok: false, error: '模型返回的不是 JSON', raw: raw.slice(0, 300) };

  const items = [];
  const seen = new Set();
  let dropped = 0;
  const list = Array.isArray(data.items) ? data.items : [];

  for (const item of list) {
    if (items.length >= 12) break;
    if (!item || typeof item !== 'object') { dropped++; continue; }
    const quote = typeof item.quote === 'string' ? item.quote : '';
    const wrong = typeof item.wrong === 'string' ? item.wrong : '';
    const right = typeof item.right === 'string' ? item.right : '';
    if (!quote || !wrong || !right || wrong === right) { dropped++; continue; }
    const q = text.indexOf(quote);
    if (q < 0) { dropped++; continue; }
    const off = quote.indexOf(wrong);
    if (off < 0) { dropped++; continue; }
    const start = q + off;
    const end = start + wrong.length;
    if (seen.has(start)) { dropped++; continue; }
    seen.add(start);
    const confidence = typeof item.confidence === 'number'
      ? Math.min(3, Math.max(1, Math.round(item.confidence)))
      : 2;
    items.push({
      start,
      end,
      quote: text.slice(start, end),
      wrong,
      right: right.slice(0, 8),
      reason: typeof item.reason === 'string' ? item.reason.slice(0, 40) : '',
      confidence,
    });
  }

  items.sort((a, b) => b.confidence - a.confidence || a.start - b.start);
  return { ok: true, provider: route.provider, model: route.model, source: route.source, items, dropped };
}

async function handleProofread(ctx, req, res) {
  const send = (status, payload) => {
    if (res.writableEnded) return;
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(payload));
  };

  if (req.method !== 'POST') {
    send(405, { ok: false, error: '只接受 POST' });
    return;
  }

  let body = '';
  try {
    body = await readBody(req);
  } catch (e) {
    send(400, { ok: false, error: '读取请求失败' });
    return;
  }

  let text = '';
  let explicit = null;
  try {
    const parsed = JSON.parse(body);
    text = parsed && typeof parsed.text === 'string' ? parsed.text : '';
    if (parsed && typeof parsed.provider === 'string' && parsed.provider
      && typeof parsed.model === 'string' && parsed.model) {
      explicit = { provider: parsed.provider, model: parsed.model };
    }
  } catch (e) {
    send(400, { ok: false, error: '请求不是合法 JSON' });
    return;
  }

  text = text.trim();
  if (text.length < 6) {
    send(400, { ok: false, error: '文本太短，无法校对' });
    return;
  }

  try {
    send(200, await proofread(ctx, text, explicit));
  } catch (e) {
    send(200, { ok: false, error: e && e.message ? String(e.message) : '校对失败' });
  }
}

async function handle(ctx, req, res) {
  const send = (status, payload) => {
    if (res.writableEnded) return;
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(payload));
  };

  // GET：只回报本次复审会用的模型，供面板显示，不发起任何模型调用。
  if (req.method === 'GET') {
    const llm = typeof ctx.get === 'function' ? ctx.get('llm') : null;
    if (!llm || typeof llm.stream !== 'function') {
      send(200, { ok: false, error: '宿主没有模型服务（llm 未挂载）' });
      return;
    }
    try {
      const route = await resolveRoute(ctx, llm);
      const options = await listOptions(llm);
      if (!route) {
        send(200, { ok: false, error: '没有可用的模型，请先在设置里选一个默认模型', options });
        return;
      }
      send(200, { ok: true, provider: route.provider, model: route.model, source: route.source, options });
    } catch (e) {
      send(200, { ok: false, error: e && e.message ? String(e.message) : '读取模型失败' });
    }
    return;
  }

  if (req.method !== 'POST') {
    send(405, { ok: false, error: '只接受 GET / POST' });
    return;
  }

  let body = '';
  try {
    body = await readBody(req);
  } catch (e) {
    send(400, { ok: false, error: '读取请求失败' });
    return;
  }

  let text = '';
  let mode = 'general';
  let explicit = null;
  try {
    const parsed = JSON.parse(body);
    text = parsed && typeof parsed.text === 'string' ? parsed.text : '';
    mode = parsed && parsed.mode === 'fiction' ? 'fiction' : 'general';
    if (parsed && typeof parsed.provider === 'string' && parsed.provider
      && typeof parsed.model === 'string' && parsed.model) {
      explicit = { provider: parsed.provider, model: parsed.model };
    }
  } catch (e) {
    send(400, { ok: false, error: '请求不是合法 JSON' });
    return;
  }

  text = text.trim();
  if (text.length < 20) {
    send(400, { ok: false, error: '文本太短，无法复审' });
    return;
  }

  try {
    send(200, await review(ctx, text, mode, explicit));
  } catch (e) {
    send(200, { ok: false, error: e && e.message ? String(e.message) : '复审失败' });
  }
}

export function apply(ctx) {
  // webServer 在冷启动时可能比本插件晚就绪。以前这里拿不到就 return，
  // 结果路由永远不注册（宿主侧一切正常、面板却一直 404）。现在改成「等它出现再挂」。
  let done = false;
  let timer = null;
  const disposers = [];

  const mountWith = (webServer) => {
    if (done) return true;
    if (!webServer || typeof webServer.register !== 'function') return false;
    mountAll(webServer);
    done = true;
    return true;
  };

  const mountAll = (webServer) => {
  const mount = (path, fn) => {
    try {
      return webServer.register({
        kind: 'exact',
        path,
        handler: (req, res) => {
          fn(ctx, req, res).catch(() => {
            try {
              if (!res.writableEnded) {
                res.statusCode = 500;
                res.setHeader('content-type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ ok: false, error: '内部错误' }));
              }
            } catch (e) {
              /* response already gone */
            }
          });
        },
      });
    } catch (e) {
      return null;
    }
  };

  const mounted = [mount(ROUTE_PATH, handle), mount(PROOFREAD_PATH, handleProofread)]
    .filter((d) => typeof d === 'function');
  for (const d of mounted) disposers.push(d);
  };

  const disposeAll = () => {
    if (timer) { try { clearTimeout(timer); } catch (e) { /* noop */ } timer = null; }
    for (const d of disposers.splice(0)) {
      try { d(); } catch (e) { /* already gone */ }
    }
    done = false;
  };

  const attempt = (left) => {
    if (done) return;
    const webServer = typeof ctx.get === 'function' ? ctx.get('webServer') : null;
    if (mountWith(webServer)) return;
    if (left <= 0) return;
    timer = setTimeout(() => { timer = null; attempt(left - 1); }, 200);
    if (timer && typeof timer.unref === 'function') timer.unref();
  };

  if (typeof ctx.effect === 'function') ctx.effect(() => disposeAll);

  attempt(50); // 最多等 10 秒
  return undefined;
}
