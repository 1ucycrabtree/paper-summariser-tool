# AI Synthesis Matrix Generator - Chrome Extension

**Built for the &#103;&#111;&#111;&#103;&#108;&#101; &#99;&#104;&#114;&#111;&#109;&#101; &#98;&#117;&#105;&#108;&#116;-&#105;&#110; &#65;&#73; &#99;&#104;&#97;&#108;&#108;&#101;&#110;&#103;&#101; &#50;&#48;&#50;&#53; 🥸**

## Purpose & Problem Solved

Academic research often involves extensive literature reviews, requiring researchers to read numerous papers and synthesize key information into structured formats like synthesis matrices. This manual process is time-consuming and prone to inconsistencies.

The **AI Synthesis Matrix Generator** is a Chrome Extension designed to streamline this process. It automatically analyzes online academic papers (focusing initially on PDFs) and generates a structured synthesis matrix, significantly reducing the manual effort required for literature reviews and helping researchers quickly identify core concepts, findings, methodologies, and gaps.

**This project aims to solve the real-world problem of inefficient literature review workflows for academic researchers.**

## Key Features

* **PDF Analysis:** Automatically detects and parses the text content of academic papers viewed as PDFs in the browser.
* **AI-Powered Summary:** Generates a concise summary of the paper using Chrome's built-in **Summarizer API**.
* **Automated Synthesis Matrix:** Populates a structured synthesis matrix with fields like:
    * Core Theme/Concept
    * Purpose of Study
    * Methodology
    * Key Findings & Contribution
    * (Optional) Relevance to Research Topic
    * Limitations & Identified Gaps
    * Critical Appraisal
    ... using Chrome's built-in **Prompt API** with targeted prompts for each field.
* **Hybrid AI Strategy:** Leverages the **Gemini Developer API** as a fallback if the built-in APIs are unavailable, ensuring functionality across different user setups.
* **Side Panel Interface:** Provides a simple and accessible user interface within Chrome's side panel.
* **Privacy Focused:** Utilizes client-side AI, ensuring the academic paper's content remains on the user's device when using the built-in APIs.

*(Future MVP Features: HTML article scraping, matrix editing, matrix export/copy functionality)*

## How it Works & Technical Execution

1.  The user opens an academic paper (initially PDF) in Chrome.
2.  The user opens the extension's side panel.
3.  Upon clicking "Generate Summary" or "Generate Matrix":
    * `sidepanel.js` detects if the source is a PDF.
    * If PDF, the text is parsed using PDF.js (`pdf.mjs`). (Handles direct links and viewer URLs).
    * If not a direct PDF, it attempts to find a DOI using `chrome.scripting` and looks up an open access PDF via the Semantic Scholar API.
    * The extracted text is sent to the background script (`background.js`).
4.  `background.js` uses `ModelFactory` to select the appropriate AI provider:
    * **Priority:** Built-in **Summarizer API** (via `summary-provider.js`) or **Prompt API** (via `prompt-provider.js`) for the respective tasks. These APIs process the text locally.
    * **Fallback:** If built-in APIs are unavailable, it uses the **Gemini Developer API** (via `gemini-provider.js`) requiring a user-provided key.
5.  AI responses are streamed back to `sidepanel.js` and displayed to the user.

This demonstrates a smart application of the built-in AI for complex information extraction and structuring, addressing a specific user need with a focus on privacy and efficiency.

## Technology Stack

* **Core:** Chrome Extension Manifest V3
* **Built-in AI APIs:**
    * Summarizer API
    * Prompt API (`LanguageModel`)
* **Fallback AI API:** Google Gemini Developer API (`@google/genai`)
* **PDF Parsing:** PDF.js (`pdfjs-dist` - included version)
* **External APIs:** (Semantic Scholar API)[https://api.semanticscholar.org/api-docs/#tag/Paper-Data/operation/get_graph_get_paper] (for finding PDFs from doi)
* **Bundling:** Webpack
* **Language:** JavaScript (ES Modules)

## Getting Started
1.  Clone the repository.
2.  Run `npm install` to install dependencies.
3.  Run `npm run build` to build the extension files into the `dist` directory.
4.  Open Chrome, go to `chrome://extensions/`.
5.  Enable "Developer mode".
6.  Click "Load unpacked" and select the `dist` directory.
7.  *(Optional)* For Gemini API fallback, open the extension side panel and configure your API key.

## Demo Video

*[Link to your YouTube/Vimeo demo video - ADD THIS FOR SUBMISSION]*

### Before 31st:
- Text description that should explain the features and functionality of your application. Must also include which APIs were used, and the problem you are looking to solve.
- Include a demonstration video of your application. The video portion of the submission:
should be less than three (3) minutes should include footage that shows the application functioning on the device for which it was built must be uploaded to and made publicly visible on YouTube or Vimeo, and a link to the video must be provided on the submission form on the Contest Site; and cannot contain any content, element, or material that violates a third party’s publicity, privacy or intellectual property rights.
- git repo must include an open source license and should include instructions and everything the judges require to test the application. (Providing a public GitHub repository and clear build instructions is what is required in the context of a chrome extension. No need to publish it to the Chrome Web Store.)
