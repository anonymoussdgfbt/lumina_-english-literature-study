import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const getAI = () => {
  // In Vite, process.env.GEMINI_API_KEY is replaced by the value defined in vite.config.ts
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing. Please ensure it is set in the environment.");
    throw new Error("GEMINI_API_KEY_MISSING");
  }
  return new GoogleGenAI({ apiKey });
};

const withRetry = async <T>(fn: () => Promise<T>, retries = 3): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    console.error("Gemini API Error details:", error);
    
    // Check for specific error types
    const errorStr = JSON.stringify(error);
    if (errorStr.includes('xhr error') || errorStr.includes('Rpc failed') || errorStr.includes('UNKNOWN')) {
      if (retries > 0) {
        const delay = (4 - retries) * 1500;
        console.log(`Network/RPC error detected. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return withRetry(fn, retries - 1);
      }
      throw new Error("网络连接异常 (RPC/XHR Error)。这通常是由于平台接口波动或浏览器环境限制导致的。建议：1. 刷新页面重试；2. 检查是否开启了全局代理/VPN；3. 尝试在 Chrome 无痕模式下运行。");
    }

    if (retries > 0) {
      const delay = (4 - retries) * 2000;
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1);
    }
    throw error;
  }
};

export interface AnalysisResult {
  nativeIntuition: string;
  universalFormulas: {
    formula: string;
    originalSentence: string;
    reverseTranslation: {
      chinese: string;
      instructions: string;
    };
    imitation: {
      formulaUsed: string;
      exampleSentence: string;
      scenario: string;
    };
  }[];
  sceneTags: string[];
  semanticChunks: {
    chunk: string;
    upgrading: {
      mediocre: string;
      upgraded: string;
      explanation: string;
    };
  }[];
}

export const analyzeText = async (
  book: string,
  author: string,
  text: string
): Promise<AnalysisResult> => {
  return withRetry(async () => {
    const ai = getAI();
    const prompt = `Input Text: ${text}
Book: ${book}
Author: ${author}

Task: 请按照以下结构拆解这段文字，并以 JSON 格式返回。不要包含任何 Markdown 代码块标记，只返回纯 JSON 字符串。

{
  "nativeIntuition": "深度剖析作者选词、时态及隐藏的语感（如文学张力、社会心理暗示等）。",
  "semanticChunks": [
    {
      "chunk": "高级短语积木",
      "upgrading": { 
        "mediocre": "日常平庸的表达", 
        "upgraded": "用地道短语升舱后的表达", 
        "explanation": "升舱理由" 
      }
    }
  ],
  "universalFormulas": [
    {
      "formula": "抽象句式",
      "originalSentence": "原文句子",
      "reverseTranslation": { "chinese": "精彩部分的中文翻译", "instructions": "译回说明" },
      "imitation": { "formulaUsed": "句式名称", "exampleSentence": "仿写范例", "scenario": "仿写场景" }
    }
  ],
  "sceneTags": ["场景标签1", "场景标签2"]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: `你是 Gemini，一位拥有母语级语感且表达犀利的 AI 协作专家。你的目标是帮助用户精读英文文学作品，提升其英文表达至母语水平。`,
        temperature: 0.7,
      }
    });

    if (!response.text) {
      throw new Error("No response text from Gemini");
    }

    try {
      return JSON.parse(response.text);
    } catch (e) {
      console.error("Failed to parse JSON response:", response.text);
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error("Invalid JSON response format");
    }
  });
};

export const analyzeImitation = async (
  formula: string,
  scenario: string,
  userInput: string
): Promise<string> => {
  return withRetry(async () => {
    const ai = getAI();
    const prompt = `Role: 你是 Gemini，一位极其严苛且专业的英文写作导师。
Context: 用户正在练习仿写。
句式 (Formula): ${formula}
场景 (Scenario): ${scenario}
用户输入 (User Input): ${userInput}

Task: 请分析用户的仿写。
1. 语法是否正确？
2. 是否准确运用了该句式？
3. 语感是否地道？
4. 给出改进建议或一个更完美的版本。
请用中文回答，保持专业且犀利的风格。`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || "分析失败，请重试。";
  });
};

export const extractTextFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
  return withRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { inlineData: { data: base64Image, mimeType } },
            { text: "Please extract all the text from this image accurately. Return only the extracted text without any commentary." }
          ]
        }
      ],
    });

    return response.text || "";
  });
};

export const getVocabularyExplanation = async (word: string, context: string): Promise<string> => {
  return withRetry(async () => {
    const ai = getAI();
    const prompt = `Explain the word "${word}" in the context of: "${context}". 
    Provide definition, etymology (briefly), and 2 example sentences that capture the same "vibe". 
    Return in Markdown format.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || "";
  });
};

export const chatWithAI = async (history: any[], message: string): Promise<string> => {
  return withRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...history,
        { role: "user", parts: [{ text: message }] }
      ],
      config: {
        systemInstruction: "You are a helpful literary assistant. You help the user understand the style, context, and grammar of English literature passages. Keep your answers concise and insightful.",
      }
    });

    return response.text || "";
  });
};
