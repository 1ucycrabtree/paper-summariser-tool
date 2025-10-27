export const Config = Object.freeze({
    // Minimum VRAM required to run Local AI models
    MIN_VRAM_GB: 4,
    // Minimum VRAM required to run Local AI models (in bytes)
    MIN_VRAM_BYTES: 4 * 1024 * 1024 * 1024,
    // Default chunking parameters for text processing
    DEFAULT_CHUNK_SIZE: 10000,
    // Default number of concurrent chunk analyses (3 seems to work well without overwhelming Local AI)
    DEFAULT_CHUNK_CONCURRENCY: 3,
    // Default overlap size between text chunks
    DEFAULT_CHUNK_OVERLAP: 200,
});

export const Models = Object.freeze({
    LOCAL: "Local",
    REMOTE: "Remote",
});

export const MessageActions = Object.freeze({
    GENERATE_SUMMARY: "generateSummary",
    GENERATE_MATRIX: "generateMatrix",
    AI_ERROR: "aiError",
    MODEL_DOWNLOAD_PROGRESS: "modelDownloadProgress",
    CHUNK_RECEIVED: "chunkReceived",
    SUMMARY_STREAM_ENDED: "summaryStreamEnded",
    MATRIX_STREAM_ENDED: "matrixStreamEnded",
});

export const Sections = Object.freeze({
    SUMMARY: "summary",
    MATRIX: "matrix",
});