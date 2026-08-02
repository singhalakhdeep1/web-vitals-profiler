// Safari extension background script

browser.runtime.onInstalled.addListener(() => {
  console.log('Web Vitals Profiler installed');
});

browser.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await browser.tabs.get(activeInfo.tabId);
  if (tab.url && tab.url.startsWith('http')) {
    browser.scripting.executeScript({
      target: { tabId: activeInfo.tabId },
      files: ['injected/index.js']
    });
  }
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'VITALS_COLLECTED') {
    browser.storage.local.set({
      [request.url]: request.vitals
    });
  }
  if (request.type === 'GET_VITALS') {
    browser.storage.local.get([request.url], (result) => {
      sendResponse(result[request.url]);
    });
  }
  return true;
});
