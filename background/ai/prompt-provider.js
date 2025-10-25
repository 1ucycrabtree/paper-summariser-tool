/* eslint-disable no-undef */
import { AIProvider } from "./ai-provider.js";
import { splitTextIntoChunks } from "../utils/text-processing.js";
import {
    sendError,
    sendDownloadProgress,
    sendSummaryChunk,
    sendStreamEnded,
} from "../utils/messaging.js";
import { Sections } from "../../constants.js";

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
            let researchTopic = "";
            if (typeof chrome !== "undefined" && chrome.storage?.session) {
                const key = `researchTopic-${this.tabId}`;
                const result = await chrome.storage.session.get(key);
                researchTopic = result[key] || "";
            }
            this.session = await LanguageModel.create({
                initialPrompt: "You are a highly skilled academic research assistant.",
                monitor: (m) => {
                    m.addEventListener("downloadprogress", (e) => {
                        sendDownloadProgress(this.tabId, e.loaded, Sections.MATRIX);
                    });
                },
            });

            const textChunks = splitTextIntoChunks(text);
            const chunkUpdates = await this.analyzeTextChunks(textChunks, researchTopic);
            const combinedUpdates = chunkUpdates.join("\n\n");

            const finalPrompt = this.buildFinalSummaryPrompt(combinedUpdates, researchTopic);
            const finalStream = await this.session.promptStreaming(finalPrompt);

            for await (const chunk of finalStream) {
                sendSummaryChunk(this.tabId, chunk, Sections.MATRIX);
            }

            sendStreamEnded(this.tabId, Sections.MATRIX);
        } catch (error) {
            console.error("LocalAI generation error:", error);
            sendError(this.tabId, error.message, Sections.MATRIX);
            throw error;
        }
    }

    async analyzeTextChunks(textChunks, researchTopic = "", concurrency = 2) {
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

            for (const res of results) {
                const updateText = res.updateText || "";
                if (!updateText.includes("No new information.")) {
                    chunkUpdates.push(updateText);
                    runningSummary += "\n" + updateText;
                }
            }
        }

        return chunkUpdates;
    }

    buildChunkAnalysisPrompt(runningSummary, researchTopic, chunk) {
        const questions = [
            "Core Theme/Concept",
            "Purpose of Study",
            "Methodology",
            "Key Findings & Contribution"
        ];
        let relevanceRow = "";
        if (researchTopic && researchTopic.trim().length > 0) {
            questions.push(`Relevance to Research Topic (${researchTopic})`);
            relevanceRow = `Relevance to Research Topic: <answer>\n`;
        }
        questions.push(
            "Limitations & Identified Gaps",
            "Critical Appraisal"
        );

        return `You are a text analysis assistant. Your task is to identify and extract only new information in matrix format.

Here is the summary of the document so far:
---
${runningSummary || "No summary has been generated yet."}
---

Now, analyze the following new text section. If it contains any new, critical information (arguments, findings, limitations, methodology, etc) not already present in the summary above, extract that new information and fill out the following matrix. For each row, answer the question in clear, concise sentences based only on the provided text. If there is no new information for a row, leave it blank or write "No new information." If the entire section only repeats or elaborates on information already covered, respond with the exact phrase "No new information."

QUESTIONS:
${questions.map(q => `- ${q}`).join("\n")}

Please output your answers in the following format:

Core Theme/Concept: <answer>
Purpose of Study: <answer>
Methodology: <answer>
Key Findings & Contribution: <answer>
${relevanceRow}
Limitations & Identified Gaps: <answer>
Critical Appraisal: <answer>

For each new piece of information, output a line in the format Header: value. Only include headers for which you have new information. Do not output headers without a value.

NEW TEXT SECTION:
---
${chunk}
---

MATRIX UPDATE:`;
    }

    buildFinalSummaryPrompt(combinedUpdates, researchTopic = "") {
        const questions = [
            "- Core Theme/Concept",
            "- Purpose of Study",
            "- Methodology",
            "- Key Findings & Contribution",
            "- Limitations & Identified Gaps",
            "- Critical Appraisal"
        ];

        let relevanceQuestion = "";
        if (researchTopic.trim().length > 0) {
            questions.splice(4, 0, `- Relevance to Research Topic (${researchTopic})`);
            relevanceQuestion = `Relevance to Research Topic: <answer>\n`;
        }

        return `You are a highly skilled academic research assistant. Your task is to extract key information from the following raw academic text and fill out a matrix. For each row, answer the question in clear, concise sentences based only on the provided text.
    Ensure you keep key details and context from the original text.

    QUESTIONS:
    ${questions.join("\n")}

    Please output your answers in the following format:

    Core Theme/Concept: <answer>
    Purpose of Study: <answer>
    Methodology: <answer>
    Key Findings & Contribution: <answer>
    ${relevanceQuestion}
    Limitations & Identified Gaps: <answer>
    Critical Appraisal: <answer>

    For each new piece of information, output a line in the format Header: value. Only include headers for which you have new information. Do not output headers without a value.

    RAW TEXT:
    ---
    ${combinedUpdates}
    ---
    MATRIX ANSWERS:`;
    }

    destroy() {
        if (this.session) {
            this.session.destroy();
            this.session = null;
        }
    }
}