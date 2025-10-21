import { Config } from "../constants.js";

export function splitTextIntoChunks(text, chunkSize = Config.CHUNK_SIZE, chunkOverlap = 0, includeReferences = false) {
    if (!includeReferences) {
        const referencesIndex = text.search(/(^|\n)\s*References\s*(\n|$)/i);
        if (referencesIndex !== -1) {
            text = text.substring(0, referencesIndex);
        }
    }

    const chunks = [];
    let startIndex = 0;
    if (chunkSize <= chunkOverlap) {
        console.error("Chunk size must be larger than overlap. Using 0 overlap.");
        chunkOverlap = 0;
    }

    while (startIndex < text.length) {
        const endIndex = startIndex + chunkSize;
        chunks.push(text.substring(startIndex, endIndex));
        startIndex += chunkSize - chunkOverlap;
    }

    console.log(`Text split into ${chunks.length} chunks.`);
    return chunks;
}

export async function processTextChunks(
    session,
    textChunks,
    concurrency = Config.CHUNK_CONCURRENCY
) {
    const chunkUpdates = [];
    let runningSummary = "";

    for (let i = 0; i < textChunks.length; i += concurrency) {
        const batch = textChunks.slice(i, i + concurrency);

        const promptPromises = batch.map((chunk) => {
            const prompt = buildChunkAnalysisPrompt(runningSummary, chunk);
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

function buildChunkAnalysisPrompt(runningSummary, chunk) {
    return `You are a text analysis assistant. Your task is to identify and extract only new information.

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
}