const selectors = ['article', 'main', '.article-body', '.content', '.fulltext'];
let mainContent = null;

for (const selector of selectors) {
    mainContent = document.querySelector(selector);
    if (mainContent) break;
}

const text = mainContent ? mainContent.innerText : document.body.innerText;

chrome.runtime.sendMessage({ type: 'ARTICLE_TEXT', content: text });