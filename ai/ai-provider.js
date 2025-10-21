export class AIProvider {
    constructor(tabId) {
        this.tabId = tabId;
    }

    async isAvailable() {
        throw new Error("Must implement isAvailable()");
    }

    async generateResponse(_text) {
        throw new Error("Must implement generateResponse()");
    }

    destroy() {
        // Optional cleanup logic can be implemented by subclasses
    }
}