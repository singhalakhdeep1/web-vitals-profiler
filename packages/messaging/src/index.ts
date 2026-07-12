import type { ExtensionMessage, MessageResponse, MessageType } from "@wvp/types";

/** Creates a typed extension message envelope. */
export function createMessage<T>(
  type: MessageType,
  payload?: T,
  tabId?: number,
): ExtensionMessage<T> {
  return {
    type,
    payload,
    tabId,
    timestamp: Date.now(),
  };
}

/** Sends a message to the background service worker and awaits a typed response. */
export async function sendToBackground<TPayload, TResponse = unknown>(
  message: ExtensionMessage<TPayload>,
): Promise<MessageResponse<TResponse>> {
  try {
    const response = await chrome.runtime.sendMessage(message);
    return response as MessageResponse<TResponse>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown messaging error",
    };
  }
}

/** Sends a message to a specific tab's content script. */
export async function sendToTab<TPayload, TResponse = unknown>(
  tabId: number,
  message: ExtensionMessage<TPayload>,
): Promise<MessageResponse<TResponse>> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    return response as MessageResponse<TResponse>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown tab messaging error",
    };
  }
}

type MessageHandler = (
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
) => MessageResponse | Promise<MessageResponse> | void;

/** Registers a typed message listener on the current context. */
export function onMessage(
  handlers: Partial<Record<MessageType, MessageHandler>>,
): () => void {
  const listener = (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ): boolean => {
    const handler = handlers[message.type];
    if (!handler) return false;

    void Promise.resolve(handler(message, sender)).then((result) => {
      if (result) sendResponse(result);
    });

    return true;
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

/** Ping/pong health check for verifying extension connectivity. */
export async function pingBackground(): Promise<boolean> {
  const response = await sendToBackground(createMessage("PING"));
  return response.success && response.data === "PONG";
}
