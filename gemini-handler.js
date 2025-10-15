console.log("gemini-handler.js loaded");

import { GoogleGenAI, Type } from "@google/genai";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "createGeminiSession") {
        (async () => {
            try {
                const apiKey = await chrome.storage.local
                    .get("geminiApiKey")
                    .then((res) => res.geminiApiKey);
                if (!apiKey) {
                    console.error("Gemini API key not set.");
                    chrome.runtime.sendMessage({
                        action: "aiError",
                        error: "Gemini API key not set.",
                    });
                    sendResponse({ success: false, error: "Gemini API key not set." });
                    return;
                }

                const ai = new GoogleGenAI({ apiKey: apiKey });

                const geminiPrompt = `You are a highly skilled academic research assistant.

                 Your task is to summarize the following text into a critical summary including new, critical information (arguments, findings, limitations, methodology, etc).
                 It should be a paragraph (no more than 5-6 sentences). Ensure the final output flows naturally.

                ACADEMIC PAPER TEXT:
                ---
                ${request.text}
                ---

                SUMMARY:`;

                const response = await ai.models.generateContentStream({
                    model: "gemini-2.5-flash",
                    config: {
                        type: Type.TEXT,
                        systemInstructions:
                            "You are a helpful assistant that summarizes academic papers.",
                    },
                    contents: geminiPrompt,
                });

                for await (const chunk of response) {
                    chrome.runtime.sendMessage({
                        action: "finalSummaryChunkReceived",
                        chunk: chunk,
                    });
                }

                chrome.runtime.sendMessage({ action: "summaryStreamEnded" });
                console.log("Gemini session completed successfully.");
                sendResponse({ success: true });
            } catch (error) {
                console.error("Error in Gemini handler:", error);
                chrome.runtime.sendMessage({ action: "aiError", error: error.message });
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }
    return false;

});
