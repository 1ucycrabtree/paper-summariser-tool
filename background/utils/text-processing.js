import { Config } from "../../constants.js";

export function splitTextIntoChunks(text, chunkSize = Config.DEFAULT_CHUNK_SIZE, chunkOverlap = 0, includeReferences = false) {
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