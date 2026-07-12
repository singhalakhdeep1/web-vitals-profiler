/** Creates the DevTools panel tab in Chrome DevTools. */
chrome.devtools.panels.create(
  "Web Vitals",
  "icons/icon-32.png",
  "panel.html",
  () => {
    console.info("[Web Vitals Profiler] DevTools panel created");
  },
);

export {};
