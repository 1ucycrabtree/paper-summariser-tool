import { GoogleGenAI } from "@google/genai";
import { Models, Config, MessageActions } from "./constants.js";

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

async function getUserHardwareSpecs() {
    if (!navigator.gpu) {
        return { sufficientHardware: false, vramGB: 0 };
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        return { sufficientHardware: false, vramGB: 0 };
    }
    const gpuInfo = {
        gpu: true,
        name: adapter.name,
        features: Array.from(adapter.features),
        limits: adapter.limits,
    };

    let sufficientHardware = false;
    if (
        gpuInfo.gpu &&
        gpuInfo.limits &&
        typeof gpuInfo.limits.maxBufferSize === "number"
    ) {
        if (gpuInfo.limits.maxBufferSize >= Config.MIN_VRAM_B) {
            sufficientHardware = true;
        }
    }

    const vramGB =
        gpuInfo.limits && typeof gpuInfo.limits.maxBufferSize === "number"
            ? gpuInfo.limits.maxBufferSize / (1024 * 1024 * 1024)
            : 0;

    return { sufficientHardware, vramGB };
}

async function processTextChunks(session, textChunks, concurrency = Config.CHUNK_CONCURRENCY) {
    const chunkUpdates = [];
    let runningSummary = "";

    for (let i = 0; i < textChunks.length; i += concurrency) {
        const batch = textChunks.slice(i, i + concurrency);

        const promptPromises = batch.map((chunk) => {
            const prompt = `You are a text analysis assistant. Your task is to identify and extract only new information.

                Here is the summary of the document so far:
                ---
                ${runningSummary || "No summary has been generated yet."}
                ---

                Now, analyze the following new text section. If it contains any new, critical information (arguments, findings, limitations, methodology, etc) not already present in the summary above, extract that new information as 2-3 brief bullet points.

                If this section only repeats or elaborates on information already covered, respond with the exact phrase "No new information."

                NEW TEXT SECTION:
                ---
                ${chunk}
                ---

                UPDATE:`;

            return session
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

function splitTextIntoChunks(text, chunkSize = Config.CHUNK_SIZE) {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.substring(i, i + chunkSize));
    }
    console.log(`Text split into ${chunks.length} chunks.`);
    return chunks;
}
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
                chrome.runtime.sendMessage({
                    action: MessageActions.AI_ERROR,
                    error: "LanguageModel not available.",
                    tabId: tabId,
                });
                return;
            }

            session = await LanguageModel.create({
                initialPrompt: "You are a highly skilled academic research assistant.",
                monitor(m) {
                    m.addEventListener("downloadprogress", (e) => {
                        chrome.runtime.sendMessage({
                            action: MessageActions.MODEL_DOWNLOAD_PROGRESS,
                            progress: e.loaded,
                            tabId: tabId,
                        });
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
                chrome.runtime.sendMessage({
                    action: MessageActions.SUMMARY_CHUNK_RECEIVED,
                    chunk: chunk,
                    tabId: tabId,
                });
            }

            chrome.runtime.sendMessage({
                action: MessageActions.SUMMARY_STREAM_ENDED,
                tabId: tabId,
            });
        } else if (model === Models.API) {
            const apiKey = await chrome.storage.local
                .get("geminiApiKey")
                .then((res) => res.geminiApiKey);
            if (!apiKey) {
                console.error("Gemini API key not set.");
                chrome.runtime.sendMessage({
                    action: MessageActions.AI_ERROR,
                    error: "Gemini API key not set.",
                    tabId: tabId,
                });
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
                chrome.runtime.sendMessage({
                    action: MessageActions.SUMMARY_CHUNK_RECEIVED,
                    chunk: chunkText,
                    tabId: tabId,
                });
            }

            chrome.runtime.sendMessage({
                action: MessageActions.SUMMARY_STREAM_ENDED,
                tabId: tabId,
            });
            console.log("Gemini session completed successfully.");
        } else {
            console.error("Error initializing session with model:", model);
            chrome.runtime.sendMessage({
                action: MessageActions.AI_ERROR,
                error: "Error initializing model session.",
                tabId: tabId,
            });
            return;
        }

        // TODO: handle errors better
        // example - An error occurred: {"error":{"message":"{\n \"error\": {\n \"code\": 400,\n \"message\": \"API key not valid. Please pass a valid API key.\",\n \"status\": \"INVALID_ARGUMENT\",\n \"details\": [\n {\n \"@type\": \"type.googleapis.com/google.rpc.ErrorInfo\",\n \"reason\": \"API_KEY_INVALID\",\n \"domain\": \"googleapis.com\",\n \"metadata\": {\n \"service\": \"generativelanguage.googleapis.com\"\n }\n },\n {\n \"@type\": \"type.googleapis.com/google.rpc.LocalizedMessage\",\n \"locale\": \"en-US\",\n \"message\": \"API key not valid. Please pass a valid API key.\"\n }\n ]\n }\n}\n","code":400,"status":""}}
    } catch (error) {
        console.error("Error during AI summary generation:", error);
        chrome.runtime.sendMessage({
            action: MessageActions.AI_ERROR,
            error: error.message,
            tabId: tabId,
        });
    }
}
