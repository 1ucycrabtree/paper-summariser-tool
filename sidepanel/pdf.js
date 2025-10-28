import * as pdfjsLib from "../scripts/pdf.mjs";

// configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = "../scripts/pdf.worker.mjs";

// --- in-memory cache for parsed PDFs ---
const pdfCache = {};
const pdfParsePromises = {};

export async function getOrParsePdf(tabUrl, tabId, outputDiv) {
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

export async function extractPaperIdentifierFromUrl(url, tabId) {
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