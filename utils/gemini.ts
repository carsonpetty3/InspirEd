import { GoogleGenAI } from "@google/genai";
import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { getRAGContext, getRAGContextWithCitations, loadKnowledgeBase, Citation, getRagApiBaseUrl } from "./rag";

export type { Citation } from "./rag";

const getApiKey = (): string => {
  const apiKey = 
    process.env.GEMINI_API_KEY || 
    Constants.expoConfig?.extra?.GEMINI_API_KEY ||
    Constants.manifest2?.extra?.expoClient?.extra?.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please add it to your secrets.");
  }
  return apiKey;
};

const GEMINI_MODEL = "gemini-3.6-flash";

let ai: GoogleGenAI | null = null;

const getAI = (): GoogleGenAI => {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: getApiKey() });
  }
  return ai;
};

function isRetryableGeminiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes("503") ||
    lower.includes("unavailable") ||
    lower.includes("high demand") ||
    lower.includes("overloaded")
  );
}

async function generateGeminiContent(contents: unknown) {
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await getAI().models.generateContent({
        model: GEMINI_MODEL,
        contents,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error) || attempt === maxAttempts) {
        throw error;
      }
      const delay = 1500 * attempt;
      console.log(
        `[Gemini] Service busy, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export interface TranscriptionResult {
  transcription: string;
  summary: string;
}

export async function transcribeAndSummarizeAudio(
  audioUri: string,
  mimeType: string = "audio/webm",
  readingLevel?: number
): Promise<TranscriptionResult> {
  try {
    if (Platform.OS === "web") {
      throw new Error(
        "Audio transcription is not available on web. Please use the Expo Go app on your phone to record and transcribe visits."
      );
    }

    const audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const transcriptionContents = [
      {
        inlineData: {
          data: audioBase64,
          mimeType: mimeType,
        },
      },
      `Transcribe this audio file from a medical visit. Provide a complete, accurate transcription of everything that was said. 
Do not add any commentary or additional text - just the transcription.`,
    ];

    const transcriptionResponse = await generateGeminiContent(transcriptionContents);

    const transcription = transcriptionResponse.text || "";

    if (!transcription) {
      throw new Error("No transcription generated");
    }

    const readingLevelGuidance = readingLevel
      ? `Adapt the summary to a ${readingLevel}th grade reading level using clear, simple language appropriate for that level.`
      : "Use clear, accessible language appropriate for general audiences.";

    const summaryContents = [
      `This is a transcription from a medical visit for a child with a chronic pulmonary condition. Analyze this transcription and provide a concise, helpful summary that includes:

- Main topics discussed during the visit
- Key medical findings or observations
- Diagnosis or condition updates (if mentioned)
- Medications prescribed or changed (if any)
- Action items for the parent/caregiver
- Follow-up instructions or next steps
- Important questions to ask at the next visit (if applicable)

${readingLevelGuidance}

Format the summary in a clear, readable way with proper paragraphs and bullet points where appropriate. Remember this is for a parent managing their child's care, so be empathetic and clear.

TRANSCRIPTION:
${transcription}`,
    ];

    const summaryResponse = await generateGeminiContent(summaryContents);

    const summary = summaryResponse.text || "";

    return {
      transcription,
      summary,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const friendlyError = parseGeminiError(errorMessage);
    console.error(friendlyError);
    throw new Error(friendlyError);
  }
}

function parseGeminiError(errorMessage: string): string {
  const errorLower = errorMessage.toLowerCase();
  
  // Quota exceeded (429 error)
  if (errorLower.includes("429") || errorLower.includes("quota") || errorLower.includes("resource_exhausted")) {
    return "Daily limit reached. The free AI service has a limited number of requests per day. Please try again tomorrow, or contact support about upgrading to a higher limit.";
  }
  
  // Service overloaded (503 error)
  if (errorLower.includes("503") || errorLower.includes("overloaded") || errorLower.includes("unavailable")) {
    return "The AI service is temporarily busy. Please wait a moment and try again.";
  }
  
  // Network errors
  if (errorLower.includes("network") || errorLower.includes("fetch") || errorLower.includes("timeout")) {
    return "Connection problem. Please check your internet connection and try again.";
  }
  
  // API key issues
  if (errorLower.includes("api_key") || errorLower.includes("unauthorized") || errorLower.includes("401")) {
    return "There's a problem with the AI service configuration. Please contact support.";
  }
  
  // Audio processing issues
  if (errorLower.includes("audio") || errorLower.includes("format") || errorLower.includes("decode")) {
    return "Could not process the recording. The audio format may not be supported. Please try recording again.";
  }
  
  // Generic fallback - don't expose raw API details
  return "Could not process the recording. Please try again in a few moments.";
}

export type VisitExtraction = {
  keyPoints: string[];
  diagnoses: string[];
  actions: string[];
  medicalTerms: { term: string; explanation: string }[];
};

export async function extractVisitDetails(
  transcription: string,
  readingLevel: number = 8
): Promise<VisitExtraction> {
  try {
    const prompt = `Analyze this medical visit transcription and extract structured information. Return ONLY valid JSON with no additional text.

TRANSCRIPTION:
${transcription}

Extract the following and return as JSON:
{
  "keyPoints": ["array of 3-5 key points from the visit"],
  "diagnoses": ["array of any diagnoses or conditions mentioned"],
  "actions": ["array of action items for the parent/caregiver"],
  "medicalTerms": [{"term": "medical term", "explanation": "simple explanation at ${readingLevel}th grade level"}]
}

Guidelines:
- keyPoints: Most important takeaways a parent should remember
- diagnoses: Any medical conditions, diagnoses, or health status updates mentioned
- actions: Things the parent needs to do (medications, follow-ups, monitoring, etc.)
- medicalTerms: Any medical jargon with simple explanations appropriate for a ${readingLevel}th grade reading level

If a category has no relevant information, return an empty array for that field.`;

    const response = await generateGeminiContent(prompt);

    const text = response.text || "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        keyPoints: parsed.keyPoints || [],
        diagnoses: parsed.diagnoses || [],
        actions: parsed.actions || [],
        medicalTerms: parsed.medicalTerms || [],
      };
    }
    
    return { keyPoints: [], diagnoses: [], actions: [], medicalTerms: [] };
  } catch (error) {
    console.error("Failed to extract visit details:", error);
    return { keyPoints: [], diagnoses: [], actions: [], medicalTerms: [] };
  }
}

export async function suggestPlannerQuestions(
  visits: { summary?: string | null; diagnoses?: string[]; actions?: string[] }[]
): Promise<string[]> {
  try {
    const recentVisits = visits.slice(0, 3);
    const visitContext = recentVisits
      .map((v, i) => {
        const parts = [`Visit ${i + 1}:`];
        if (v.summary) parts.push(`Summary: ${v.summary}`);
        if (v.diagnoses?.length) parts.push(`Diagnoses: ${v.diagnoses.join(", ")}`);
        if (v.actions?.length) parts.push(`Actions: ${v.actions.join(", ")}`);
        return parts.join("\n");
      })
      .join("\n\n");

    const prompt = `Based on these recent medical visits for a child with a chronic pulmonary condition, suggest 4-6 thoughtful questions the parent should ask at their next doctor visit.

${visitContext || "No previous visit data available."}

Return ONLY a JSON array of question strings, no other text. Example format:
["Question 1?", "Question 2?"]

Focus on:
- Following up on previous findings or concerns
- Understanding treatment progress
- Clarifying care instructions
- Planning for the future`;

    const response = await generateGeminiContent(prompt);

    const text = response.text || "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return [
      "How is my child's lung function progressing?",
      "Are there any new treatment options we should consider?",
      "What symptoms should I watch for?",
      "How can we improve daily care routines?",
    ];
  } catch (error) {
    console.error("Failed to suggest planner questions:", error);
    return [
      "How is my child's lung function progressing?",
      "Are there any new treatment options we should consider?",
      "What symptoms should I watch for?",
      "How can we improve daily care routines?",
    ];
  }
}

export async function askQuestionWithGemini(
  question: string,
  visitContext: {
    summary?: string | null;
    transcription?: string | null;
    keyPoints?: string[];
    diagnoses?: string[];
    actions?: string[];
    medicalTerms?: { term: string; explanation: string }[];
  },
  readingLevel: number = 8
): Promise<string> {
  try {
    const contextParts: string[] = [];
    
    if (visitContext.summary) {
      contextParts.push(`VISIT SUMMARY:\n${visitContext.summary}`);
    }
    
    if (visitContext.transcription) {
      contextParts.push(`FULL TRANSCRIPTION:\n${visitContext.transcription}`);
    }
    
    if (visitContext.keyPoints && visitContext.keyPoints.length > 0) {
      contextParts.push(`KEY POINTS:\n${visitContext.keyPoints.map(p => `- ${p}`).join('\n')}`);
    }
    
    if (visitContext.diagnoses && visitContext.diagnoses.length > 0) {
      contextParts.push(`DIAGNOSES:\n${visitContext.diagnoses.map(d => `- ${d}`).join('\n')}`);
    }
    
    if (visitContext.actions && visitContext.actions.length > 0) {
      contextParts.push(`ACTION ITEMS:\n${visitContext.actions.map(a => `- ${a}`).join('\n')}`);
    }
    
    if (visitContext.medicalTerms && visitContext.medicalTerms.length > 0) {
      contextParts.push(`MEDICAL TERMS EXPLAINED:\n${visitContext.medicalTerms.map(t => `- ${t.term}: ${t.explanation}`).join('\n')}`);
    }

    const context = contextParts.join('\n\n');
    
    if (!context.trim()) {
      return "I don't have enough information about this visit to answer your question. Please make sure the visit has been transcribed and summarized first.";
    }

    const prompt = `You are a helpful medical information assistant for parents of children with chronic pulmonary conditions. A parent has asked a question about a recent doctor visit.

IMPORTANT GUIDELINES:
1. Answer based ONLY on the visit information provided below
2. Use clear, simple language appropriate for a ${readingLevel}th grade reading level
3. Be empathetic and supportive - these parents are managing a child's chronic condition
4. If the answer isn't in the visit notes, say so honestly and suggest they ask their doctor
5. Never give specific medical advice - always encourage discussing important decisions with their healthcare provider
6. Explain any medical terms in simple language
7. Keep your response concise but complete

VISIT INFORMATION:
${context}

PARENT'S QUESTION:
${question}

Please provide a helpful, accurate response:`;

    const response = await generateGeminiContent([prompt]);

    const answer = response.text || "";
    
    if (!answer) {
      return "I'm sorry, I couldn't generate a response. Please try asking your question again.";
    }

    return answer;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Gemini Q&A error:", errorMessage);
    return "I'm having trouble answering your question right now. Please try again in a moment.";
  }
}

export interface LessonSection {
  title: string;
  content: string;
  keyTakeaway?: string;
}

export interface GeneratedLesson {
  introduction: string;
  sections: LessonSection[];
  summary: string;
  practicalTips: string[];
}

async function callGeminiWithRetry(prompt: string): Promise<string> {
  const response = await generateGeminiContent([prompt]);
  return response.text || "";
}

export async function generateModuleLesson(
  moduleTitle: string,
  moduleDescription: string,
  topics: string[],
  difficulty: string,
  readingLevel: number = 8
): Promise<GeneratedLesson> {
  try {
    await loadKnowledgeBase();
    const topicQuery = `${moduleTitle} ${topics.join(" ")} pulmonary children`;
    const ragContext = await getRAGContext(topicQuery, 3);
    
    const sourceContext = ragContext 
      ? `\n\nUse the following trusted medical sources to inform your content. Base your educational material on this verified information:\n\n${ragContext}\n\n`
      : '';

    const prompt = `You are creating educational content for parents of children with chronic pulmonary conditions. Generate a comprehensive lesson for the following learning module:

MODULE: ${moduleTitle}
DESCRIPTION: ${moduleDescription}
TOPICS TO COVER: ${topics.join(", ")}
DIFFICULTY LEVEL: ${difficulty}
${sourceContext}
IMPORTANT GUIDELINES:
1. Use clear, simple language appropriate for a ${readingLevel}th grade reading level
2. Be empathetic - these parents are managing their child's chronic condition
3. Focus on practical, actionable information parents can use
4. Explain medical terms in simple, everyday language
5. NEVER provide specific medical advice - always encourage consulting with their healthcare provider
6. Make the content encouraging and supportive
7. Include real-world examples parents can relate to
8. Ground your content in the trusted medical sources provided above when available

Generate the lesson in the following JSON format (respond with ONLY valid JSON, no markdown):
{
  "introduction": "A welcoming 2-3 sentence introduction to the topic",
  "sections": [
    {
      "title": "Section title",
      "content": "2-4 paragraphs of educational content for this section",
      "keyTakeaway": "One sentence summarizing the key point"
    }
  ],
  "summary": "A brief summary of what was covered",
  "practicalTips": ["Tip 1", "Tip 2", "Tip 3"]
}

Create 3-4 sections covering the main topics. Each section should be informative but concise.`;

    const text = await callGeminiWithRetry(prompt);
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }
    
    const lesson = JSON.parse(jsonMatch[0]) as GeneratedLesson;
    return lesson;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Gemini lesson generation error:", errorMessage);
    
    // Return a fallback lesson structure
    return {
      introduction: "We're having trouble loading this lesson right now. Please try again in a moment, or use the AI Assistant below to ask questions about this topic.",
      sections: [
        {
          title: "Content Unavailable",
          content: "The lesson content couldn't be generated at this time. You can still learn about this topic by asking the AI Learning Assistant questions.",
          keyTakeaway: "Try refreshing or ask the AI Assistant for help with this topic.",
        },
      ],
      summary: "Please try again later or use the AI Assistant for help.",
      practicalTips: ["Ask the AI Assistant about specific topics you'd like to learn about"],
    };
  }
}

export interface EducationalResponse {
  answer: string;
  citations: Citation[];
}

export async function askEducationalQuestion(
  question: string,
  conversationHistory: { text: string; isUser: boolean }[] = [],
  readingLevel: number = 8
): Promise<EducationalResponse> {
  try {
    const ragBase = getRagApiBaseUrl();
    if (ragBase) {
      const apiKey = getApiKey();
      const res = await fetch(`${ragBase}/api/rag/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-api-key": apiKey,
        },
        body: JSON.stringify({
          question,
          readingLevel,
          conversationHistory,
          geminiApiKey: apiKey,
          topK: 5,
          clinicalReviewedOnly: false,
        }),
      });
      const data = (await res.json()) as {
        answer?: string;
        citations?: Citation[];
        error?: string;
      };
      if (!res.ok) {
        console.warn("[RAG chat]", data.error || res.status);
      } else if (data.answer) {
        return {
          answer: data.answer,
          citations: data.citations ?? [],
        };
      }
      // Fall through to local RAG + Gemini if chat endpoint fails or returns empty
    }

    // Load knowledge base and get relevant context with citations
    await loadKnowledgeBase();
    const { context: ragContext, citations } = await getRAGContextWithCitations(question, 3);
    
    const sourceContext = ragContext 
      ? `\n${ragContext}\n\nIMPORTANT: When using information from these sources, include inline citation markers like [1], [2], or [3] to indicate which source you're referencing. This helps parents verify the information.\n`
      : '';

    const historyContext = conversationHistory.length > 0
      ? `PREVIOUS CONVERSATION:\n${conversationHistory.map(msg => 
          `${msg.isUser ? 'Parent' : 'Assistant'}: ${msg.text}`
        ).join('\n')}\n\n`
      : '';

    const prompt = `You are a caring and knowledgeable medical education assistant for parents of children with chronic pulmonary conditions. Your role is to help parents better understand medical concepts, treatments, and terminology related to their child's care.
${sourceContext}
IMPORTANT GUIDELINES:
1. Use clear, simple language appropriate for a ${readingLevel}th grade reading level
2. Be empathetic and supportive - these parents are managing a child's chronic condition
3. Focus on educational information about pulmonary health, treatments, medications, and medical procedures
4. Explain medical terms in simple, everyday language
5. NEVER provide specific medical advice or diagnosis - always encourage consulting with their healthcare provider for specific concerns
6. If asked about specific symptoms or treatments, provide general educational information and emphasize discussing with their doctor
7. Be encouraging and help parents feel more confident in understanding their child's care
8. Keep responses concise but informative
9. When using information from the trusted medical sources, include inline citation markers like [1], [2], or [3]

${historyContext}PARENT'S QUESTION:
${question}

Please provide a helpful, educational response with inline citations where appropriate:`;

    const response = await generateGeminiContent([prompt]);

    const answer = response.text || "";
    
    if (!answer) {
      return {
        answer: "I'm sorry, I couldn't generate a response. Please try asking your question again.",
        citations: [],
      };
    }

    return { answer, citations };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Gemini Education error:", errorMessage);
    return {
      answer: "I'm having trouble answering your question right now. Please try again in a moment.",
      citations: [],
    };
  }
}
