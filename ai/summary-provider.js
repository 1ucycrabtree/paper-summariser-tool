import { AIProvider } from "./ai-provider.js";
import {
    sendError,
    sendDownloadProgress,
    sendSummaryChunk,
    sendStreamEnded,
} from "../utils/messaging.js";

export class SummaryProvider extends AIProvider {
    constructor(tabId) {
        super(tabId);
        this.session = null;
    }

    async isAvailable() {
        try {
            const availability = await Summarizer.availability();
            return availability !== "unavailable";
        } catch (error) {
            console.error("Error checking Summarizer availability:", error);
            return false;
        }
    }

    async generateSummary(text) {
        try {
            this.session = await Summarizer.create({
                sharedContext: "This is an academic article.",
                type: "tldr",
                length: "long",
                outputLanguage: "en",
                monitor: (m) => {
                    m.addEventListener("downloadprogress", (e) => {
                        sendDownloadProgress(this.tabId, e.loaded);
                    });
                },
            });

            const finalStream = await this.session.summarizeStreaming(text, {
                context: "The summary is intended for academic students and researchers.",
            });

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

    destroy() {
        if (this.session) {
            this.session.destroy();
            this.session = null;
        }
    }
}