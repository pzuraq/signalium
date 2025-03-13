import type { Component } from 'svelte';
import { mount } from 'svelte';
import { SignaliumMessage, SignaliumMessageType } from './types/index.js';

/**
 * Create a new panel in the Chrome DevTools.
 *
 * https://developer.chrome.com/docs/extensions/reference/api/devtools/panels
 */
export function createPanel({
  title,
  iconPath,
  htmlPagePath,
  callback,
}: {
  title: string;
  iconPath: string;
  htmlPagePath: string;
  callback?: (panel: chrome.devtools.panels.ExtensionPanel) => void;
}) {
  chrome.devtools.panels.create(title, iconPath, htmlPagePath, callback);
}

/**
 * Check if Signalium is available on the current page.
 *
 * @returns {boolean}
 */
export function isSignaliumAvailable() {
  return window.__Signalium__;
}

export function renderSvelteComponent(component: Component, target: HTMLElement) {
  if (target) {
    mount(component, { target });
  }
}

/**
 * Send a message to the extension.
 *
 * @param {SignaliumMessage} message
 * @returns {Promise<SignaliumMessage>}
 */
export async function sendMessage(message: SignaliumMessage) {
  return chrome.runtime.sendMessage(message);
}

/**
 * Subscribe to a message from the extension.
 *
 * @param {SignaliumMessageType} type
 * @param {Function} callback
 */
export async function subscribeToMessage(
  type: SignaliumMessageType,
  callback: (
    message: SignaliumMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ) => void,
) {
  return chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === type) {
      callback(message, sender, sendResponse);
    }
  });
}
