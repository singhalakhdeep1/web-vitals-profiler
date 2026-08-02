// Firefox extension background script

chrome.runtime.onInstalled.addListener(() => {
  console.log('Web Vitals Profiler installed');
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url && tab.url.startsWith('http')) {
    chrome.scripting.executeScript({
      target: { tabId: activeInfo.tabId },
      files: ['injected/index.js']
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'VITALS_COLLECTED') {
    chrome.storage.local.set({
      [request.url]: request.vitals
    });
  }
  if (request.type === 'GET_VITALS') {
    chrome.storage.local.get([request.url], (result) => {
      sendResponse(result[request.url]);
    });
  }
  return true;
});
