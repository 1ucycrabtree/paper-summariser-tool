export const Config = Object.freeze({
    minVramGb: 4,
    minVramBytes: 4 * 1024 * 1024 * 1024,
    chunkSize: 20000,
    chunkConcurrency: 3,
    chunkOverlap: 200,
});

export const Models = Object.freeze({
    LOCAL: "Local",
    API: "API",
});

export const MessageActions = Object.freeze({
    GENERATE_SUMMARY: "generateSummary",
    GENERATE_MATRIX: "generateMatrix",
    AI_ERROR: "aiError",
    MODEL_DOWNLOAD_PROGRESS: "modelDownloadProgress",
    SUMMARY_CHUNK_RECEIVED: "finalSummaryChunkReceived",
    SUMMARY_STREAM_ENDED: "summaryStreamEnded",
});

export const Sections = Object.freeze({
    SUMMARY: "summary",
    MATRIX: "matrix",
});