import { Models, Sections } from "../../constants.js";
import { getUserHardwareSpecs } from "../utils/hardware.js";
import { GeminiProvider } from "./gemini-provider.js";
import { PromptProvider } from "./prompt-provider.js";
import { SummaryProvider } from "./summary-provider.js";

export class ModelFactory {
    constructor() {
        this.providersByTab = new Map();
    }
    // determine whether to use Local AI or Gemini Developer API based on hardware specs
    async determineModelType() {
        const { sufficientHardware, vramGB } = await getUserHardwareSpecs();
        if (sufficientHardware) {
            console.log(
                `Sufficient GPU VRAM detected (${vramGB.toFixed(2)} GB). Using local APIs.`
            );
            return Models.LOCAL;
        } else {
            console.warn(
                `Insufficient GPU VRAM (${vramGB.toFixed(2)} GB). Falling back to Gemini dev API.`
            );
            return Models.API;
        }
    }

    async createProvider(tabId, modelPurpose = null) {
        if (!this.providersByTab.has(tabId)) {
            this.providersByTab.set(tabId, new Map());
        }

        const providersForTab = this.providersByTab.get(tabId);

        if (providersForTab.has(modelPurpose)) {
            return providersForTab.get(modelPurpose);
        }

        const modelType = Models.REMOTE; //await this.determineModelType();

        let ProviderClass;
        if (modelPurpose === Sections.SUMMARY) {
            ProviderClass = SummaryProvider;
            console.log("Creating SummaryProvider...");
        } else if (modelPurpose === Sections.MATRIX) {
            ProviderClass = PromptProvider;
            console.log("Creating PromptProvider...");
        } else {
            throw new Error(`Unknown model purpose: ${modelPurpose}`);
        }

        let provider;
        if (modelType === Models.LOCAL) {
            provider = new ProviderClass(tabId);
            if (await provider.isAvailable()) {
                return provider;
            }
            console.warn(`${ProviderClass.name} unavailable, falling back to Gemini`);
            provider = await this.createGeminiProvider(tabId, modelPurpose);
        }
        else {
            provider = await this.createGeminiProvider(tabId, modelPurpose);
        }
        providersForTab.set(modelPurpose, provider);
        return provider;
    }

    async createGeminiProvider(tabId, modelPurpose) {
        const keyResult = await chrome.storage.session.get("geminiApiKey");
        const apiKey = keyResult.geminiApiKey;

        if (!apiKey) {
            throw new Error("Gemini API key not set.");
        }

        const topicKey = `researchTopic-${tabId}`;
        const topicResult = await chrome.storage.session.get(topicKey);
        const researchTopic = topicResult[topicKey] || "";

        console.log("Creating GeminiProvider...");
        return new GeminiProvider(tabId, apiKey, modelPurpose, researchTopic);
    }

    async destroyProviderForTab(tabId) {
        if (this.providersByTab.has(tabId)) {
            const providersForTab = this.providersByTab.get(tabId);
            for (const provider of providersForTab.values()) {
                if (provider && typeof provider.destroy === "function") {
                    await provider.destroy();
                }
            }
            this.providersByTab.delete(tabId);
            console.log(`Destroyed providers for tab ${tabId}`);
        }
    }
}