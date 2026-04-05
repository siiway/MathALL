export interface StreamResponse {
  tag?: string;      // 题目标签
  renderer?: 'GEOGEBRA' | 'HTML_CANVAS'; 
  contentChunk?: string; // 内容碎片
  done: boolean;
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

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
  ];

  const userContent: any[] = [];
  if (problemText.trim()) {
      userContent.push({ type: 'text', text: problemText });
  } else {
      userContent.push({ type: 'text', text: "请仔细分析图片中的数学问题。" });
  }
  
  if (imagesBase64 && imagesBase64.length > 0) {
    for (const b64 of imagesBase64) {
      userContent.push({
        type: "image_url",
        image_url: { url: b64 }
      });
    }
  }
  messages.push({ role: 'user', content: userContent });

  let endpoint = '';
  let requestHeaders: any = {
    'Content-Type': 'application/json'
  };
  let requestBody: any = {};

  // Build the payload & endpoint based on the provider
  if (apiProvider === 'openai' || apiProvider === 'ollama') {
    endpoint = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    endpoint += '/chat/completions';
    requestHeaders['Authorization'] = `Bearer ${apiKey}`;
    requestBody = {
      model: modelName,
      messages,
      stream: true,
      temperature: 0.2
    };
  } else if (apiProvider === 'gemini') {
    let base = baseUrl || 'https://generativelanguage.googleapis.com';
    base = base.endsWith('/') ? base.substring(0, base.length - 1) : base;
    
    // Handle cases where user already appended /v1beta or /v1 to the base URL
    if (base.endsWith('/v1beta')) base = base.substring(0, base.length - 7);
    else if (base.endsWith('/v1')) base = base.substring(0, base.length - 3);

    const cleanModelName = modelName.replace(/^models\//, '');
    endpoint = `${base}/v1beta/models/${cleanModelName}:streamGenerateContent?key=${apiKey}&alt=sse`;
    
    // Convert to Gemini format
    const parts: any[] = [];
    if (problemText.trim()) parts.push({ text: problemText });
    else parts.push({ text: "请仔细分析图片中的数学问题。" });
    
    if (imagesBase64 && imagesBase64.length > 0) {
      for (const b64 of imagesBase64) {
        // imageBase64 format: data:image/png;base64,xxxx
        const match = b64.match(/^data:(image\/[a-zA-Z0-9+/-]+);base64,(.*)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2]
            }
          });
        }
      }
    }
    
    requestBody = {
      contents: [{ role: 'user', parts }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.2 }
    };
  } else if (apiProvider === 'anthropic') {
    let base = baseUrl || 'https://api.anthropic.com';
    base = base.endsWith('/') ? base.substring(0, base.length - 1) : base;
    endpoint = `${base}/v1/messages`;
    requestHeaders['x-api-key'] = apiKey;
    requestHeaders['anthropic-version'] = '2023-06-01';
    requestHeaders['anthropic-dangerously-allow-browser'] = 'true';
    
    const content: any[] = [];
    if (imagesBase64 && imagesBase64.length > 0) {
      for (const b64 of imagesBase64) {
        const match = b64.match(/^data:(image\/[a-zA-Z0-9+/-]+);base64,(.*)$/);
        if (match) {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: match[1], data: match[2] }
          });
        }
      }
    }
    content.push({ type: 'text', text: problemText.trim() || "请仔细分析图片中的数学问题。" });

    requestBody = {
      model: modelName,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
      max_tokens: 4096,
      stream: true,
      temperature: 0.2
    };
  } else if (apiProvider === 'cloudflare') {
    // For Cloudflare, baseUrl is essentially the Account ID
    const accountId = baseUrl.trim();
    endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelName}`;
    requestHeaders['Authorization'] = `Bearer ${apiKey}`;
    requestBody = {
      messages, // Cloudflare AI uses OpenAI-like messages array
      stream: true
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(requestBody)
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
                 const finalTag = match[1].substring(0,4);
                 const isPureAlgebra = finalTag.includes("代数") || finalTag.includes("计算") || finalTag.includes("方程") || finalTag.includes("答疑") || finalTag.includes("解析");
                 yield {
                    tag: finalTag,
                    renderer: isPureAlgebra ? 'HTML_CANVAS' : 'GEOGEBRA',
                    contentChunk: accumulatedTag.split("】").slice(1).join("】") || "",
                    done: false
                 };
            } else if (accumulatedTag.length > 20 && !accumulatedTag.includes("【")) {
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
             // 标签完成，进入纯文本流式输出
             yield { contentChunk: content, done: false };
          }
        } catch (e) {
          // 忽略不完整的 JSON chunk 错误
        }
      }
    }
  }
  
  yield { done: true };
}
