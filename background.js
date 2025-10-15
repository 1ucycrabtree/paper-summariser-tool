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
        generateSummaryStream(request.file);
        return true;
    }
});

async function generateSummaryStream(text) {
    try {
        const availability = await LanguageModel.availability();
        if (availability !== "available") {
            console.error("LanguageModel is not available.");
            chrome.runtime.sendMessage({ action: "aiError", error: "LanguageModel not available." });
            return;
        }

        const session = await LanguageModel.create({
            initialPrompt: "You are a highly skilled academic research assistant.",
        });

        function splitTextIntoChunks(text, chunkSize = 3000) {
            const chunks = [];
            for (let i = 0; i < text.length; i += chunkSize) {
                chunks.push(text.substring(i, i + chunkSize));
            }
            return chunks;
        }

        const textChunks = splitTextIntoChunks(text);
        const chunkUpdates = [];
        let runningSummary = "";

        for (const chunk of textChunks) {
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

            const updateText = await session.prompt(prompt);

            if (!updateText.includes("No new information.")) {
                chunkUpdates.push(updateText);
                runningSummary += "\n" + updateText;
                chrome.runtime.sendMessage({
                    action: "summaryChunkReceived",
                    chunk: runningSummary,
                });
            }
        }
        chrome.runtime.sendMessage({ action: "summaryStreamEnded" });
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
                action: "finalSummaryChunkReceived",
                chunk: chunk,
            });
        }

        chrome.runtime.sendMessage({ action: "summaryStreamEnded" });
        session.destroy();
    } catch (error) {
        console.error("Error during AI summary generation:", error);
        chrome.runtime.sendMessage({ action: "aiError", error: error.message });
    }
}