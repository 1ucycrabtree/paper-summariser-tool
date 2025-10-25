import * as pdfjsLib from "../scripts/pdf.mjs";
import { MessageActions, Sections } from "../constants.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "../scripts/pdf.worker.mjs";

const summarizeButton = document.getElementById("summarizeButton");
const generateMatrixButton = document.getElementById("generateMatrixButton");
const summaryOutputDiv = document.getElementById("summaryOutput");
const matrixOutputDiv = document.getElementById("matrixOutput");

let streamingStates = {};
let currentTabId = null;

const pdfCache = {};
const pdfParsePromises = {};

document.addEventListener("DOMContentLoaded", function () {
    const pageTitleContainer = document.getElementById("pageTitleContainer");

    init();
    setupTabListeners();

    const apiForm = document.getElementById("api-key-form");
    const apiInput = document.getElementById("api-key-input");
    const apiStatus = document.getElementById("api-key-status");

    if (chrome?.storage?.local && apiInput && apiStatus) {
        chrome.storage.local.get(["geminiApiKey"], (result) => {
            if (result.geminiApiKey) {
                apiInput.value = result.geminiApiKey;
                apiStatus.textContent = "API key loaded from local storage.";
                setApiKeyFormVisibility(false);
            } else {
                apiStatus.textContent = "Please enter your Gemini API key.";
                setApiKeyFormVisibility(true);
            }
            setupApiKeyFormToggle();
        });
    }

    function setApiKeyFormVisibility(visible) {
        const form = document.getElementById("api-key-form");
        const arrow = document.getElementById("api-toggle-arrow");
        if (!form || !arrow) return;
        form.style.display = visible ? "flex" : "none";
        form.dataset.visible = visible ? "true" : "false";
        arrow.textContent = visible ? "▼" : "▶";
    }

    function setupApiKeyFormToggle() {
        const toggle = document.getElementById("api-config-toggle");
        const form = document.getElementById("api-key-form");
        if (!toggle || !form) return;
        toggle.addEventListener("click", () => {
            const currentlyVisible = form.dataset.visible === "true";
            setApiKeyFormVisibility(!currentlyVisible);
        });
    }

    if (apiForm) {
        apiForm.addEventListener("submit", (event) => {
            event.preventDefault();
            const apiKey = apiInput?.value?.trim();
            if (!chrome?.storage?.local) {
                apiStatus.textContent = "Storage API unavailable.";
                return;
            }
            if (apiKey) {
                chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
                    if (chrome.runtime.lastError) {
                        apiStatus.textContent = "Error saving API key.";
                        console.error("Error saving Gemini API key:", chrome.runtime.lastError);
                    } else {
                        apiStatus.textContent = "API key saved.";
                        setApiKeyFormVisibility(false);
                    }
                });
            } else {
                apiStatus.textContent = "API key cannot be empty.";
            }
        });
    }

    // show/hide API key checkbox handler
    const toggleCheckbox = document.getElementById("toggle-api-key-visibility");
    if (toggleCheckbox) {
        toggleCheckbox.addEventListener("change", function () {
            const apiKeyInput = document.getElementById("api-key-input");
            if (!apiKeyInput) return;
            if (this.checked) {
                apiKeyInput.type = "text";
                apiKeyInput.focus();
            } else {
                apiKeyInput.type = "password";
            }
        });
    }

    async function init() {
        try {
            if (!chrome?.tabs) {
                showError("Chrome tabs API unavailable.");
                return;
            }
            const tabs = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            const currentTab = tabs[0];

            if (currentTab) {
                currentTabId = currentTab.id;
                await loadTabState(currentTab.id);
                streamingStates[currentTab.id] = streamingStates[currentTab.id] || {};
                streamingStates[currentTab.id][Sections.SUMMARY] = streamingStates[currentTab.id][Sections.SUMMARY] || { isFirstChunk: true };
                streamingStates[currentTab.id][Sections.MATRIX] = streamingStates[currentTab.id][Sections.MATRIX] || { isFirstChunk: true };
            } else {
                showError("Unable to get current page information");
            }
        } catch (error) {
            console.error("Error initializing sidepanel:", error);
            showError("Error initializing sidepanel");
        }
    }

    function setupTabListeners() {
        if (chrome?.tabs?.onActivated) {
            chrome.tabs.onActivated.addListener(async (activeInfo) => {
                try {
                    const tab = await chrome.tabs.get(activeInfo.tabId);
                    currentTabId = activeInfo.tabId;
                    await loadTabState(tab.id);
                    streamingStates[currentTabId] = streamingStates[currentTabId] || {};
                    streamingStates[currentTabId][Sections.SUMMARY] = streamingStates[currentTabId][Sections.SUMMARY] || { isFirstChunk: true };
                    streamingStates[currentTabId][Sections.MATRIX] = streamingStates[currentTabId][Sections.MATRIX] || { isFirstChunk: true };
                } catch (error) {
                    console.error("Error handling tab activation:", error);
                    showError("Error loading tab information");
                }
            });
        }

        if (chrome?.tabs?.onUpdated) {
            chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
                if (tabId === currentTabId && changeInfo.status === "complete") {
                    await loadTabState(tabId);
                }
            });
        }
    }

    function showError(message) {
        const errorDiv = `<div class="error">${message}</div>`;
        if (pageTitleContainer) {
            pageTitleContainer.innerHTML = errorDiv;
        }
    }
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

async function saveSectionState(tabId, sectionKey, containerContent, containerState, aiInProgress) {
    try {
        await chrome.storage.session.set({
            [`state-${tabId}-${sectionKey}`]: { containerContent, containerState, aiInProgress },
        });
    } catch (error) {
        console.error("Error saving tab state:", error);
    }
}

async function getOrParsePdf(tabUrl, tabId, outputDiv) {
    if (pdfCache[tabId]) {
        return pdfCache[tabId];
    }
    if (pdfParsePromises[tabId]) {
        return pdfParsePromises[tabId];
    }
    const promise = (async () => {
        try {
            if (outputDiv) outputDiv.textContent = "PDF viewer detected. Downloading file...";
            const pdfResponse = await fetch(tabUrl);
            const pdfBlob = await pdfResponse.blob();
            if (outputDiv) outputDiv.textContent = "PDF fetched. Parsing...";
            const parsedText = await parsePdfBlob(pdfBlob, outputDiv);
            pdfCache[tabId] = parsedText;
            return parsedText;
        } finally {
            delete pdfParsePromises[tabId];
        }
    })();
    pdfParsePromises[tabId] = promise;
    return promise;
}

async function handleAnalyzeAction(sectionKey, outputDiv, button, messageAction) {
    if (!outputDiv) return;
    outputDiv.textContent = "Analyzing tab...";
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url) {
        outputDiv.textContent = "Could not get page information.";
        await saveSectionState(tab?.id, sectionKey, outputDiv.innerHTML, {
            display: outputDiv.style.display,
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
        try {
            const parsedText = await getOrParsePdf(tab.url, tab.id, outputDiv);
            outputDiv.textContent = "Parsing complete. Generating result...";
            await saveSectionState(tab.id, sectionKey, outputDiv.innerHTML, {
                display: outputDiv.style.display,
                aiInProgress: false,
            });
            streamingStates[tab.id] = streamingStates[tab.id] || {};
            streamingStates[tab.id][sectionKey] = { isFirstChunk: true };
            chrome.runtime.sendMessage({
                action: messageAction,
                file: parsedText,
                tabId: tab.id,
                section: sectionKey,
            });
            outputDiv.textContent = messageAction === MessageActions.GENERATE_SUMMARY ? "Generating summary... " : "Generating matrix... ";
            const spinner = document.createElement("div");
            spinner.className = "spinner";
            spinner.setAttribute("role", "status");
            spinner.setAttribute("aria-live", "polite");
            outputDiv.appendChild(spinner);
            if (button) button.disabled = true;
            await saveSectionState(tab.id, sectionKey, outputDiv.innerHTML, {
                display: outputDiv.style.display,
                aiInProgress: true,
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
        await saveSectionState(tab.id, sectionKey, outputDiv.innerHTML, {
            display: outputDiv.style.display,
            aiInProgress: false,
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
        await saveSectionState(tab.id, sectionKey, outputDiv.innerHTML, {
            display: outputDiv.style.display,
            aiInProgress: false,
        });
    } catch (error) {
        console.error("API call failed:", error);
        outputDiv.textContent = `Error: ${error.message}`;
        await saveSectionState(tab.id, sectionKey, outputDiv.innerHTML, {
            display: outputDiv.style.display,
            aiInProgress: false,
        });
    }
}

summarizeButton?.addEventListener("click", async () => {
    await handleAnalyzeAction(Sections.SUMMARY, summaryOutputDiv, summarizeButton, MessageActions.GENERATE_SUMMARY);
});

generateMatrixButton?.addEventListener("click", async () => {
    const researchTopicInput = document.getElementById("researchTopicInput");
    const researchTopic = researchTopicInput ? researchTopicInput.value.trim() : "";
    if (chrome?.storage?.session && currentTabId) {
        await chrome.storage.session.set({ [`researchTopic-${currentTabId}`]: researchTopic });
    }
    await handleAnalyzeAction(Sections.MATRIX, matrixOutputDiv, generateMatrixButton, MessageActions.GENERATE_MATRIX);
});

async function loadTabState(tabId) {
    if (!chrome?.storage?.session) {
        setDefaultUIState();
        return;
    }

    const sectionKeys = Object.values(Sections);
    await Promise.all(sectionKeys.map(sectionKey => loadSectionState(tabId, sectionKey)));
}

function setDefaultUIState() {
    for (const div of [summaryOutputDiv, matrixOutputDiv]) {
        if (div) div.textContent = "Waiting for user action...";
    }
    for (const btn of [summarizeButton, generateMatrixButton]) {
        if (btn) btn.disabled = false;
    }
}

async function loadSectionState(tabId, sectionKey) {
    const isMatrix = sectionKey === Sections.MATRIX;
    const storageKey = `state-${tabId}-${sectionKey}`;
    const outputDiv = isMatrix ? matrixOutputDiv : summaryOutputDiv;
    const button = isMatrix ? generateMatrixButton : summarizeButton;

    try {
        const result = await chrome.storage.session.get(storageKey);
        const state = result[storageKey];

        if (state) {
            updateOutputDiv(outputDiv, state);
            if (button) button.disabled = Boolean(state.aiInProgress);
        } else {
            setWaitingState(outputDiv, button);
        }
    } catch (error) {
        console.error(`Error loading ${sectionKey} state:`, error);
        setWaitingState(outputDiv, button);
    }
}

function updateOutputDiv(outputDiv, state) {
    if (outputDiv) {
        outputDiv.innerHTML = state.containerContent || "No content available.";
        if (state.containerState && state.containerState.display !== undefined) {
            outputDiv.style.display = state.containerState.display || "block";
        }
    }
}

function setWaitingState(outputDiv, button) {
    if (outputDiv) outputDiv.textContent = "Waiting for user action...";
    if (button) button.disabled = false;
}

chrome.runtime.onMessage.addListener(async (request) => {
    const { action, tabId } = request;
    if (!tabId) return;
    
    if (request.section === undefined) {
        throw new Error("Section key missing in message");
    }
    const sectionKey = request.section;
    const storageKey = `state-${tabId}-${sectionKey}`;
    const result = await chrome.storage.session.get(storageKey);
    let state = result[storageKey] || {
        containerContent: "",
        containerState: { display: "block" },
        aiInProgress: true,
    };

    const tabStreams = streamingStates[tabId] = streamingStates[tabId] || {};
    let tabStreamState = tabStreams[sectionKey] || { isFirstChunk: true };
    tabStreams[sectionKey] = tabStreamState;

    let aiInProgress = state.aiInProgress;

    switch (action) {
    case MessageActions.CHUNK_RECEIVED:
        ({ state, aiInProgress } = handleChunkReceived(request, state, tabStreamState));
        break;
    case MessageActions.MATRIX_STREAM_ENDED:
        ({ state, aiInProgress } = handleMatrixStreamEnded(state, tabStreamState, tabId));
        break;
    case MessageActions.SUMMARY_STREAM_ENDED:
        ({ state, aiInProgress } = handleSummaryStreamEnded(state, tabStreamState, tabId));
        break;
    case MessageActions.AI_ERROR:
        ({ state, aiInProgress } = handleAiError(request, state, tabStreamState));
        break;
    case MessageActions.MODEL_DOWNLOAD_PROGRESS:
        ({ state, aiInProgress } = handleModelDownloadProgress(request, state));
        break;
    default:
        break;
    }

    state.aiInProgress = aiInProgress;
    await saveSectionState(tabId, sectionKey, state.containerContent, state.containerState, state.aiInProgress);

    if (tabId === currentTabId) {
        const text = state.containerContent || "";
        if (sectionKey === Sections.MATRIX && matrixOutputDiv) {
            matrixOutputDiv.innerHTML = text;
            if (generateMatrixButton) generateMatrixButton.disabled = state.aiInProgress;
        } else if (summaryOutputDiv) {
            summaryOutputDiv.innerHTML = text;
            if (summarizeButton) summarizeButton.disabled = state.aiInProgress;
        }
    }
});

function handleChunkReceived(request, state, tabStreamState) {
    if (tabStreamState.isFirstChunk) {
        state.containerContent = request.chunk; 
        tabStreamState.isFirstChunk = false;
    } else {
        state.containerContent += request.chunk;
    }
    return { state, aiInProgress: true };
}

function handleSummaryStreamEnded(state, tabStreamState, tabId) {
    console.log(`Summary stream finished for tab ${tabId}.`);
    tabStreamState.isFirstChunk = true;
    let aiInProgress = false;

    state = removeSpinnerFromContent(state);
    return { state, aiInProgress };
}

function handleMatrixStreamEnded(state, tabStreamState, tabId) {
    console.log(`Matrix stream finished for tab ${tabId}.`);
    tabStreamState.isFirstChunk = true;
    let aiInProgress = false;

    state = removeSpinnerFromContent(state);

    // convert the matrix text content into a table format
    const text = state.containerContent || "";
    const rows = [];
    const lines = text.split(/\n|(?<=\.)\s+(?=[A-Z])/).map(line => line.trim()).filter(Boolean);

    for (const line of lines) {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
            const key = line.slice(0, colonIdx).trim();
            const value = line.slice(colonIdx + 1).trim();
            rows.push([key, value]);
        }
    }

    const table = document.createElement("table");
    table.className = "matrix-table";
    const tbody = document.createElement("tbody");
    for (const [key, value] of rows) {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = key;
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(th);
        tr.appendChild(td);
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    const safeDiv = document.createElement("div");
    safeDiv.appendChild(table);
    state.containerContent = safeDiv.innerHTML;
    
    return { state, aiInProgress };

}

function removeSpinnerFromContent(state) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = state.containerContent;
    const spinner = tempDiv.querySelector(".spinner");
    if (spinner) {
        spinner.remove();
        state.containerContent = tempDiv.innerHTML;
    }
    return state;
}

function handleAiError(request, state, tabStreamState) {
    state.containerContent = `An error occurred: ${request.error}`;
    tabStreamState.isFirstChunk = true;
    return { state, aiInProgress: false };
}

function handleModelDownloadProgress(request, state) {
    if (request.progress > 0 && request.progress < 1) {
        state.containerContent = `Model downloading! (this may take a while but will only happen once) ${request.progress * 100}%`;
    }
    return { state, aiInProgress: true };
}

async function parsePdfBlob(pdfBlob, outputDiv) {
    try {
        if (outputDiv) outputDiv.textContent = "Parsing PDF...";
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
