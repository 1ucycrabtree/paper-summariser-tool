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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "generateSummary") {
        const tabId = request.tabId;
        const articleText = request.file;

        generateSummaryStream(articleText, tabId);
        return true;
    }
});

async function generateSummaryStream(text, tabId) {
    try {
        const availability = await LanguageModel.availability();
        if (!availability) {
            console.error("LanguageModel is not available.");
            chrome.runtime.sendMessage({
                action: "aiError",
                error: "LanguageModel not available.",
            });
            return;
        }

        const session = await LanguageModel.create({
            initialPrompt: "You are a highly skilled academic research assistant.",
            expectedInputs: [{ type: "text", languages: ["en"] }],
            expectedOutputs: [{ type: "text", languages: ["en"] }],
            monitor(m) {
                m.addEventListener("downloadprogress", (e) => {
                    console.log(`Downloaded ${e.loaded * 100}%`);
                });
            },
        });

        function splitTextIntoChunks(text, chunkSize = 2000) {
            const chunks = [];
            for (let i = 0; i < text.length; i += chunkSize) {
                chunks.push(text.substring(i, i + chunkSize));
            }
            return chunks;
        }

        const schema = {
            type: "object",
            properties: {
                summary: { type: "string" },
            },
            required: ["summary"],
        };

        const textChunks = splitTextIntoChunks(text);
        const chunkSummaries = [];

        for (const chunk of textChunks) {
            const prompt = `Analyze the following section of academic text and extract only the most critical information.

            Present the information as a list of 2-5 bullet points.

            ACADEMIC TEXT:
            ---
            ${chunk}
            ---

            SUMMARY:`;

            const stream = await session.promptStreaming(prompt, {
                responseConstraint: schema,
            });

            let combinedSummary = "";
            for await (const streamChunk of stream) {
                chrome.runtime.sendMessage({
                    action: "summaryChunkReceived",
                    chunk: streamChunk,
                });
                combinedSummary += streamChunk;
            }
            console.log(`${session.inputUsage}/${session.inputQuota}`);
            chunkSummaries.push(combinedSummary);
        }

        const combinedSummaries = chunkSummaries.join("\n\n");

        const finalPrompt = `You are a highly skilled academic research assistant. The following are key points extracted from a larger academic text. Combine them into a single, cohesive, and very concise summary of the entire text. The final summary should be a brief paragraph, no more than 5 sentences.

        KEY POINTS:
        ---
        ${combinedSummaries}
        ---

        FINAL SUMMARY:`;

        const stream = await session.promptStreaming(finalPrompt, {
            responseConstraint: schema,
        });

        for await (const chunk of stream) {
            chrome.runtime.sendMessage({
                action: "summaryChunkReceived",
                chunk: chunk,
            });
            console.log(`${session.inputUsage}/${session.inputQuota}`);
        }

        chrome.runtime.sendMessage({ action: "summaryStreamEnded" });
        session.destroy();
    } catch (error) {
        console.error("Error during AI summary generation:", error);
        chrome.runtime.sendMessage({ action: "aiError", error: error.message });
    }
}
