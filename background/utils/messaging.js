import { MessageActions } from "../../constants.js";

export function sendError(tabId, error) {
    chrome.runtime.sendMessage({
        action: MessageActions.AI_ERROR,
        error: error,
        tabId: tabId,
    });
}

export function sendDownloadProgress(tabId, progress) {
    chrome.runtime.sendMessage({
        action: MessageActions.MODEL_DOWNLOAD_PROGRESS,
        progress: progress,
        tabId: tabId,
    });
}

export function sendSummaryChunk(tabId, chunk) {
    chrome.runtime.sendMessage({
        action: MessageActions.SUMMARY_CHUNK_RECEIVED,
        chunk: chunk,
        tabId: tabId,
    });
}

export function sendStreamEnded(tabId) {
    chrome.runtime.sendMessage({
        action: MessageActions.SUMMARY_STREAM_ENDED,
        tabId: tabId,
    });
}