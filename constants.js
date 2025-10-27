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
    STOP_AI: "stopAI",
});

export const Sections = Object.freeze({
    SUMMARY: "summary",
    MATRIX: "matrix",
});

export const MatrixQuestions = Object.freeze([
    "Core Theme/Concept: What is the central idea or concept explored in this section?",
    "Purpose of Study: What was the main goal or motivation behind the research?",
    "Methodology: What methods, metrics, or scope did the authors use (be specific)? Justify their choices if possible.",
    "Key Findings & Contribution: What was the main takeaway? What's new about their work compared to prior research?",
    "Limitations & Identified Gaps: What did the authors admit were limitations? What gaps does their work leave open for you to address?",
    "Critical Appraisal: Are the claims well-supported? Any unstated assumptions? Is the methodology sound? How does it fit into the broader academic conversation? Consider the academic journal standards."
]);

export const MatrixHeaders = Object.freeze([
    "Core Theme/Concept",
    "Purpose of Study",
    "Methodology",
    "Key Findings & Contribution",
    "Limitations & Identified Gaps",
    "Critical Appraisal"
]);