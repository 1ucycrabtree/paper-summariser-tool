import { AIProvider } from "./ai-provider.js";
import {
    sendError,
    sendDownloadProgress,
    sendChunk,
    sendSummaryStreamEnded,
} from "../utils/messaging.js";
import { splitTextIntoChunks } from "../utils/text-processing.js";
import { Config, Sections } from "../../constants.js";

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

    async generateResponse(text) {
        try {
            this.session = await Summarizer.create({
                sharedContext: "This is an academic article.",
                type: "tldr",
                length: "long",
                format: "plain-text",
                outputLanguage: "en",
                monitor: (m) => {
                    m.addEventListener("downloadprogress", (e) => {
                        sendDownloadProgress(this.tabId, e.loaded, Sections.SUMMARY);
                    });
                },
            });

            const textChunks = splitTextIntoChunks(text, this.session.inputQuota, Config.DEFAULT_CHUNK_OVERLAP);
            if (!textChunks || textChunks.length === 0) {
                throw new Error("Could not find any content to summarize. The text might be empty.");
            }

            const finalSummary = await this.recursiveSummarizer(textChunks);

            for await (const chunk of finalSummary) {
                sendChunk(this.tabId, chunk, Sections.SUMMARY);
            }

            sendSummaryStreamEnded(this.tabId, Sections.SUMMARY);
        } catch (error) {
            console.error("LocalAI generation error:", error);
            sendError(this.tabId, error.message, Sections.SUMMARY);
            throw error;
        }
    }

    destroy() {
        if (this.session) {
            this.session.destroy();
            this.session = null;
        }
    }

    // recursive summarization from google summary of summaries approach
    async recursiveSummarizer(chunks) {
        const chunkCount = chunks.length;
        console.log(`Starting recursive summarization for ${chunkCount} chunks.`);

        let summaries = [];
        let currentSummaryBatch = [];

        for (let i = 0; i < chunkCount; i++) {
            const summarizedPart = await this.session.summarize(chunks[i].trim(), {
                context: "The summary is intended for academic students and researchers.",
            });

            const testBatch = [...currentSummaryBatch, summarizedPart];
            const tokenCount = await this.session.measureInputUsage(testBatch.join('\n\n')); 
      
            if (tokenCount > this.session.inputQuota) {
                if (currentSummaryBatch.length > 0) {
                    summaries.push(currentSummaryBatch.join('\n\n'));
                }
                currentSummaryBatch = [summarizedPart];
            } else {
                currentSummaryBatch.push(summarizedPart);
            }
        }

        if (currentSummaryBatch.length > 0) {
            summaries.push(currentSummaryBatch.join('\n\n'));
        }

        if (summaries.length === 1) {      
            return await this.session.summarizeStreaming(summaries[0], {
                context: "Combine these summaries into one cohesive final summary."
            });
        }

        return this.recursiveSummarizer(summaries);
    }
}