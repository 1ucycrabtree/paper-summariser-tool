function findDoiInUrl() {
    console.log("Content script received request to find DOI.");

    const linkElement = Array.from(document.querySelectorAll('a')).find(a => {
        const href = a.getAttribute("href");
        return href && /(^|\/\/)[^/]*doi\.org[^\s]*/i.test(href);
    });

    if (linkElement) {
        return linkElement.href;
    } else {
        return null;
    }
}

findDoiInUrl();