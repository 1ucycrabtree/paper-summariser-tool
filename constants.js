export const Models = {
    LOCAL: "Local",
    API: "API",
};

export const Config = {
    MIN_VRAM_GB: 4,
    MIN_VRAM_B: 4 * 1024 * 1024 * 1024,
    CHUNK_SIZE: 20000,
    CHUNK_CONCURRENCY: 3,
    CHUNK_OVERLAP: 200,
};

export const MessageActions = {
    GENERATE_SUMMARY: "generateSummary",
    GENERATE_MATRIX: "generateMatrix",
    AI_ERROR: "aiError",
    MODEL_DOWNLOAD_PROGRESS: "modelDownloadProgress",
    SUMMARY_CHUNK_RECEIVED: "finalSummaryChunkReceived",
    SUMMARY_STREAM_ENDED: "summaryStreamEnded",
};