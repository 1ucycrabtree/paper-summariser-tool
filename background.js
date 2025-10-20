import { GoogleGenAI } from "@google/genai";
import { Models, Config } from "./constants.js";
import { getUserHardwareSpecs } from "./utils/hardware.js";
import { splitTextIntoChunks, processTextChunks } from "./utils/textProcessing.js";
import { sendError, sendDownloadProgress, sendSummaryChunk, sendStreamEnded } from "./utils/messaging.js";

// define LanguageModel to stop no-undef ESLint error
let LanguageModel;

chrome.action.onClicked.addListener(async (tab) => {
    if (chrome.sidePanel && typeof chrome.sidePanel.open === "function") {
        try {
            await chrome.sidePanel.open({ tabId: tab.id });
        } catch (error) {
            console.error("Failed to open side panel:", error);
        }
    } else {
        console.warn(
            "chrome.sidePanel.open is not available in this Chrome version or context."
        );
    }
});
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "generateSummary") {
        (async () => {
            const model = await determineModel();
            await generateSummaryStream(request.file, request.tabId, model);
        })();
        return true;
    }
});

async function determineModel() {
    const { sufficientHardware, vramGB } = await getUserHardwareSpecs();

    if (!sufficientHardware) {
        console.warn(
            `Insufficient GPU VRAM (${vramGB.toFixed(
                2
            )} GB). Need at least 4 GB VRAM, falling back to Gemini dev API.`
        );
        return Models.API;
    }
    if (vramGB >= Config.MIN_VRAM_GB) {
        console.log(
            `Sufficient GPU VRAM detected (${vramGB.toFixed(
                2
            )} GB). Using local LanguageModel.`
        );
        return Models.LOCAL;
    } else {
        console.warn(
            `Insufficient GPU VRAM (${vramGB.toFixed(
                2
            )} GB). Need at least 4 GB VRAM, falling back to Gemini dev API.`
        );
        return Models.API;
    }
}
async function generateSummaryStream(text, tabId, model = Models.API) {
    try {
        let session;
        if (model === Models.LOCAL) {
            // TODO: evaluate whether to use Summarizer API instead of Prompt API for summary generation
            const availability = await LanguageModel.availability();
            if (availability == "unavailable") {
                console.error("LanguageModel is not available.");
                sendError(tabId, "LanguageModel not available.");
                return;
            }

            session = await LanguageModel.create({
                initialPrompt: "You are a highly skilled academic research assistant.",
                monitor(m) {
                    m.addEventListener("downloadprogress", (e) => {
                        sendDownloadProgress(tabId, e.loaded);
                    });
                },
            });

            const textChunks = splitTextIntoChunks(text);
            const chunkUpdates = await processTextChunks(session, textChunks);
            const combinedUpdates = chunkUpdates.join("\n\n");

            const finalPrompt = `You are a highly skilled academic research assistant. The following are the key findings and updates extracted sequentially from a paper.

            Your task is to synthesize these points into a single, cohesive, and concise summary paragraph (no more than 5-6 sentences). Ensure the final output flows naturally.

            KEY INFORMATION:
            ---
            ${combinedUpdates}
            ---

            FINAL SUMMARY:`;

            const finalStream = await session.promptStreaming(finalPrompt);

            for await (const chunk of finalStream) {
                sendSummaryChunk(tabId, chunk);
            }

            sendStreamEnded(tabId);
        } else if (model === Models.API) {
            const apiKey = await chrome.storage.local
                .get("geminiApiKey")
                .then((res) => res.geminiApiKey);
            if (!apiKey) {
                console.error("Gemini API key not set.");
                sendError(tabId, "Gemini API key not set.");
                return;
            }

            const ai = new GoogleGenAI({ apiKey: apiKey });

            const geminiPrompt = `You are a highly skilled academic research assistant.

             Your task is to summarize the following text into a critical summary including new, critical information (arguments, findings, limitations, methodology, etc).
             It should be a paragraph (no more than 5-6 sentences). Ensure the final output flows naturally.

            ACADEMIC PAPER TEXT:
            ---
            ${text}
            ---

            SUMMARY:`;

            const responseStream = await ai.models.generateContentStream({
                model: "gemini-2.5-flash-lite",
                systemInstruction:
                    "You are a helpful assistant that summarizes academic papers.",
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: geminiPrompt,
                            },
                        ],
                    },
                ],
            });

            for await (const chunk of responseStream) {
                const chunkText =
                    typeof chunk.text === "function" ? chunk.text() : chunk.text;
                sendSummaryChunk(tabId, chunkText);
            }

            sendStreamEnded(tabId);
            console.log("Gemini session completed successfully.");
        } else {
            console.error("Error initializing session with model:", model);
            sendError(tabId, "Error initializing model session.");
            return;
        }

        // TODO: handle errors better
        // example - An error occurred: {"error":{"message":"{\n \"error\": {\n \"code\": 400,\n \"message\": \"API key not valid. Please pass a valid API key.\",\n \"status\": \"INVALID_ARGUMENT\",\n \"details\": [\n {\n \"@type\": \"type.googleapis.com/google.rpc.ErrorInfo\",\n \"reason\": \"API_KEY_INVALID\",\n \"domain\": \"googleapis.com\",\n \"metadata\": {\n \"service\": \"generativelanguage.googleapis.com\"\n }\n },\n {\n \"@type\": \"type.googleapis.com/google.rpc.LocalizedMessage\",\n \"locale\": \"en-US\",\n \"message\": \"API key not valid. Please pass a valid API key.\"\n }\n ]\n }\n}\n","code":400,"status":""}}
    } catch (error) {
        console.error("Error during AI summary generation:", error);
        sendError(tabId, error.message);
    }
}
