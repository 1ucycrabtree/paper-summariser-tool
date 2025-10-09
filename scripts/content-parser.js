function getReadableContent() {
    const selectors = ['article', 'main', '.article-body', '.content', '.fulltext'];
    let mainContent = null;

    for (const selector of selectors) {
        mainContent = document.querySelector(selector);
        if (mainContent) break;
    }

    // clean up the content by removing unwanted elements
    const contentClone = mainContent.cloneNode(true);
    contentClone.querySelectorAll('nav, header, footer, aside, .ad, [role="navigation"]').forEach(el => el.remove());

    const text = contentClone.innerText;
    const cleanedText = cleanWhitespace(text);
    return cleanedText;
}

function cleanWhitespace(text) {
    let cleanedText = text.trim();
    cleanedText = cleanedText.replace(/(\r\n|\n|\r){3,}/g, '\n\n');
    cleanedText = cleanedText.replace(/ {2,}/g, ' ');

    return cleanedText;
}

getReadableContent();