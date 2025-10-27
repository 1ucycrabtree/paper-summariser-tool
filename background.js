import { sendError , stopEvents} from "./background/utils/messaging.js";
import { ModelFactory } from "./background/ai/model-factory.js";
import { MessageActions, Sections } from "./constants.js";

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

chrome.runtime.onMessage.addListener(async (request) => {
    if (request.action === MessageActions.GENERATE_SUMMARY) {
        await handleResponse(request.file, request.tabId, Sections.SUMMARY);
        return true;
    }
});

chrome.runtime.onMessage.addListener(async (request) => {
    if (request.action === MessageActions.GENERATE_MATRIX) {
        await handleResponse(request.file, request.tabId, Sections.MATRIX);
        return true;
    }
});

chrome.runtime.onMessage.addListener(async (request) => {
    if (request.action === MessageActions.STOP_AI) {
        console.log(`Received stop AI request for tab ${request.tabId}`);
        stopEvents(request.tabId);
        await modelFactory.destroyProviderForTab(request.tabId);
        return true;
    }
});

async function handleResponse(text, tabId, section) {
    let provider = null;
    try {
        provider = await modelFactory.createProvider(tabId, section);
        await provider.generateResponse(text, section);
    } catch (error) {
        if (error.message === "AI generation stopped by user.") {
            console.log(`AI process for tab ${tabId} was stopped as requested.`);
        } else {
            console.error("Error generating response:", error);
            sendError(tabId, error.message, section);
        }
    } finally {
        if (provider) {
            provider.destroy();
            modelFactory.providersByTab.delete(tabId);
        }
    }
}