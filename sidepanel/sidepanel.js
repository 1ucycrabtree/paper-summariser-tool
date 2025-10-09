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