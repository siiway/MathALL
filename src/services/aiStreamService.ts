export interface StreamResponse {
  tag?: string;      // 题目标签
  renderer?: 'GEOGEBRA' | 'HTML_CANVAS'; 
  contentChunk?: string; // 内容碎片
  done: boolean;
}

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
  const proxyMode = localStorage.getItem('mathall-proxy-mode') || 'builtin';
  const corsProxy = localStorage.getItem('mathall-cors-proxy') || '';

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

export async function* fetchAIAnalysisStream(
  problemText: string, 
  imagesBase64: string[]
): AsyncGenerator<StreamResponse, void, unknown> {
  const baseUrl = localStorage.getItem('mathall-api-base-url');
  const apiKey = localStorage.getItem('mathall-api-key');
  const modelName = localStorage.getItem('mathall-model-name') || 'gpt-3.5-turbo';
  const apiProvider = localStorage.getItem('mathall-api-provider') || 'openai';
  const systemPrompt = localStorage.getItem('mathall-system-prompt') || 'You are MathAll, an advanced mathematical AI assistant.\nCRITICAL INSTRUCTION: Your response MUST STRICTLY start with a 4-character tag enclosed in 【】, indicating the math domain. For example: 【几何综合】, 【代数计算】, 【函数极值】. THIS MUST BE THE VERY FIRST THING YOU OUTPUT.\nAfter the tag, provide step-by-step mathematical logic and analysis in Markdown, wrapping formulas in $ for inline and $$ for blocks. Provide GeoGebra commands if geometry is involved.';

  if (!baseUrl || !apiKey) {
    yield { tag: "配置缺失", done: true };
    throw new Error('抱歉，找不到 API 凭据，请于右上角设置中填写您的模型端点。');
  }

  let fetchUrl = '';
  let fetchHeaders: Record<string, string> = {};
  let requestBody: any = {};

  // ── OpenAI / OpenAI-compatible (DeepSeek, Kimi, Qwen, SiliconFlow, etc.) ──
  if (apiProvider === 'openai' || apiProvider === 'ollama') {
    let base = baseUrl.trim();
    if (!base.startsWith('http')) base = 'https://' + base;
    base = base.endsWith('/') ? base.slice(0, -1) : base;

    const basePath = base.endsWith('/chat/completions') ? base.slice(0, -'/chat/completions'.length) : base;
    const parsedBase = new URL(basePath);
    const realBase = parsedBase.origin;
    const pathPrefix = parsedBase.pathname === '/' ? '' : parsedBase.pathname.replace(/\/$/, '');
    const apiPath = `${pathPrefix}/chat/completions`;

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
    ];
    const userContent: any[] = [];
    if (problemText.trim()) {
      userContent.push({ type: 'text', text: problemText });
    } else {
      userContent.push({ type: 'text', text: '请仔细分析图片中的数学问题。' });
    }
    if (imagesBase64 && imagesBase64.length > 0) {
      for (const b64 of imagesBase64) {
        userContent.push({ type: 'image_url', image_url: { url: b64 } });
      }
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
    let base = baseUrl.trim() || 'https://generativelanguage.googleapis.com';
    if (!base.startsWith('http')) base = 'https://' + base;
    base = base.endsWith('/') ? base.slice(0, -1) : base;
    if (base.endsWith('/v1beta')) base = base.slice(0, -7);
    else if (base.endsWith('/v1')) base = base.slice(0, -3);

    const cleanModelName = modelName.replace(/^models\//, '');
    const apiPath = `/v1beta/models/${cleanModelName}:streamGenerateContent?key=${apiKey}&alt=sse`;

    const parts: any[] = [];
    if (problemText.trim()) parts.push({ text: problemText });
    else parts.push({ text: '请仔细分析图片中的数学问题。' });

    if (imagesBase64 && imagesBase64.length > 0) {
      for (const b64 of imagesBase64) {
        const match = b64.match(/^data:(image\/[a-zA-Z0-9+/-]+);base64,(.*)$/);
        if (match) {
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
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
    let base = baseUrl.trim() || 'https://api.anthropic.com';
    if (!base.startsWith('http')) base = 'https://' + base;
    base = base.endsWith('/') ? base.slice(0, -1) : base;

    const content: any[] = [];
    if (imagesBase64 && imagesBase64.length > 0) {
      for (const b64 of imagesBase64) {
        const match = b64.match(/^data:(image\/[a-zA-Z0-9+/-]+);base64,(.*)$/);
        if (match) {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: match[1], data: match[2] },
          });
        }
      }
    }
    content.push({ type: 'text', text: problemText.trim() || '请仔细分析图片中的数学问题。' });

    const extraHeaders: Record<string, string> = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    // When hitting Anthropic directly (no proxy), the browser needs this header
    const proxyMode = localStorage.getItem('mathall-proxy-mode') || 'builtin';
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
      max_tokens: 4096,
      stream: true,
      temperature: 0.2,
    };

  // ── Cloudflare Workers AI ──
  } else if (apiProvider === 'cloudflare') {
    const accountId = baseUrl.trim();
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: problemText.trim() || '请仔细分析图片中的数学问题。' },
    ];
    const { url, headers } = buildRequest(
      'cloudflare',
      'https://api.cloudflare.com',
      `/client/v4/accounts/${accountId}/ai/run/${modelName}`,
      { Authorization: `Bearer ${apiKey}` }
    );
    fetchUrl = url;
    fetchHeaders = headers;
    requestBody = { messages, stream: true };
  }

  try {
    const response = await fetch(fetchUrl, {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
       const text = await response.text();
       throw new Error(`API 请求失败 (${response.status}): ${text}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulatedTag = "";
    let tagFinished = false;

    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.replace(/^data: /, '').trim();
          if (dataStr === '[DONE]') continue;
          
          try {
            const data = JSON.parse(dataStr);
            let content = "";

            if (apiProvider === 'openai' || apiProvider === 'ollama') {
              content = data.choices?.[0]?.delta?.content || "";
            } else if (apiProvider === 'gemini') {
              content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            } else if (apiProvider === 'anthropic') {
              if (data.type === 'content_block_delta') {
                content = data.delta?.text || "";
              }
            } else if (apiProvider === 'cloudflare') {
              content = data.response || "";
            }

            if (!content) continue;

            if (!tagFinished) {
              accumulatedTag += content;
              const match = accumulatedTag.match(/【(.*?)】/);
              if (match) {
                   tagFinished = true;
                   const finalTag = match[1];
                   const isPureAlgebra = (finalTag.includes("代数") || finalTag.includes("计算") || finalTag.includes("方程") || finalTag.includes("答疑") || finalTag.includes("解析")) && !finalTag.includes("几何");

                   const tagEndIndex = accumulatedTag.indexOf('】') + 1;
                   const contentAfterTag = accumulatedTag.substring(tagEndIndex);

                   yield {
                      tag: finalTag,
                      renderer: isPureAlgebra ? 'HTML_CANVAS' : 'GEOGEBRA',
                      contentChunk: contentAfterTag,
                      done: false
                   };
              } else if (accumulatedTag.length > 50 && !accumulatedTag.includes("【")) {
                   tagFinished = true;
                   yield {
                     tag: "通用分析",
                     renderer: 'GEOGEBRA',
                     contentChunk: accumulatedTag,
                     done: false
                   };
              } else {
                   yield { tag: "解析中...", done: false };
              }
            } else {
               yield { contentChunk: content, done: false };
            }
          } catch (e) {
            // 忽略不完整的 JSON chunk 错误
          }
        }
      }
    }
  } catch (error: any) {
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      const proxyMode = localStorage.getItem('mathall-proxy-mode') || 'builtin';
      if (proxyMode === 'builtin') {
        throw new Error('网络请求失败。请确认 Vite 开发服务器 (npm run dev) 正在运行。如果是生产环境，请在设置中切换到"自定义代理"模式。');
      } else {
        throw new Error('网络请求失败。请检查代理地址是否正确、网络连接是否正常，以及 API 地址是否有效。');
      }
    }
    throw error;
  }
  
  yield { done: true };
}
