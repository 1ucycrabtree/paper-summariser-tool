import { sendError } from "./utils/messaging.js";
import { ModelFactory } from "./ai/ModelFactory.js";
import { MessageActions } from "./constants.js";

// define LanguageModel to stop no-undef ESLint error
let LanguageModel;

const modelFactory = new ModelFactory(LanguageModel);

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

async function handleGenerateSummary(text, tabId) {
    let provider = null;
    try {
        provider = await modelFactory.createProvider(tabId);
        await provider.generateSummary(text);
    } catch (error) {
        console.error("Error generating summary:", error);
        sendError(tabId, error.message);
    }
    finally {
        if (provider) {
            provider.destroy();
        }
    }
}