import * as pdfjsLib from '../scripts/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../scripts/pdf.worker.mjs';

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

document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('api-key-form');
    const input = document.getElementById('api-key-input');
    const status = document.getElementById('api-key-status');

    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (result.geminiApiKey) {
            input.value = result.geminiApiKey;
            status.textContent = 'API Key loaded.';
        } else {
            status.textContent = 'Please enter your Gemini API Key.';
        }
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const apiKey = input.value.trim();
        if (apiKey) {
            chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
                if (chrome.runtime.lastError) {
                    status.textContent = 'Error saving API Key.';
                    console.error('Error saving Gemini API Key:', chrome.runtime.lastError);
                } else {
                    status.textContent = 'API Key saved.';
                    console.log('Gemini API Key saved.');
                }
            });
        } else {
            status.textContent = 'API Key cannot be empty.';
            console.log('API Key cannot be empty.');
        }
    });
});
const summarizeButton = document.getElementById('summarizeButton');
const outputDiv = document.getElementById('output');

async function parsePdfBlob(pdfBlob) {
    try {
        outputDiv.textContent = 'Parsing PDF...';
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const typedArray = new Uint8Array(arrayBuffer);

        const pdf = await pdfjsLib.getDocument(typedArray).promise;
        // Parallelize page text extraction for better performance
        const pagePromises = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            pagePromises.push(pdf.getPage(i).then(page => page.getTextContent()));
        }
        const textContents = await Promise.all(pagePromises);
        const allText = textContents
            .map(textContent => textContent.items.map(item => item.str).join(' '))
            .join(' ');

        outputDiv.textContent = allText;

    } catch (error) {
        console.error("PDF parsing failed:", error);
        outputDiv.textContent = `Error: ${error.message}. Make sure the current tab contains a valid PDF.`;
    }
}

function getPaperIdentifier(url) {
    // TODO: expand to fetch doi from page metadata if not in URL
    let identifier = null;
    const doiMatch = url.match(/(10.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
    if (doiMatch) {
        identifier = "DOI:" + doiMatch[1];
    } else if (url.includes("semanticscholar.org/paper/")) {
        const ssMatch = url.match(/semanticscholar.org\/paper\/([^?#]*)/);
        if (ssMatch) {
            identifier = ssMatch[1].replace(/\/$/, '');
        }
    } else if (url.includes("arxiv.org")) {
        const arxivMatch = url.match(/arxiv.org\/(?:abs|pdf)\/(.*)/);
        if (arxivMatch) {
            identifier = "ARXIV:" + arxivMatch[1].replace('.pdf', '');
        }
    }
    return identifier;
}

summarizeButton.addEventListener('click', async () => {
    outputDiv.textContent = 'Analyzing tab...';
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url) {
        outputDiv.textContent = 'Could not get page information.';
        return;
    }

    const url = tab.url.toLowerCase();
    const title = tab.title ? tab.title.toLowerCase() : '';

    // flexible regex to find "pdf" in the URL path or query string (it looks for /pdf, .pdf, ?pdf, or =pdf)
    const pdfInUrlRegex = /[./?=]pdf/i;

    const isUrlDirectPdf = url.endsWith('.pdf') || url.startsWith('blob:');
    const isViewerActive = title.endsWith('.pdf');
    const isPdfInUrl = pdfInUrlRegex.test(tab.url);

    if (isUrlDirectPdf || isViewerActive || isPdfInUrl) {
        outputDiv.textContent = 'PDF viewer detected. Downloading file...';

        try {
            const pdfResponse = await fetch(tab.url);
            const pdfBlob = await pdfResponse.blob();
            await parsePdfBlob(pdfBlob);
        } catch (error) {
            console.error("Failed to fetch PDF from viewer:", error);
            outputDiv.textContent = `Error: Could not fetch the PDF from the viewer. The file might be protected or on a local path.`;
        }
        return;
    }

    const identifier = getPaperIdentifier(tab.url);
    if (!identifier) {
        outputDiv.textContent = 'Could not identify a paper on this page. If you have the PDF open, please ensure the URL ends with ".pdf".';
        return;
    }

    outputDiv.textContent = `Found paper identifier: ${identifier}. Searching for PDF link...`;
    const semanticScholarUrl = `https://api.semanticscholar.org/graph/v1/paper/${identifier}?fields=openAccessPdf`;

    try {
        const ssResponse = await fetch(semanticScholarUrl);
        const ssData = await ssResponse.json();
        const pdfUrl = ssData?.openAccessPdf?.url;

        if (!pdfUrl) {
            throw new Error("No Open Access PDF link found via Semantic Scholar.");
        }

        // sanatize url
        outputDiv.textContent = 'Found a potential PDF link. ';
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Open this link';
        outputDiv.appendChild(link);
        outputDiv.appendChild(document.createTextNode(' in a new tab. Once the PDF is visible, click the "Analyze Active Tab" button again.'));

    } catch (error) {
        console.error("API call failed:", error);
        outputDiv.textContent = `Error: ${error.message}`;
    }
});