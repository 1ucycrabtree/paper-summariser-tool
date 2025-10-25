import { GoogleGenAI } from "@google/genai";
import { AIProvider } from "./ai-provider.js";
import { sendError, sendChunk, sendSummaryStreamEnded, sendMatrixStreamEnded } from "../utils/messaging.js";
import { Sections } from "../../constants.js";

export class GeminiProvider extends AIProvider {
    constructor(tabId, apiKey, modelPurpose, researchTopic = "") {
        super(tabId);
        this.apiKey = apiKey;
        this.modelPurpose = modelPurpose;
        this.researchTopic = researchTopic;
        this.client = null;
    }

    async isAvailable() {
        return !!this.apiKey;
    }

    async generateResponse(text) {
        try {
            this.client = new GoogleGenAI({ apiKey: this.apiKey });

            let prompt;
            if (this.modelPurpose === Sections.SUMMARY) {
                prompt = this.buildSummaryPrompt(text);
            } else if (this.modelPurpose === Sections.MATRIX) {
                prompt = this.buildMatrixPrompt(text);
            } else {
                throw new Error(`Unsupported model purpose: ${this.modelPurpose}`);
            }

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
                sendChunk(this.tabId, chunkText, this.modelPurpose);
            }

            if (this.modelPurpose === Sections.SUMMARY)
            {
                sendSummaryStreamEnded(this.tabId, this.modelPurpose);
            }
            else if (this.modelPurpose === Sections.MATRIX)
            {
                sendMatrixStreamEnded(this.tabId, this.modelPurpose);
            }
            console.log("Gemini session completed successfully.");
        } catch (error) {
            console.error("Gemini generation error:", error);

            const errorMessage = this.parseError(error);
            sendError(this.tabId, errorMessage, this.modelPurpose);
            throw error;
        }
    }
    buildMatrixPrompt(text) {
        const questions = [
            "Core Theme/Concept: What is the central idea or concept explored in this section?",
            "Purpose of Study: What was the main goal or motivation behind the research?",
            "Methodology: What methods, metrics, or scope did the authors use (be specific)? Justify their choices if possible.",
            "Key Findings & Contribution: What was the main takeaway? What's new about their work compared to prior research?",
            "Limitations & Identified Gaps: What did the authors admit were limitations? What gaps does their work leave open for you to address?",
            "Critical Appraisal: Are the claims well-supported? Any unstated assumptions? Is the methodology sound? How does it fit into the broader academic conversation? Consider the academic journal standards."
        ];

        let matrixHeaders = [
            "Core Theme/Concept",
            "Purpose of Study",
            "Methodology",
            "Key Findings & Contribution",
            "Limitations & Identified Gaps",
            "Critical Appraisal"
        ];

        if (this.researchTopic.trim().length > 0) {
            questions.splice(4, 0,
                `Relevance to Research Topic: Does this paper directly address or inform your research topic (${this.researchTopic})? If not, respond with "No relevance." Do not infer or invent connections. Justify your answer only if relevant.`
            );
            matrixHeaders.splice(4, 0, "Relevance to Research Topic");
        }

        return `You are a highly skilled academic research assistant.
        Your task is to extract key information from the following academic text and fill out a matrix. For each header, answer the question in clear sentences based only on the provided text.
        When answering, always include any facts, figures (such as statistics, sample sizes, quantitative results), and references (such as cited papers, authors, or sources) that are explicitly stated in the text and relevant to the question. 
        Do NOT invent information or add headers not listed below.

        QUESTIONS:
        ${questions.join("\n")}

        Please output your answers in the following format (only these headers, and only if you have information for them):

        ${matrixHeaders.map(h => `${h}: <answer>`).join("\n")}

        Only include headers for which you have information. Do NOT add any other headers. Do NOT hallucinate or infer beyond the text.

        RAW TEXT:
        ---
        ${text}
        ---
        MATRIX ANSWERS:`;
    }

    buildSummaryPrompt(text) {
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