export class AIProvider {
    constructor(tabId) {
        this.tabId = tabId;
    }

    async isAvailable() {
        throw new Error("Must implement isAvailable()");
    }

    async generateSummary(_text) {
        throw new Error("Must implement generateSummary()");
    }

    destroy() {
        // Optional cleanup logic can be implemented by subclasses
    }
}