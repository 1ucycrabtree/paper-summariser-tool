import * as pdfjsLib from "../scripts/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "../scripts/pdf.worker.mjs";

document.addEventListener("DOMContentLoaded", function () {
    const pageTitleContainer = document.getElementById("pageTitleContainer");
    const outputDiv = document.getElementById("output");
    let currentTabId = null;

    init();
    setupTabListeners();

    async function init() {
        try {
            const tabs = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            const currentTab = tabs[0];

            if (currentTab) {
                currentTabId = currentTab.id;
                await loadSummarySectionState(currentTab.id);
            } else {
                showError("Unable to get current page information");
            }
        } catch (error) {
            console.error("Error initializing sidepanel:", error);
            showError("Error initializing sidepanel");
        }
    }

    function setupTabListeners() {
        if (chrome.tabs?.onActivated) {
            chrome.tabs.onActivated.addListener(async (activeInfo) => {
                try {
                    const tab = await chrome.tabs.get(activeInfo.tabId);
                    currentTabId = activeInfo.tabId;
                    await loadSummarySectionState(tab.id);
                } catch (error) {
                    console.error("Error handling tab activation:", error);
                    showError("Error loading tab information");
                }
            });
        }

        if (chrome.tabs?.onUpdated) {
            chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
                if (tabId === currentTabId && changeInfo.status === "complete") {
                    await loadSummarySectionState(tabId);
                }
            });
        }
    }

    async function loadSummarySectionState(tabId) {
        try {
            const result = await chrome.storage.session.get(`state-${tabId}`);
            const state = result[`state-${tabId}`];
            if (state) {
                outputDiv.innerHTML = state.containerContent || "No content available.";
                if (state.containerState) {
                    outputDiv.style.display = state.containerState.display || "block";
                }
            } else {
                outputDiv.textContent = "Waiting for user action...";
            }
        } catch (error) {
            console.error("Error loading tab state:", error);
            outputDiv.textContent = "Waiting for user action...";
        }
    }

    function showError(message) {
        const errorDiv = `<div class="error">${message}</div>`;
        if (pageTitleContainer) {
            pageTitleContainer.innerHTML = errorDiv;
        }
    }
});

document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("api-key-form");
    const input = document.getElementById("api-key-input");
    const status = document.getElementById("api-key-status");

    chrome.storage.local.get(["geminiApiKey"], (result) => {
        if (result.geminiApiKey) {
            input.value = result.geminiApiKey;
            status.textContent = "API key loaded from local storage.";
            setApiKeyFormVisibility(false);
        } else {
            status.textContent = "Please enter your Gemini API key.";
            setApiKeyFormVisibility(true);
        }
        setupApiKeyFormToggle();
    });

    function setApiKeyFormVisibility(visible) {
        const form = document.getElementById("api-key-form");
        const arrow = document.getElementById("api-toggle-arrow");
        form.style.display = visible ? "flex" : "none";
        form.dataset.visible = visible ? "true" : "false";
        arrow.textContent = visible ? "▼" : "▶";
    }

    function setupApiKeyFormToggle() {
        const toggle = document.getElementById("api-config-toggle");
        const form = document.getElementById("api-key-form");
        toggle.addEventListener("click", () => {
            const currentlyVisible = form.dataset.visible === "true";
            setApiKeyFormVisibility(!currentlyVisible);
        });
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const apiKey = input.value.trim();
        if (apiKey) {
            chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
                if (chrome.runtime.lastError) {
                    status.textContent = "Error saving API key.";
                    console.error(
                        "Error saving Gemini API key:",
                        chrome.runtime.lastError
                    );
                } else {
                    status.textContent = "API key saved.";
                    console.log("Gemini API key saved.");
                    setApiKeyFormVisibility(false);
                }
            });
        } else {
            status.textContent = "API key cannot be empty.";
            console.log("API key cannot be empty.");
        }
    });
});

// listen to show/hide API key checkbox
document
    .getElementById("toggle-api-key-visibility")
    .addEventListener("change", function () {
        const apiKeyInput = document.getElementById("api-key-input");
        if (this.checked) {
            apiKeyInput.type = "text";
            apiKeyInput.focus();
        } else {
            apiKeyInput.type = "password";
        }
    });

const summarizeButton = document.getElementById("summarizeButton");
const outputDiv = document.getElementById("output");

async function saveSummarySectionState(
    tabId,
    containerContent,
    containerState
) {
    try {
        await chrome.storage.session.set({
            [`state-${tabId}`]: { containerContent, containerState },
        });
    } catch (error) {
        console.error("Error saving tab state:", error);
    }
}

summarizeButton.addEventListener("click", async () => {
    outputDiv.textContent = "Analyzing tab...";
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url) {
        outputDiv.textContent = "Could not get page information.";
        await saveSummarySectionState(tab.id, outputDiv.innerHTML, {
            display: outputDiv.style.display,
        });
        return;
    }

    const url = tab.url.toLowerCase();
    const title = tab.title ? tab.title.toLowerCase() : "";

    // flexible regex to find "pdf" in the URL path or query string (it looks for /pdf, .pdf, ?pdf, or =pdf)
    const pdfInUrlRegex = /[./?=]pdf/i;

    const isUrlDirectPdf = url.endsWith(".pdf") || url.startsWith("blob:");
    const isViewerActive = title.endsWith(".pdf");
    const isPdfInUrl = pdfInUrlRegex.test(tab.url);

    if (isUrlDirectPdf || isViewerActive || isPdfInUrl) {
        outputDiv.textContent = "PDF viewer detected. Downloading file...";

        try {
            const pdfResponse = await fetch(tab.url);
            const pdfBlob = await pdfResponse.blob();
            outputDiv.textContent = "PDF fetched. Parsing...";
            const parsedText = await parsePdfBlob(pdfBlob);

            outputDiv.textContent = "Parsing complete. Generating summary...";
            await saveSummarySectionState(tab.id, outputDiv.innerHTML, {
                display: outputDiv.style.display,
            });

            chrome.runtime.sendMessage({
                action: "generateSummary",
                file: parsedText,
                tabId: tab.id,
            });
        } catch (error) {
            console.error("Failed to fetch or parse PDF:", error);
            outputDiv.textContent = `Error: ${error.message}`;
        }
        return;
    }

    const identifierResult = await extractPaperIdentifierFromUrl(tab.url, tab.id);
    if (!identifierResult.found) {
        outputDiv.textContent = `Could not identify a paper on this page. ${identifierResult.message} If you have the PDF open, please ensure the URL ends with ".pdf".`;
        await saveSummarySectionState(tab.id, outputDiv.innerHTML, {
            display: outputDiv.style.display,
        });
        return;
    }

    outputDiv.textContent = `Found paper identifier: ${identifierResult.identifier}. Searching for PDF link...`;
    const semanticScholarUrl = `https://api.semanticscholar.org/graph/v1/paper/${identifierResult.identifier}?fields=openAccessPdf`;
    try {
        const ssResponse = await fetch(semanticScholarUrl);
        // TODO: handle rate limiting (429) and other errors
        const ssData = await ssResponse.json();
        const pdfUrl = ssData?.openAccessPdf?.url;

        if (!pdfUrl) {
            throw new Error("No Open Access PDF link found via Semantic Scholar.");
        }

        // sanitize url
        outputDiv.innerHTML = "Found a potential PDF link. ";
        const link = document.createElement("a");
        link.href = pdfUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open this link";
        outputDiv.appendChild(link);
        outputDiv.appendChild(
            document.createTextNode(
                ' in a new tab. Once the PDF is visible, click the "Analyze Active Tab" button again.'
            )
        );

        await saveSummarySectionState(tab.id, outputDiv.innerHTML, {
            display: outputDiv.style.display,
        });
    } catch (error) {
        console.error("API call failed:", error);
        outputDiv.textContent = `Error: ${error.message}`;
        await saveSummarySectionState(tab.id, outputDiv.innerHTML, {
            display: outputDiv.style.display,
        });
    }
});

async function parsePdfBlob(pdfBlob) {
    try {
        outputDiv.textContent = "Parsing PDF...";
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const typedArray = new Uint8Array(arrayBuffer);

        const pdf = await pdfjsLib.getDocument(typedArray).promise;
        const pagePromises = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            pagePromises.push(pdf.getPage(i).then((page) => page.getTextContent()));
        }
        const textContents = await Promise.all(pagePromises);
        const allText = textContents
            .map((textContent) => textContent.items.map((item) => item.str).join(" "))
            .join(" ");
        return allText;
    } catch (error) {
        console.error("PDF parsing failed:", error);
        throw new Error("PDF parsing failed. Make sure the current tab contains a valid PDF.");
    }
}

async function extractPaperIdentifierFromUrl(url, tabId) {
    const doiRegex = /10\.\d{4,9}\/[^\s]+/i;

    let identifier = null;

    const doiMatch = url.match(doiRegex);
    if (doiMatch) {
        identifier = "DOI:" + doiMatch[0];
        return { identifier, found: true, message: "DOI found in URL." };
    } else if (
        /(semanticscholar\.org|arxiv\.org|aclweb\.org|acm\.org|biorxiv\.org)/i.test(
            url
        )
    ) {
        identifier = "URL:" + url;
        return {
            identifier,
            found: true,
            message: "Accepted website found in URL.",
        };
    } else {
        try {
            const hrefArray = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ["scripts/content.js"],
            });

            if (hrefArray && hrefArray.length > 0 && hrefArray[0].result) {
                const href = hrefArray[0].result;
                console.log("Content script found link:", href);
                const linkDoiMatch = href.match(doiRegex);
                if (linkDoiMatch) {
                    identifier = "DOI:" + linkDoiMatch[0];
                    return {
                        identifier,
                        found: true,
                        message: "DOI found in page links.",
                    };
                }
            } else {
                console.log("Content script did not find a DOI link.");
            }
        } catch (error) {
            console.error("Error executing content script:", error);
            return {
                identifier: null,
                found: false,
                message: "Error executing content script.",
            };
        }
    }
    if (identifier) {
        return { identifier, found: true, message: "Identifier found." };
    } else {
        return {
            identifier: null,
            found: false,
            message: "No identifier found in URL or page links.",
        };
    }
}

let isFirstChunk = true;

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === "summaryChunkReceived") {
        if (isFirstChunk) {
            outputDiv.textContent = "";
            isFirstChunk = false;
        }
        outputDiv.textContent = request.chunk;
    }

    if (request.action === "finalSummaryChunkReceived") {
        if (isFirstChunk) {
            outputDiv.textContent = "";
            isFirstChunk = false;
        }

        outputDiv.textContent += request.chunk;
    }

    if (request.action === "summaryStreamEnded") {
        console.log("Summary stream finished.");
        isFirstChunk = true;
    }
    if (request.action === "aiError") {
        outputDiv.textContent = `An error occurred: ${request.error}`;
        isFirstChunk = true;
    }

    if (request.action === "modelDownloadProgress") {
        outputDiv.textContent = `Model downloading! (this may take a while but will only happen once) ${request.progress * 100}%`;
    }

    await saveSummarySectionState(sender.tab?.id, outputDiv.innerHTML, {
        display: outputDiv.style.display,
    });
});
