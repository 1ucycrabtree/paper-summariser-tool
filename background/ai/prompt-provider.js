/* eslint-disable no-undef */
import { AIProvider } from "./ai-provider.js";
import { splitTextIntoChunks, processTextChunks } from "../utils/text-processing.js";
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
            // TODO: customize initial prompt to generate matrix format not summary
            this.session = await LanguageModel.create({
                initialPrompt: "You are a highly skilled academic research assistant.",
                monitor: (m) => {
                    m.addEventListener("downloadprogress", (e) => {
                        sendDownloadProgress(this.tabId, e.loaded, Sections.MATRIX);
                    });
                },
            });

            const textChunks = splitTextIntoChunks(text);
            const chunkUpdates = await processTextChunks(this.session, textChunks);
            const combinedUpdates = chunkUpdates.join("\n\n");

            const finalPrompt = this.buildFinalSummaryPrompt(combinedUpdates);
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

    buildFinalSummaryPrompt(combinedUpdates) {
        return `You are a highly skilled academic research assistant. The following are the key findings and updates extracted sequentially from a paper.

        Your task is to synthesize these points into a single, cohesive, and concise summary paragraph (no more than 6 sentences). Ensure the final output flows naturally and focuses on arguments, findings, limitations, and methodology.

        KEY INFORMATION:
        ---
        ${combinedUpdates}
        ---
        FINAL SUMMARY:`;
    }

    destroy() {
        if (this.session) {
            this.session.destroy();
            this.session = null;
        }
    }
}