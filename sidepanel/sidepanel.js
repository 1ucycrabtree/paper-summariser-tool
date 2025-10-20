import * as pdfjsLib from "../scripts/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "../scripts/pdf.worker.mjs";

let streamingStates = {};
let currentTabId = null;

document.addEventListener("DOMContentLoaded", function () {
    const pageTitleContainer = document.getElementById("pageTitleContainer");
    const summaryOutputDiv = document.getElementById("summaryOutput");

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
                if (!streamingStates[currentTab.id]) {
                    streamingStates[currentTab.id] = { isFirstChunk: true };
                }
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
                    if (!streamingStates[currentTabId]) {
                        streamingStates[currentTabId] = { isFirstChunk: true };
                    }
                } catch (error) {
                    console.error("Error handling tab activation:", error);
                    showError("Error loading tab information");
                }
            });
        }

        if (chrome.tabs?.onUpdated) {
            chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
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
                summaryOutputDiv.innerHTML =
                    state.containerContent || "No content available.";
                if (state.containerState) {
                    summaryOutputDiv.style.display =
                        state.containerState.display || "block";
                }
                if (summarizeButton) {
                    summarizeButton.disabled = state.aiInProgress;
                }
            } else {
                summaryOutputDiv.textContent = "Waiting for user action...";
                if (summarizeButton) summarizeButton.disabled = false;
            }
        } catch (error) {
            console.error("Error loading tab state:", error);
            summaryOutputDiv.textContent = "Waiting for user action...";
            if (summarizeButton) summarizeButton.disabled = false;
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
// const generateMatrixButton = document.getElementById("generateMatrixButton");
const summaryOutputDiv = document.getElementById("summaryOutput");
// const matrixOutputDiv = document.getElementById("matrixOutput");

async function saveSummarySectionState(
    tabId,
    containerContent,
    containerState,
    aiInProgress
) {
    try {
        await chrome.storage.session.set({
            [`state-${tabId}`]: { containerContent, containerState, aiInProgress },
        });
    } catch (error) {
        console.error("Error saving tab state:", error);
    }
}

summarizeButton?.addEventListener("click", async () => {
    if (!summaryOutputDiv) return;
    summaryOutputDiv.textContent = "Analyzing tab...";
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url) {
        summaryOutputDiv.textContent = "Could not get page information.";
        await saveSummarySectionState(tab.id, summaryOutputDiv.innerHTML, {
            display: summaryOutputDiv.style.display,
            aiInProgress: false,
        });
        return;
    }

    const url = tab.url.toLowerCase();
    const title = tab.title ? tab.title.toLowerCase() : "";
    const pdfInUrlRegex = /[./?=]pdf/i;
    const isUrlDirectPdf = url.endsWith(".pdf") || url.startsWith("blob:");
    const isViewerActive = title.endsWith(".pdf");
    const isPdfInUrl = pdfInUrlRegex.test(tab.url);

    if (isUrlDirectPdf || isViewerActive || isPdfInUrl) {
        summaryOutputDiv.textContent = "PDF viewer detected. Downloading file...";
        try {
            const pdfResponse = await fetch(tab.url);
            const pdfBlob = await pdfResponse.blob();
            summaryOutputDiv.textContent = "PDF fetched. Parsing...";
            const parsedText = await parsePdfBlob(pdfBlob);
            summaryOutputDiv.textContent = "Parsing complete. Generating summary...";
            await saveSummarySectionState(tab.id, summaryOutputDiv.innerHTML, {
                display: summaryOutputDiv.style.display,
                aiInProgress: false,
            });
            streamingStates[tab.id] = { isFirstChunk: true };
            chrome.runtime.sendMessage({
                action: "generateSummary",
                file: parsedText,
                tabId: tab.id,
            });
            summaryOutputDiv.textContent = "Generating summary... ";
            const spinner = document.createElement("div");
            spinner.className = "spinner";
            spinner.setAttribute("role", "status");
            spinner.setAttribute("aria-live", "polite");
            summaryOutputDiv.appendChild(spinner);
            if (summarizeButton) summarizeButton.disabled = true;
            await saveSummarySectionState(tab.id, summaryOutputDiv.innerHTML, {
                display: summaryOutputDiv.style.display,
                aiInProgress: true,
            });
        } catch (error) {
            console.error("Failed to fetch or parse PDF:", error);
            summaryOutputDiv.textContent = `Error: ${error.message}`;
        }
        return;
    }

    const identifierResult = await extractPaperIdentifierFromUrl(tab.url, tab.id);
    if (!identifierResult.found) {
        summaryOutputDiv.textContent = `Could not identify a paper on this page. ${identifierResult.message} If you have the PDF open, please ensure the URL ends with ".pdf".`;
        await saveSummarySectionState(tab.id, summaryOutputDiv.innerHTML, {
            display: summaryOutputDiv.style.display,
            aiInProgress: false,
        });
        return;
    }

    summaryOutputDiv.textContent = `Found paper identifier: ${identifierResult.identifier}. Searching for PDF link...`;
    const semanticScholarUrl = `https://api.semanticscholar.org/graph/v1/paper/${identifierResult.identifier}?fields=openAccessPdf`;
    try {
        const ssResponse = await fetch(semanticScholarUrl);
        // TODO: handle rate limiting (429) and other errors
        const ssData = await ssResponse.json();
        const pdfUrl = ssData?.openAccessPdf?.url;
        if (!pdfUrl) {
            throw new Error("No Open Access PDF link found via Semantic Scholar.");
        }
        summaryOutputDiv.innerHTML = "Found a potential PDF link. ";
        const link = document.createElement("a");
        link.href = pdfUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open this link";
        summaryOutputDiv.appendChild(link);
        summaryOutputDiv.appendChild(
            document.createTextNode(
                ' in a new tab. Once the PDF is visible, click the "Analyze Active Tab" button again.'
            )
        );
        await saveSummarySectionState(tab.id, summaryOutputDiv.innerHTML, {
            display: summaryOutputDiv.style.display,
            aiInProgress: false,
        });
    } catch (error) {
        console.error("API call failed:", error);
        summaryOutputDiv.textContent = `Error: ${error.message}`;
        await saveSummarySectionState(tab.id, summaryOutputDiv.innerHTML, {
            display: summaryOutputDiv.style.display,
            aiInProgress: false,
        });
    }
});

async function parsePdfBlob(pdfBlob) {
    try {
        if (summaryOutputDiv) summaryOutputDiv.textContent = "Parsing PDF...";
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
        throw new Error(
            "PDF parsing failed. Make sure the current tab contains a valid PDF."
        );
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

chrome.runtime.onMessage.addListener(async (request) => {
    const { action, tabId } = request;
    if (!tabId) {
        return;
    }
    const result = await chrome.storage.session.get(`state-${tabId}`);
    let state = result[`state-${tabId}`];

    if (!state) {
        state = {
            containerContent: "",
            containerState: { display: "block" },
            aiInProgress: true,
        };
    }

    let tabStreamState = streamingStates[tabId];
    if (!tabStreamState) {
        tabStreamState = { isFirstChunk: true };
        streamingStates[tabId] = tabStreamState;
    }

    let aiInProgress = state.aiInProgress;

    if (action === "finalSummaryChunkReceived") {
        if (tabStreamState.isFirstChunk) {
            state.containerContent = request.chunk;
            tabStreamState.isFirstChunk = false;
        } else {
            state.containerContent += request.chunk;
        }
        aiInProgress = true;
    }

    if (action === "summaryStreamEnded") {
        console.log(`Summary stream finished for tab ${tabId}.`);
        tabStreamState.isFirstChunk = true;
        aiInProgress = false;

        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = state.containerContent;
        const spinner = tempDiv.querySelector(".spinner");
        if (spinner) {
            spinner.remove();
            state.containerContent = tempDiv.innerHTML;
        }
    }

    if (action === "aiError") {
        state.containerContent = `An error occurred: ${request.error}`;
        tabStreamState.isFirstChunk = true;
        aiInProgress = false;
    }

    if (action === "modelDownloadProgress") {
        if (request.progress > 0 && request.progress < 1) {
            state.containerContent = `Model downloading! (this may take a while but will only happen once) ${request.progress * 100
            }%`;
        }
        aiInProgress = true;
    }

    state.aiInProgress = aiInProgress;

    await saveSummarySectionState(
        tabId,
        state.containerContent,
        state.containerState,
        state.aiInProgress
    );

    if (tabId === currentTabId) {
        summaryOutputDiv.innerHTML = state.containerContent;
        if (summarizeButton) {
            summarizeButton.disabled = state.aiInProgress;
        }
    }
});
