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

export function sendSummaryChunk(tabId, chunk, section) {
    chrome.runtime.sendMessage({
        action: MessageActions.SUMMARY_CHUNK_RECEIVED,
        chunk: chunk,
        tabId: tabId,
        section: section,
    });
}

export function sendStreamEnded(tabId, section) {
    chrome.runtime.sendMessage({
        action: MessageActions.SUMMARY_STREAM_ENDED,
        tabId: tabId,
        section: section,   
    });
}