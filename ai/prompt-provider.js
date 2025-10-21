import { AIProvider } from "./ai-provider.js";
import { Config } from "../constants.js";
import {
    splitTextIntoChunks,
    processTextChunks,
} from "../utils/text-processing.js";
import {
    sendError,
    sendDownloadProgress,
    sendSummaryChunk,
    sendStreamEnded,
} from "../utils/messaging.js";

export class PromptProvider extends AIProvider {
    constructor(tabId, LanguageModel) {
        super(tabId);
        this.LanguageModel = LanguageModel;
        this.session = null;
    }

    async isAvailable() {
        try {
            const availability = await this.LanguageModel.availability();
            return availability !== "unavailable";
        } catch (error) {
            console.error("Error checking LanguageModel availability:", error);
            return false;
        }
    }

    async generateSummary(text) {
        try {
            this.session = await this.LanguageModel.create({
                initialPrompt: "You are a highly skilled academic research assistant.",
                monitor: (m) => {
                    m.addEventListener("downloadprogress", (e) => {
                        sendDownloadProgress(this.tabId, e.loaded);
                    });
                },
            });

            const textChunks = splitTextIntoChunks(text);
            const chunkUpdates = await processTextChunks(this.session, textChunks);
            const combinedUpdates = chunkUpdates.join("\n\n");

            const finalPrompt = this._buildFinalSummaryPrompt(combinedUpdates);
            const finalStream = await this.session.promptStreaming(finalPrompt);

            for await (const chunk of finalStream) {
                sendSummaryChunk(this.tabId, chunk);
            }

            sendStreamEnded(this.tabId);
        } catch (error) {
            console.error("LocalAI generation error:", error);
            sendError(this.tabId, error.message);
            throw error;
        }
    }

    _buildFinalSummaryPrompt(combinedUpdates) {
        return `You are a highly skilled academic research assistant. The following are the key findings and updates extracted sequentially from a paper.

        Your task is to synthesize these points into a single, cohesive, and concise summary paragraph (no more than ${Config.MAX_SUMMARY_SENTENCES} sentences). Ensure the final output flows naturally.

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