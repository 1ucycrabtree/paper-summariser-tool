import { Models } from "../constants.js";
import { getUserHardwareSpecs } from "../utils/hardware.js";
import { PromptProvider } from "./PromptProvider.js";
import { GeminiProvider } from "./GeminiProvider.js";

export class ModelFactory {
    constructor(LanguageModel) {
        this.LanguageModel = LanguageModel;
    }

    async determineModelType() {
        const { sufficientHardware, vramGB } = await getUserHardwareSpecs();

        if (sufficientHardware) {
            console.log(
                `Sufficient GPU VRAM detected (${vramGB.toFixed(2)} GB). Using local LanguageModel.`
            );
            return Models.LOCAL;
        } else {
            console.warn(
                `Insufficient GPU VRAM (${vramGB.toFixed(2)} GB). Falling back to Gemini dev API.`
            );
            return Models.API;
        }
    }

    async createProvider(tabId, modelType = null) {
        if (!modelType) {
            modelType = await this.determineModelType();
        }

        if (modelType === Models.LOCAL) {
            const provider = new PromptProvider(tabId, this.LanguageModel);
            const available = await provider.isAvailable();
            
            if (!available) {
                console.warn("LanguageModel unavailable, falling back to Gemini");
                return this._createGeminiProvider(tabId);
            }
            
            return provider;
        } else {
            return this._createGeminiProvider(tabId);
        }
    }

    async _createGeminiProvider(tabId) {
        const result = await chrome.storage.local.get("geminiApiKey");
        const apiKey = result.geminiApiKey;

        if (!apiKey) {
            throw new Error("Gemini API key not set.");
        }

        return new GeminiProvider(tabId, apiKey);
    }
}