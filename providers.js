'use strict';

// 两种协议就覆盖了几乎所有服务商：
//   'anthropic' -> POST {baseUrl}/v1/messages
//   'openai'    -> POST {baseUrl}/chat/completions   (DeepSeek / Kimi / 通义 / 智谱 / 豆包 / Ollama 都是这个)
const PRESETS = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
    keyHint: 'console.anthropic.com 申请，sk-ant- 开头',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek 深度求索',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    // deepseek-chat / deepseek-reasoner 于 2026-07-24 下线，别再用了
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    keyHint: 'platform.deepseek.com',
    // v4 系列默认开思考，token 会被思维链吃光导致正文为空
    noThink: { thinking: { type: 'disabled' } },
  },
  {
    id: 'moonshot',
    label: 'Kimi 月之暗面',
    protocol: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k'],
    keyHint: 'platform.moonshot.cn',
  },
  {
    id: 'qwen',
    label: '通义千问 (DashScope)',
    protocol: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
    keyHint: 'bailian.console.aliyun.com',
    noThink: { enable_thinking: false },
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    protocol: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4-flash'],
    keyHint: 'bigmodel.cn',
  },
  {
    id: 'ark',
    label: '豆包 / 火山方舟',
    protocol: 'openai',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [],
    keyHint: '模型名填豆包模型 ID，或 ep- 开头的接入点 ID，两种都认',
    noThink: { thinking: { type: 'disabled' } },
  },
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini'],
    keyHint: 'platform.openai.com',
  },
  {
    id: 'ollama',
    label: 'Ollama 本地（免 key）',
    protocol: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen2.5:7b', 'llama3.1:8b'],
    keyHint: '本地跑，不需要 key',
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    protocol: 'openai',
    baseUrl: '',
    models: [],
    keyHint: '任何 OpenAI 兼容网关都能填这里',
  },
];

const OUTPUT_LABELS = {
  zh: {
    language: 'Chinese', revised: '修改后', issues: '问题', natural: '更地道的说法', noIssues: '没有语法错误',
    translated: '英文翻译', notes: '翻译说明', noNotes: '直译即可，没有需要特别说明的地方',
  },
  en: {
    language: 'English', revised: 'Revised version', issues: 'Issues', natural: 'More natural alternatives', noIssues: 'No grammatical errors.',
    translated: 'English translation', notes: 'Translation notes', noNotes: 'A literal rendering works; nothing needed special handling.',
  },
  vi: {
    language: 'Vietnamese', revised: 'Bản đã sửa', issues: 'Vấn đề', natural: 'Cách diễn đạt tự nhiên hơn', noIssues: 'Không có lỗi ngữ pháp.',
    translated: 'Bản dịch tiếng Anh', notes: 'Ghi chú dịch thuật', noNotes: 'Dịch sát nghĩa là đủ, không có điểm nào cần lưu ý.',
  },
  id: {
    language: 'Indonesian', revised: 'Versi yang diperbaiki', issues: 'Masalah', natural: 'Alternatif yang lebih natural', noIssues: 'Tidak ada kesalahan tata bahasa.',
    translated: 'Terjemahan bahasa Inggris', notes: 'Catatan terjemahan', noNotes: 'Terjemahan harfiah sudah cukup, tidak ada yang perlu diperhatikan.',
  },
  th: {
    language: 'Thai', revised: 'ฉบับแก้ไขแล้ว', issues: 'ปัญหา', natural: 'ตัวเลือกที่เป็นธรรมชาติมากขึ้น', noIssues: 'ไม่มีข้อผิดพลาดทางไวยากรณ์',
    translated: 'คำแปลภาษาอังกฤษ', notes: 'หมายเหตุการแปล', noNotes: 'แปลตรงตัวได้เลย ไม่มีจุดที่ต้องอธิบายเพิ่ม',
  },
  ms: {
    language: 'Malay', revised: 'Versi yang diperbaiki', issues: 'Masalah', natural: 'Cadangan yang lebih semula jadi', noIssues: 'Tiada kesalahan tatabahasa.',
    translated: 'Terjemahan bahasa Inggeris', notes: 'Nota terjemahan', noNotes: 'Terjemahan harfiah memadai, tiada perkara yang perlu diberi perhatian.',
  },
};

const TONE_HINTS = {
  zh: { formal: '用户希望偏正式、书面、专业的表达。', casual: '用户希望偏口语、自然、日常对话的表达。', concise: '用户希望更简洁，能删的词都删掉。' },
  en: { formal: 'The user wants a formal, professional, and written style.', casual: 'The user wants a casual, natural, everyday conversational style.', concise: 'The user wants a concise style with unnecessary words removed.' },
  vi: { formal: 'Người dùng muốn cách diễn đạt trang trọng, chuyên nghiệp và mang tính văn viết.', casual: 'Người dùng muốn cách diễn đạt thân mật, tự nhiên và gần gũi.', concise: 'Người dùng muốn cách diễn đạt ngắn gọn, lược bỏ các từ không cần thiết.' },
  id: { formal: 'Pengguna menginginkan gaya yang formal, profesional, dan tertulis.', casual: 'Pengguna menginginkan gaya yang santai, alami, dan sehari-hari.', concise: 'Pengguna menginginkan gaya yang ringkas dengan kata-kata yang tidak perlu dihapus.' },
  th: { formal: 'ผู้ใช้ต้องการสำนวนที่เป็นทางการ เป็นมืออาชีพ และเหมาะกับงานเขียน', casual: 'ผู้ใช้ต้องการสำนวนที่เป็นกันเอง เป็นธรรมชาติ และใช้ในชีวิตประจำวัน', concise: 'ผู้ใช้ต้องการสำนวนที่กระชับและตัดคำที่ไม่จำเป็นออก' },
  ms: { formal: 'Pengguna mahukan gaya yang formal, profesional dan sesuai untuk penulisan.', casual: 'Pengguna mahukan gaya yang santai, semula jadi dan sesuai untuk perbualan harian.', concise: 'Pengguna mahukan gaya yang ringkas dengan perkataan yang tidak perlu dibuang.' },
};

// 浮窗用：一次给出四种语气，每种下面挂一段「为什么这么改」
const PILL_LABELS = {
  zh: { default: '默认', professional: '专业', casual: '轻松', concise: '简洁', why: '为什么' },
  en: { default: 'Default', professional: 'Professional', casual: 'Casual', concise: 'Concise', why: 'Why' },
  vi: { default: 'Mặc định', professional: 'Chuyên nghiệp', casual: 'Thoải mái', concise: 'Ngắn gọn', why: 'Tại sao' },
  id: { default: 'Default', professional: 'Profesional', casual: 'Santai', concise: 'Ringkas', why: 'Alasan' },
  th: { default: 'ค่าเริ่มต้น', professional: 'มืออาชีพ', casual: 'สบาย ๆ', concise: 'กระชับ', why: 'เหตุผล' },
  ms: { default: 'Lalai', professional: 'Profesional', casual: 'Santai', concise: 'Ringkas', why: 'Sebab' },
};

function buildPillPrompt(language = 'zh') {
  const L = PILL_LABELS[language] || PILL_LABELS.zh;
  const langName = (OUTPUT_LABELS[language] || OUTPUT_LABELS.zh).language;
  return `You are a language assistant. The user will paste text in any language.

STEP 1 — Decide silently which mode applies, and never state which one you picked:
- If the text is NOT in English → translate it into English.
- If the text IS in English → correct and improve it, keeping it in English.

STEP 2 — Give FOUR English versions of the result, in four different registers. Every version must carry the same meaning; only the register changes. Never add or drop information.

THE MOST IMPORTANT RULE — keep the sentence and the explanation strictly apart:
- The text under a "###" heading is COPY-READY OUTPUT. It goes straight into the user's clipboard and then into their email or chat. It must contain the finished sentence and NOTHING else: no explanation, no bullet list, no arrows, no ~~strikethrough~~, no quotation marks, no labels, no "Version 1:", no notes in parentheses.
- EVERY word of explanation, comparison, or justification belongs under the "####" heading that follows it. Never put a reason next to the sentence, not even on a new line, not even as a single bullet.
- If you are unsure where something goes, it goes under "####".

Output exactly this structure and nothing else — no preamble, no conclusion:

### ${L.default}
(ONLY the sentence. The version that stays closest to the original's own tone and level of politeness. If the original is blunt, stay blunt; if warm, stay warm.)
#### ${L.why}
(1-3 bullets. Format: - ~~original wording~~ → **new wording** — one short reason in ${langName}. For a translation, quote the source wording on the left.)

### ${L.professional}
(ONLY the sentence. Formal, professional, suitable for an email to a client or a senior colleague.)
#### ${L.why}
(1-3 bullets, same format, explaining what makes this version more formal.)

### ${L.casual}
(ONLY the sentence. Relaxed and conversational, the way you would message a teammate.)
#### ${L.why}
(1-3 bullets, same format, explaining what makes this version more casual.)

### ${L.concise}
(ONLY the sentence. As short as possible while keeping the full meaning. Cut every word that earns nothing.)
#### ${L.why}
(1-3 bullets, same format, naming what was cut and why it was safe to cut.)

Rules:
- All four versions are in English.
- Each "###" section is one clean sentence the user could paste as-is.
- Each "###" section is always followed by its own "####" section. Never skip it.
- All explanations are written in ${langName}.`;
}

function buildSystemPrompt(language = 'zh', tone = 'default') {
  const labels = OUTPUT_LABELS[language] || OUTPUT_LABELS.zh;
  const toneHint = TONE_HINTS[language]?.[tone] || '';
  return `You are a language assistant. The user will paste text in any language.

STEP 1 — Decide which of the two modes applies, based on the language of the user's text:
- If the text is NOT in English (Chinese, Vietnamese, Thai, Japanese, or any other language) → MODE TRANSLATE.
- If the text IS in English → MODE PROOFREAD.
Mixed text counts as non-English if the majority of it is not English. Decide silently; never state which mode you picked.

All explanations, notes and section headings must be written in ${labels.language}.

=== MODE TRANSLATE ===
Translate the text into natural, idiomatic English. Preserve the original style and register: formal stays formal, casual stays casual, blunt stays blunt, humour stays humour. Match the original's level of politeness and its intended audience. Do not add meaning, do not drop meaning, and do not make it more elaborate or more polite than the original. Output exactly:

### ${labels.translated}
(Only the complete English translation. Nothing else.)

### ${labels.notes}
(Places where a literal translation would not work: idioms, culture-specific terms, tone that is hard to carry over, or genuine ambiguity in the original. Format: - **English wording chosen** — one short explanation in ${labels.language}. If nothing needs explaining, write exactly: - ${labels.noNotes})

### ${labels.natural}
(2-3 alternative English renderings in different registers. Format: - alternative rendering — (briefly note the register or situation in ${labels.language}).)

=== MODE PROOFREAD ===
Check whether the English is grammatically correct, natural, and appropriate. The corrected text and the rewrites stay in English. Output exactly:

### ${labels.revised}
(Only the complete corrected sentence. If the original is already correct, repeat it unchanged.)

### ${labels.issues}
(Grammar, word choice, or collocation issues one by one. Format: - ~~original phrase~~ → **correction** — one short explanation in ${labels.language}. If there are no issues, write exactly: - ${labels.noIssues})

### ${labels.natural}
(2-3 rewrites in different styles. Format: - rewritten sentence — (briefly explain the tone or situation in ${labels.language}).)

In both modes: output only the three sections above. No introduction, no conclusion.
${toneHint ? `\n${toneHint}` : ''}`;
}

/**
 * 流式调用模型。onDelta 每收到一段文本调一次。
 * 返回 Promise，正常结束 resolve，出错 reject(Error)。
 */
async function streamCheck({ config, text, tone, variant, onDelta, signal }) {
  const preset = PRESETS.find((p) => p.id === config.providerId) || PRESETS[0];
  const protocol = preset.protocol;
  const baseUrl = (config.baseUrl || preset.baseUrl || '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('没有填 API 地址（Base URL）');
  const model = (config.model || '').trim();
  if (!model) throw new Error('没有填模型名');
  const apiKey = (config.apiKey || '').trim();
  if (!apiKey && preset.id !== 'ollama') throw new Error('没有填 API Key');

  const language = OUTPUT_LABELS[config.language] ? config.language : 'zh';
  // 浮窗要的是四种语气并列，主面板还是单结果 + 三节说明
  const system = variant === 'pill' ? buildPillPrompt(language) : buildSystemPrompt(language, tone);
  let url, headers, body;

  if (protocol === 'anthropic') {
    url = `${baseUrl}/v1/messages`;
    headers = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    body = {
      model,
      max_tokens: variant === 'pill' ? 2200 : 1500,
      stream: true,
      system,
      messages: [{ role: 'user', content: text }],
    };
  } else {
    url = `${baseUrl}/chat/completions`;
    headers = { 'content-type': 'application/json' };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    body = {
      model,
      stream: true,
      max_tokens: variant === 'pill' ? 2200 : 1500,
      // 关掉思考模式：这个场景要的是短、快、确定的输出，思维链只会把
      // token 预算吃光导致正文为空。只对文档里确认支持的服务商下发，
      // 免得给不认识这个参数的家发过去直接 400。
      ...(preset.noThink || {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${detail ? ' — ' + detail.slice(0, 300) : ''}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // 有些模型（比如带思考模式的）把思维链放在 reasoning_content，正文放在 content。
  // 如果 token 预算被思考吃光，流会正常结束但一个正文字都没有 —— 那不是成功，
  // 得说清楚，别让界面显示「好了」却一片空白。
  let gotContent = false;
  let sawReasoning = false;
  let finishReason = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 以空行分隔事件
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        if (protocol !== 'anthropic') {
          const ch = json.choices?.[0];
          if (ch?.finish_reason) finishReason = ch.finish_reason;
          if (ch?.delta?.reasoning_content) sawReasoning = true;
        }
        const piece =
          protocol === 'anthropic'
            ? json.type === 'content_block_delta' && json.delta?.type === 'text_delta'
              ? json.delta.text
              : ''
            : json.choices?.[0]?.delta?.content || '';
        if (piece) {
          gotContent = true;
          onDelta(piece);
        }
      }
    }
  }

  if (!gotContent) {
    const why = [];
    if (sawReasoning) why.push('模型把 token 全用在思考过程上了（reasoning_content），正文是空的');
    if (finishReason === 'length') why.push('输出被 max_tokens 截断');
    if (!why.length) why.push('模型返回了空内容');
    throw new Error(
      why.join('；') +
      (sawReasoning ? '。换成不带思考模式的模型（例如 doubao / qwen-plus / gpt-4o-mini）通常能解决。' : ''),
    );
  }
}

module.exports = { PRESETS, streamCheck, PILL_LABELS };
