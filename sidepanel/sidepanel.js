document.addEventListener('DOMContentLoaded', function () {
    const pageTitleContainer = document.getElementById('pageTitleContainer');
    let currentTabId = null;

    init();
    setupTabListeners();

    async function init() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentTab = tabs[0];

            if (currentTab) {
                currentTabId = currentTab.id;
                await displayTabInfo(currentTab);
                await loadTabData(currentTab.id);
            } else {
                showError('Unable to get current page information');
            }
        } catch (error) {
            console.error('Error initializing sidepanel:', error);
            showError('Error initializing sidepanel');
        }
    }

    function setupTabListeners() {
        if (chrome.tabs?.onActivated) {
            chrome.tabs.onActivated.addListener(async (activeInfo) => {
                try {
                    const tab = await chrome.tabs.get(activeInfo.tabId);
                    currentTabId = activeInfo.tabId;

                    await displayTabInfo(tab);
                } catch (error) {
                    console.error('Error handling tab activation:', error);
                    showError('Error loading tab information');
                }
            });
        }

        if (chrome.tabs?.onUpdated) {
            chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
                if (tabId === currentTabId && changeInfo.status === 'complete') {
                    await displayTabInfo(tab);
                }
            });
        }
    }

    async function displayTabInfo(tab) {
        const timestamp = new Date().toLocaleTimeString();

        pageTitleContainer.innerHTML = `
            <div>
                <strong>Title:</strong> ${tab.title}<br>
                <strong>URL:</strong> <span style="font-size: 12px; color: #6c757d;">${tab.url}</span><br>
            </div>
        `;

        await saveTabData(tab.id, {
            title: tab.title,
            url: tab.url,
            lastUpdated: timestamp
        });
    }

    async function loadTabData(tabId) {
        try {
            await chrome.storage.session.get(`tab-${tabId}`);
        } catch (error) {
            console.error('Error loading tab data:', error);
        }
    }

    async function saveTabData(tabId, data) {
        try {
            await chrome.storage.session.set({ [`tab-${tabId}`]: data });
        } catch (error) {
            console.error('Error saving tab data:', error);
        }
    }

    function showError(message) {
        const errorDiv = `<div class="error">${message}</div>`;
        if (pageTitleContainer) {
            pageTitleContainer.innerHTML = errorDiv;
        }
    }
});

document.getElementById('generateSummaryButton').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.scripting.executeScript
        ({
            target: { tabId: tab.id },
            files: ['scripts/content-parser.js']
        }, (injectionResults) => {
            const scrapedText = injectionResults[0].result;
            getSummaryFromGeminiNano(scrapedText);
        });
});

function chunkText(text, maxLength = 20000) {
    // TODO: Improve chunking to split at sentence boundaries or overlaps?
    const chunks = [];
    for (let i = 0; i < text.length; i += maxLength) {
        chunks.push(text.slice(i, i + maxLength));
    }
    return chunks;
}

async function getSummaryFromGeminiNano(text) {
    const outputElement = document.getElementById('outputContainer');
    outputElement.innerText = "Checking summarizer availability...";

    const availability = await Summarizer.availability({
        sharedContext: "Summarize the following article into a critical summary noting the main findings, contributions, and limitations.",
        type: "tldr",
        length: "long",
        format: "markdown",
        expectedInputLanguages: ["en"],
        outputLanguage: "en",
    });
    if (availability === 'unavailable') {
        outputElement.innerText = "Error: The Summarizer API is not available.";
        return;
    }

    try {
        outputElement.innerText = "Splitting article into chunks...";
        const textChunks = chunkText(text);
        outputElement.innerText = `Article split into ${textChunks.length} chunks. Preparing to summarize...`;

        const summarizer = await Summarizer.create({
            sharedContext: "Summarize the following article into a critical summary noting the main findings, contributions, and limitations.",
            type: "tldr",
            length: "long",
            format: "markdown",
            expectedInputLanguages: ["en"],
            outputLanguage: "en",
        });

        outputElement.innerText = `Summarizer is available. Generating summary from ${textChunks.length} chunks...`;

        const chunkSummaryPromises = textChunks.map(chunk => {
            console.log('Inspecting chunk for summarization:', {
                type: typeof chunk,
                content: chunk
            });
            return summarizer.summarize(chunk);
        });

        const chunkSummaries = await Promise.all(chunkSummaryPromises);

        if (chunkSummaries.length > 1) {
            outputElement.innerText = "Creating final summary from chunk summaries...";
            const combinedSummaries = chunkSummaries.join("\n\n---\n\n");

            console.log('Inspecting combined text for final summary:', {
                type: typeof combinedSummaries,
                content: combinedSummaries
            });
            const finalSummary = await summarizer.summarize(combinedSummaries);
            outputElement.innerText = finalSummary;
        } else {
            outputElement.innerText = chunkSummaries[0];
        }

    } catch (error) {
        console.error("Error during summarization process:", error.name, error.message);
        outputElement.innerText = `An error occurred: ${error.name}`;
    }
}