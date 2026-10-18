import { App, Modal, Notice, Setting } from 'obsidian';

/**
 * Hands the Login Flow v2 URL to the user when the webview could not open a browser
 * (reported on HarmonyOS: `window.open` is blocked, and because the call happens after
 * an `await` the tap's user activation has expired, so a clipboard write fails too).
 *
 * A Notice cannot carry a selectable URL on mobile, so the URL is shown in a read-only
 * text field (long-press → Select All → Copy works) with two buttons that each carry a
 * fresh user gesture: Copy URL (clipboard write from a real click succeeds where the
 * async one failed) and Open in browser (window.open from a real click is far more
 * likely to be allowed than the post-await call that was already refused).
 */
export class LoginUrlModal extends Modal {
  constructor(
    app: App,
    private readonly loginUrl: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, loginUrl } = this;
    contentEl.empty();
    new Setting(contentEl).setName('Login URL').setHeading();
    contentEl.createEl('p', {
      text: 'The browser did not open. Open this URL in ANY browser (e.g. on your computer), '
        + 'sign in and approve — this device is polling and will finish sign-in automatically.',
    });

    const input = contentEl.createEl('input', { type: 'text', cls: 'ncs-login-url-input' });
    input.value = loginUrl;
    input.readOnly = true;
    input.addEventListener('focus', () => input.select());

    new Setting(contentEl)
      .addButton((btn) => btn
        .setButtonText('Open in browser')
        .onClick(() => {
          window.open(loginUrl, '_blank');
        }))
      .addButton((btn) => btn
        .setButtonText('Copy URL')
        .setCta()
        .onClick(async () => {
          try {
            await navigator.clipboard.writeText(loginUrl);
          } catch {
            // Legacy fallback: a focused, selected input is what execCommand copies.
            input.focus();
            input.select();
            document.execCommand('copy');
          }
          new Notice('📋 Login URL copied to clipboard', 4000);
        }));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
