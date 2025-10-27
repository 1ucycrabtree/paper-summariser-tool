/* eslint-disable no-undef */
import { AIProvider } from "./ai-provider.js";
import { splitTextIntoChunks } from "../utils/text-processing.js";
import {
    sendError,
    sendDownloadProgress,
    sendChunk,
    sendMatrixStreamEnded,
} from "../utils/messaging.js";
import { Sections, Config, MatrixQuestions, MatrixHeaders} from "../../constants.js";

export class PromptProvider extends AIProvider {
    constructor(tabId) {
        super(tabId);
        this.session = null;
    }

    async isAvailable() {
        try {
            const availability = await LanguageModel.availability();
            return availability !== "unavailable";
        } catch (error) {
            console.error("Error checking LanguageModel availability:", error);
            return false;
        }
    }

    async generateResponse(text) {
        try {
            const researchTopic = await this.getResearchTopic();
            this.session = await LanguageModel.create({
                initialPrompt: "You are a highly skilled academic research assistant.",
                monitor: (m) => {
                    m.addEventListener("downloadprogress", (e) => {
                        sendDownloadProgress(this.tabId, e.loaded, Sections.MATRIX);
                    });
                },
            });

            // prompt api can only handle limited text at once, so split into chunks and analyze iteratively
            const textChunks = splitTextIntoChunks(text);
            const chunkUpdates = await this.analyzeTextChunks(textChunks, researchTopic);
            const combinedUpdates = chunkUpdates
                .map(update => update.trim())
                .filter(update => update.length > 0)
                .join("\n\n");

            const finalPrompt = this.buildFinalSummaryPrompt(combinedUpdates, researchTopic);
            const finalStream = await this.session.promptStreaming(finalPrompt);

            for await (const chunk of finalStream) {
                sendChunk(this.tabId, chunk, Sections.MATRIX);
            }
            sendMatrixStreamEnded(this.tabId, Sections.MATRIX);
        } catch (error) {
            console.error("LocalAI generation error:", error);
            sendError(this.tabId, error.message, Sections.MATRIX);
            throw error;
        }
    }

    async getResearchTopic() {
        if (typeof chrome !== "undefined" && chrome.storage?.session) {
            const key = `researchTopic-${this.tabId}`;
            const result = await chrome.storage.session.get(key);
            return result[key] || "";
        } else {
            console.warn("chrome.storage.session is not available; skipping research topic retrieval.");
            return "";
        }
    }

    async analyzeTextChunks(textChunks, researchTopic = "", concurrency = Config.DEFAULT_CHUNK_CONCURRENCY) {
        const chunkUpdates = [];
        let runningSummary = "";

        for (let i = 0; i < textChunks.length; i += concurrency) {
            const batch = textChunks.slice(i, i + concurrency);
            const promptPromises = batch.map((chunk) => {
                const prompt = this.buildChunkAnalysisPrompt(runningSummary, researchTopic, chunk);
                return this.session
                    .prompt(prompt)
                    .then((updateText) => ({ success: true, updateText }))
                    .catch((err) => {
                        console.error("Chunk analysis failed:", err);
                        return { success: false, updateText: "No new information." };
                    });
            });

            const results = await Promise.all(promptPromises);

            for (const { updateText } of results) {
                if (updateText && !updateText.includes("No new information.")) {
                    chunkUpdates.push(updateText);
                    runningSummary += "\n" + updateText;
                }
            }
        }
        return chunkUpdates;
    }

    buildChunkAnalysisPrompt(runningSummary, researchTopic, chunk) {
        return buildMatrixPrompt({
            roleIntro: "You are a text analysis assistant. Your task is to identify and extract only new information in matrix format.",
            questions: getQuestions(researchTopic),
            matrixHeaders: getMatrixHeaders(researchTopic),
            contextSummary: runningSummary || "No summary has been generated yet.",
            sectionLabel: "NEW TEXT SECTION",
            sectionText: chunk,
            matrixLabel: "MATRIX UPDATE"
        });
    }

    buildFinalSummaryPrompt(combinedUpdates, researchTopic = "") {
        return buildMatrixPrompt({
            roleIntro: "You are a highly skilled academic research assistant. Your task is to extract key information from the following raw academic text and fill out a matrix. For each row, answer the question in clear, concise sentences based only on the provided text.\nEnsure you keep key details and context from the original text.",
            questions: getQuestions(researchTopic),
            matrixHeaders: getMatrixHeaders(researchTopic),
            contextSummary: null,
            sectionLabel: "RAW TEXT",
            sectionText: combinedUpdates,
            matrixLabel: "MATRIX ANSWERS"
        });
    }

    destroy() {
        if (this.session) {
            this.session.destroy();
            this.session = null;
        }
    }
}

function getQuestions(researchTopic) {
    const baseQuestions = [...MatrixQuestions];
    if (researchTopic?.trim().length > 0) {
        baseQuestions.splice(4, 0, `Relevance to Research Topic: Does this paper directly address or inform your research topic (${researchTopic})? If not, respond with "No relevance." Do not infer or invent connections. Justify your answer only if relevant.`);
    }
    return baseQuestions;
}

function getMatrixHeaders(researchTopic) {
    const baseHeaders = [...MatrixHeaders];
    if (researchTopic?.trim().length > 0) {
        baseHeaders.splice(4, 0, "Relevance to Research Topic");
    }
    return baseHeaders.map(h => `${h}: <answer>`).join("\n");
}

function buildMatrixPrompt({
    roleIntro,
    questions,
    matrixHeaders,
    contextSummary,
    sectionLabel,
    sectionText,
    matrixLabel
}) {
    return `${roleIntro}

    ${contextSummary ? `Here is the summary of the document so far:
    ---
    ${contextSummary}
    ---
    ` : ""}

    QUESTIONS:
    ${questions.map(q => `- ${q}`).join("\n")}

    Please output your answers in the following format:
    ${matrixHeaders}

    For each new piece of information, output a line in the format Header: value. Only include headers for which you have new information. Do not output headers without a value.

    ${sectionLabel}:
    ---
    ${sectionText}
    ---
    ${matrixLabel}:`;
}