import { sendError } from "./utils/messaging.js";
import { ModelFactory } from "./ai/model-factory.js";
import { MessageActions } from "./constants.js";

const modelFactory = new ModelFactory();

chrome.action.onClicked.addListener(async (tab) => {
    if (chrome.sidePanel && typeof chrome.sidePanel.open === "function") {
        try {
            await chrome.sidePanel.open({ tabId: tab.id });
        } catch (error) {
            console.error("Failed to open side panel:", error);
        }
    } else {
        console.warn(
            "chrome.sidePanel.open is not available in this Chrome version or context."
        );
    }
});

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === MessageActions.GENERATE_SUMMARY) {
        handleGenerateSummary(request.file, request.tabId);
        return true;
    }
});

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === MessageActions.GENERATE_MATRIX) {
        handleGenerateMatrix(request.file, request.tabId);
        return true;
    }
});

async function handleGenerateSummary(text, tabId) {
    let provider = null;
    try {
        provider = await modelFactory.createProvider(tabId,);
        await provider.generateResponse(text);
    } catch (error) {
        console.error("Error generating response:", error);
        sendError(tabId, error.message);
    }
    finally {
        if (provider) {
            provider.destroy();
        }
    }
}