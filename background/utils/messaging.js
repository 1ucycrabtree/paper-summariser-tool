import { MessageActions } from "../../constants.js";

export function sendError(tabId, error, section) {
    chrome.runtime.sendMessage({
        action: MessageActions.AI_ERROR,
        error: error,
        tabId: tabId,
        section: section,
    });
}

export function sendDownloadProgress(tabId, progress, section) {
    chrome.runtime.sendMessage({
        action: MessageActions.MODEL_DOWNLOAD_PROGRESS,
        progress: progress,
        tabId: tabId,
        section: section,
    });
}

export function sendChunk(tabId, chunk, section) {
    chrome.runtime.sendMessage({
        action: MessageActions.CHUNK_RECEIVED,
        chunk: chunk,
        tabId: tabId,
        section: section,
    });
}

export function sendSummaryStreamEnded(tabId, section) {
    chrome.runtime.sendMessage({
        action: MessageActions.SUMMARY_STREAM_ENDED,
        tabId: tabId,
        section: section,   
    });
}

export function sendMatrixStreamEnded(tabId, section) {
    chrome.runtime.sendMessage({
        action: MessageActions.MATRIX_STREAM_ENDED,
        tabId: tabId,
        section: section,
    });
}

export function stopEvents(tabId) {
    chrome.runtime.sendMessage({
        action: MessageActions.STOP_AI,
        tabId: tabId,
    });
}
