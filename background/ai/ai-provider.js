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
        // optional cleanup logic
    }
}