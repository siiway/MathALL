import { readStorage } from '../utils/storage';
import { getStage } from '../data/curriculum';

export interface StreamResponse {
  tag?: string;      // 题目标签
  renderer?: 'GEOGEBRA' | 'HTML_CANVAS';
  contentChunk?: string; // 内容碎片
  done: boolean;
}

export interface StreamOptions {
  /** 用于中止生成（对应界面上的“停止”按钮）。 */
  signal?: AbortSignal;
}

const SUPPORTED_PROVIDERS = ['openai', 'ollama', 'gemini', 'anthropic', 'cloudflare'] as const;
type Provider = typeof SUPPORTED_PROVIDERS[number];

/** 各家协议的请求体结构差异很大，统一用宽松的 JSON 对象描述。 */
type JsonObject = Record<string, unknown>;

/** 各家 SSE 消息的并集（字段都是可选的，取值前逐层判空）。 */
interface SseMessage {
  error?: { message?: string };
  // OpenAI / Ollama
  choices?: Array<{ delta?: { content?: string } }>;
  // Gemini
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  // Anthropic
  type?: string;
  delta?: { text?: string };
  // Cloudflare Workers AI
  response?: string;
}

const DEFAULT_SYSTEM_PROMPT =
  'You are MathAll, an advanced mathematical AI assistant.\n' +
  'CRITICAL INSTRUCTION: Your response MUST STRICTLY start with a 4-character tag enclosed in 【】, indicating the math domain. ' +
  'For example: 【几何综合】, 【代数计算】, 【函数极值】. THIS MUST BE THE VERY FIRST THING YOU OUTPUT.\n' +
  'After the tag, provide step-by-step mathematical logic and analysis in Markdown, wrapping formulas in $ for inline and $$ for blocks. ' +
  'Provide GeoGebra commands if geometry is involved.';

/**
 * Build endpoint URL + headers based on the user's chosen proxy mode.
 *
 * - "builtin": Route through Vite dev-server's /api-proxy middleware.
 *   Node.js makes the outbound request → zero CORS issues. (dev only)
 *
 * - "custom": Prepend the user's custom proxy URL to the real endpoint.
 *   e.g.  https://my-proxy.workers.dev/ + https://api.openai.com/v1/chat/completions
 *
 * - fallback (no proxy): Hit the remote API directly from the browser.
 */
function buildRequest(
  slug: string,
  realBase: string,
  apiPath: string,
  extraHeaders: Record<string, string> = {}
): { url: string; headers: Record<string, string> } {
  const proxyMode = readStorage('mathall-proxy-mode') || 'builtin';
  const corsProxy = readStorage('mathall-cors-proxy') || '';

  const base = realBase.endsWith('/') ? realBase.slice(0, -1) : realBase;
  const path = apiPath.startsWith('/') ? apiPath : '/' + apiPath;
  const fullUrl = `${base}${path}`;

  let url: string;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  if (proxyMode === 'builtin') {
    // Vite dev-server proxy: /api-proxy/<slug>/<path>
    url = `/api-proxy/${slug}${path}`;
    headers['X-Proxy-Target'] = base;
  } else if (proxyMode === 'custom' && corsProxy) {
    // Custom reverse proxy: corsProxy + fullUrl
    const proxy = corsProxy.endsWith('/') ? corsProxy : corsProxy + '/';
    url = proxy + fullUrl;
  } else {
    // Direct (no proxy)
    url = fullUrl;
  }

  return { url, headers };
}

/** 凭据优先取本地设置，其次回退到构建期注入的环境变量（见 .env.example）。 */
function resolveCredentials() {
  const env = import.meta.env;
  return {
    baseUrl: (readStorage('mathall-api-base-url') || env.VITE_API_BASE_URL || '').trim(),
    apiKey: (readStorage('mathall-api-key') || env.VITE_API_KEY || '').trim(),
    modelName: (readStorage('mathall-model-name') || env.VITE_MODEL_NAME || 'gpt-3.5-turbo').trim(),
    provider: (readStorage('mathall-api-provider') || env.VITE_API_PROVIDER || 'openai').trim(),
  };
}

/**
 * 组装最终的 system prompt：用户在设置页写的基础提示词（负责输出格式）
 * + 当前学段的专属指令（负责知识范围与解法风格）。
 * 分开拼而不是整段替换，是为了让用户对格式的自定义不会被学段覆盖掉。
 */
export function resolveSystemPrompt(): string {
  const base = readStorage('mathall-system-prompt') || DEFAULT_SYSTEM_PROMPT;
  const addendum = getStage(readStorage('mathall-stage')).promptAddendum;
  return addendum ? `${base}\n\n${addendum}` : base;
}

/** 提取单条 SSE data 行中的正文；返回 '' 表示这条消息没有可用文本。 */
function extractContent(provider: Provider, data: SseMessage): string {
  switch (provider) {
    case 'openai':
    case 'ollama':
      return data.choices?.[0]?.delta?.content || '';
    case 'gemini': {
      const parts = data.candidates?.[0]?.content?.parts;
      // 一个 chunk 可能带多个 part（例如思维链 + 正文），全部拼接，避免漏字
      return Array.isArray(parts) ? parts.map(p => p?.text || '').join('') : '';
    }
    case 'anthropic':
      return data.type === 'content_block_delta' ? (data.delta?.text || '') : '';
    case 'cloudflare':
      return data.response || '';
  }
}

export async function* fetchAIAnalysisStream(
  problemText: string,
  imagesBase64: string[],
  options: StreamOptions = {}
): AsyncGenerator<StreamResponse, void, unknown> {
  const { signal } = options;
  const { baseUrl, apiKey, modelName, provider } = resolveCredentials();
  const systemPrompt = resolveSystemPrompt();

  if (!SUPPORTED_PROVIDERS.includes(provider as Provider)) {
    throw new Error(`不支持的 API 协议服务商：${provider}，请在设置中重新选择。`);
  }
  const apiProvider = provider as Provider;

  // Cloudflare 用 Account ID 占用 baseUrl 字段，其余协议必须是可解析的 URL
  if (!baseUrl || !apiKey) {
    yield { tag: '配置缺失', done: true };
    throw new Error('抱歉，找不到 API 凭据，请于右上角设置中填写您的模型端点。');
  }

  let fetchUrl = '';
  let fetchHeaders: Record<string, string> = {};
  let requestBody: JsonObject = {};

  // ── OpenAI / OpenAI-compatible (DeepSeek, Kimi, Qwen, SiliconFlow, etc.) ──
  if (apiProvider === 'openai' || apiProvider === 'ollama') {
    let base = baseUrl;
    if (!base.startsWith('http')) base = 'https://' + base;
    base = base.endsWith('/') ? base.slice(0, -1) : base;

    const basePath = base.endsWith('/chat/completions') ? base.slice(0, -'/chat/completions'.length) : base;
    let parsedBase: URL;
    try {
      parsedBase = new URL(basePath);
    } catch {
      throw new Error(`API Base URL 格式无效：${baseUrl}`);
    }
    const realBase = parsedBase.origin;
    const pathPrefix = parsedBase.pathname === '/' ? '' : parsedBase.pathname.replace(/\/$/, '');
    const apiPath = `${pathPrefix}/chat/completions`;

    const messages: JsonObject[] = [
      { role: 'system', content: systemPrompt },
    ];
    const userContent: JsonObject[] = [];
    userContent.push({ type: 'text', text: problemText.trim() || '请仔细分析图片中的数学问题。' });
    for (const b64 of imagesBase64 || []) {
      userContent.push({ type: 'image_url', image_url: { url: b64 } });
    }
    messages.push({ role: 'user', content: userContent });

    const { url, headers } = buildRequest('openai', realBase, apiPath, {
      Authorization: `Bearer ${apiKey}`,
    });
    fetchUrl = url;
    fetchHeaders = headers;
    requestBody = { model: modelName, messages, stream: true, temperature: 0.2 };

  // ── Google Gemini ──
  } else if (apiProvider === 'gemini') {
    let base = baseUrl || 'https://generativelanguage.googleapis.com';
    if (!base.startsWith('http')) base = 'https://' + base;
    base = base.endsWith('/') ? base.slice(0, -1) : base;
    if (base.endsWith('/v1beta')) base = base.slice(0, -'/v1beta'.length);
    else if (base.endsWith('/v1')) base = base.slice(0, -'/v1'.length);

    const cleanModelName = modelName.replace(/^models\//, '');
    const apiPath =
      `/v1beta/models/${encodeURIComponent(cleanModelName)}:streamGenerateContent` +
      `?key=${encodeURIComponent(apiKey)}&alt=sse`;

    const parts: JsonObject[] = [{ text: problemText.trim() || '请仔细分析图片中的数学问题。' }];
    for (const b64 of imagesBase64 || []) {
      const match = b64.match(/^data:(image\/[a-zA-Z0-9+/.-]+);base64,(.*)$/);
      if (match) {
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
    }

    const { url, headers } = buildRequest('gemini', base, apiPath);
    fetchUrl = url;
    fetchHeaders = headers;
    requestBody = {
      contents: [{ role: 'user', parts }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.2 },
    };

  // ── Anthropic (Claude) ──
  } else if (apiProvider === 'anthropic') {
    let base = baseUrl || 'https://api.anthropic.com';
    if (!base.startsWith('http')) base = 'https://' + base;
    base = base.endsWith('/') ? base.slice(0, -1) : base;

    const content: JsonObject[] = [];
    for (const b64 of imagesBase64 || []) {
      const match = b64.match(/^data:(image\/[a-zA-Z0-9+/.-]+);base64,(.*)$/);
      if (match) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: match[1], data: match[2] },
        });
      }
    }
    content.push({ type: 'text', text: problemText.trim() || '请仔细分析图片中的数学问题。' });

    const extraHeaders: Record<string, string> = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    // When hitting Anthropic directly (no proxy), the browser needs this header
    const proxyMode = readStorage('mathall-proxy-mode') || 'builtin';
    if (proxyMode !== 'builtin') {
      extraHeaders['anthropic-dangerous-direct-browser-access'] = 'true';
    }

    const { url, headers } = buildRequest('anthropic', base, '/v1/messages', extraHeaders);
    fetchUrl = url;
    fetchHeaders = headers;
    requestBody = {
      model: modelName,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
      max_tokens: 8192,
      stream: true,
      temperature: 0.2,
    };

  // ── Cloudflare Workers AI ──
  } else {
    const accountId = baseUrl;
    const messages: JsonObject[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: problemText.trim() || '请仔细分析图片中的数学问题。' },
    ];
    const { url, headers } = buildRequest(
      'cloudflare',
      'https://api.cloudflare.com',
      `/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${modelName}`,
      { Authorization: `Bearer ${apiKey}` }
    );
    fetchUrl = url;
    fetchHeaders = headers;
    requestBody = { messages, stream: true };
  }

  let response: Response;
  try {
    response = await fetch(fetchUrl, {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify(requestBody),
      signal,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'AbortError') throw error;
    if (name === 'TypeError') {
      const proxyMode = readStorage('mathall-proxy-mode') || 'builtin';
      if (proxyMode === 'builtin') {
        throw new Error('网络请求失败。请确认 Vite 开发服务器 (pnpm run dev) 正在运行。如果是生产环境，请在设置中切换到“自定义代理”模式。');
      }
      throw new Error('网络请求失败。请检查代理地址是否正确、网络连接是否正常，以及 API 地址是否有效。');
    }
    throw error;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // 上游错误正文可能很长（HTML 报错页），截断后再抛，避免把 Toast 撑爆
    const detail = text.length > 300 ? text.slice(0, 300) + '…' : text;
    throw new Error(`API 请求失败 (${response.status}): ${detail}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('该浏览器或代理不支持流式响应。');
  }

  const decoder = new TextDecoder();
  let accumulatedTag = '';
  let tagFinished = false;
  // 跨 chunk 的残行缓冲：一次 read() 很可能把 "data: {...}" 从中间切断，
  // 直接按 \n 切分会丢掉这条消息（旧实现被 try/catch 静默吞掉了）。
  let buffer = '';

  /** 处理一条完整的 SSE 文本行，产出对外的 StreamResponse。 */
  function* handleLine(line: string): Generator<StreamResponse> {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) return;          // 空行 / 心跳注释
    if (!trimmed.startsWith('data:')) return;                  // event: / id: 等字段忽略

    const dataStr = trimmed.slice('data:'.length).trim();
    if (!dataStr || dataStr === '[DONE]') return;

    let data: SseMessage;
    try {
      data = JSON.parse(dataStr) as SseMessage;
    } catch {
      return; // 极少数上游会发非 JSON 的心跳
    }

    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    const content = extractContent(apiProvider, data);
    if (!content) return;

    if (tagFinished) {
      yield { contentChunk: content, done: false };
      return;
    }

    accumulatedTag += content;
    const match = accumulatedTag.match(/【(.*?)】/);
    if (match) {
      tagFinished = true;
      const finalTag = match[1];
      const isPureAlgebra =
        (finalTag.includes('代数') || finalTag.includes('计算') || finalTag.includes('方程') ||
         finalTag.includes('答疑') || finalTag.includes('解析')) && !finalTag.includes('几何');

      const tagEndIndex = accumulatedTag.indexOf('】') + 1;
      yield {
        tag: finalTag,
        renderer: isPureAlgebra ? 'HTML_CANVAS' : 'GEOGEBRA',
        contentChunk: accumulatedTag.substring(tagEndIndex),
        done: false,
      };
    } else if (accumulatedTag.length > 50 && !accumulatedTag.includes('【')) {
      tagFinished = true;
      yield { tag: '通用分析', renderer: 'GEOGEBRA', contentChunk: accumulatedTag, done: false };
    } else {
      yield { tag: '解析中...', done: false };
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // 最后一段可能不完整，留到下次拼接

      for (const line of lines) {
        yield* handleLine(line);
      }
    }

    // 冲刷解码器与残行
    buffer += decoder.decode();
    if (buffer.trim()) {
      yield* handleLine(buffer);
    }

    // 整段回复都没等到 【标签】（比如模型只回了一两句话）时，
    // 旧实现会把这些内容全部丢弃，这里补一次输出。
    if (!tagFinished && accumulatedTag) {
      yield { tag: '通用分析', renderer: 'GEOGEBRA', contentChunk: accumulatedTag, done: false };
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* 已经读完或已中止 */
    }
  }

  yield { done: true };
}
