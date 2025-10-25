import { GoogleGenAI } from "@google/genai";
import { AIProvider } from "./ai-provider.js";
import { sendError, sendChunk, sendSummaryStreamEnded } from "../utils/messaging.js";
import { Sections } from "../../constants.js";

export class GeminiProvider extends AIProvider {
    constructor(tabId, apiKey) {
        super(tabId);
        this.apiKey = apiKey;
        this.client = null;
    }

    async isAvailable() {
        return !!this.apiKey;
    }

    async generateResponse(text) {
        try {
            this.client = new GoogleGenAI({ apiKey: this.apiKey });

            const prompt = this.buildPrompt(text);
            const responseStream = await this.client.models.generateContentStream({
                model: "gemini-2.5-flash-lite",
                systemInstruction:
                    "You are a helpful assistant that summarizes academic papers.",
                contents: [
                    {
                        role: "user",
                        parts: [{ text: prompt }],
                    },
                ],
            });

            for await (const chunk of responseStream) {
                const chunkText =
                    typeof chunk.text === "function" ? chunk.text() : chunk.text;
                sendChunk(this.tabId, chunkText, Sections.SUMMARY);
            }

            sendSummaryStreamEnded(this.tabId, Sections.SUMMARY);
            console.log("Gemini session completed successfully.");
        } catch (error) {
            console.error("Gemini generation error:", error);

            const errorMessage = this.parseError(error);
            sendError(this.tabId, errorMessage, Sections.SUMMARY);
            throw error;
        }
    }

    buildPrompt(text) {
        return `You are a highly skilled academic research assistant.

        Your task is to summarize the following text into a critical summary including new, critical information (arguments, findings, limitations, methodology, etc).
        It should be a paragraph (no more than 6 sentences). Ensure the final output flows naturally.

        ACADEMIC PAPER TEXT:
        ---
        ${text}
        ---
        SUMMARY:`;
    }

    parseError(error) {
        try {
            if (error.error?.message) {
                const parsed = JSON.parse(error.error.message);
                return parsed.error?.message || error.message;
            }
        } catch (parseError) {
            return parseError.message;
        }
        return error.message || "Unknown error occurred";
    }

    destroy() {
        this.client = null;
    }

}