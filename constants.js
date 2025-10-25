export const Config = Object.freeze({
    MIN_VRAM_GB: 4,
    MIN_VRAM_BYTES: 4 * 1024 * 1024 * 1024,
    DEFAULT_CHUNK_SIZE: 20000,
    DEFAULT_CHUNK_CONCURRENCY: 3,
    DEFAULT_CHUNK_OVERLAP: 200,
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