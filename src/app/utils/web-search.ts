import axios from "axios";
import { TAVILY_API_URL } from "./constants";
import { getEnvInt } from "@/lib/env";

const TAVILY_TIMEOUT_MS = getEnvInt("TAVILY_TIMEOUT_MS", 8000, 1000);

export interface TavilySnippet {
  title: string;
  url: string;
  content: string;
}

export interface TavilyResponse {
  answer: string;
  snippets: TavilySnippet[];
  sources: string[];
  follow_up_questions: string[];
}

export async function webSearch(query: string): Promise<TavilyResponse> {
  const tavilyApiKey = process.env.TAVILY_API_KEY;

  if (!tavilyApiKey) {
    throw new Error("Web search is not configured: missing TAVILY_API_KEY.");
  }

  try {
    const { data } = await axios.post<TavilyResponse>(TAVILY_API_URL, {
      api_key: tavilyApiKey,
      query,
      include_answer: true,
      include_sources: true,
      max_results: 3,
    }, {
      timeout: TAVILY_TIMEOUT_MS,
    });

    return data;
  } catch (error) {
    console.error("Tavily search error:", error);
    throw new Error("Failed to fetch search results from Tavily.");
  }
}
