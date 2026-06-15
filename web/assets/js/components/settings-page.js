import { API } from "../api.js";
import { Passkey } from "../passkey.js";
import { el, showDialog, toast } from "../store.js";

export class SettingsPage extends HTMLElement {
  connectedCallback() {
    this.passkeySupported = Passkey.isSupported();
    this.render();
    this.loadPasskeys();
  }

  render(passkeys = [], loading = false) {
    const addButton = el("button", {
      class: "button passkey-button",
      type: "button",
      text: this.passkeySupported ? "Add passkey" : "Passkeys not supported in this browser",
      disabled: !this.passkeySupported,
    });
    addButton.addEventListener("click", () => this.addPasskey(addButton));

    const list = el("div", { class: "passkey-list" });
    if (loading) {
      list.append(el("p", { class: "muted", text: "Loading passkeys..." }));
    } else if (passkeys.length === 0) {
      list.append(el("p", { class: "muted", text: "No passkeys are registered for this account yet." }));
    } else {
      list.append(...passkeys.map((passkey) => this.renderPasskey(passkey)));
    }

    this.replaceChildren(
      el("section", { class: "page settings-page" }, [
        el("header", { class: "page-header" }, [
          el("h1", { text: "Settings" }),
          el("p", { class: "muted", text: "Manage sign-in methods for your account." }),
        ]),
        el("section", { class: "card stack" }, [
          el("div", { class: "settings-section-header" }, [
            el("div", {}, [
              el("h2", { text: "Passkeys" }),
              el("p", { class: "muted", text: "Add passkeys for quicker sign in, or delete passkeys you no longer use." }),
            ]),
            addButton,
          ]),
          list,
        ]),
      ]),
    );
  }

  renderPasskey(passkey) {
    const createdAt = passkey.createdAt ? new Date(passkey.createdAt).toLocaleString() : "Unknown date";
    const deleteButton = el("button", { class: "button secondary danger", type: "button", text: "Delete" });
    deleteButton.addEventListener("click", () => this.deletePasskey(passkey, deleteButton));

    return el("div", { class: "passkey-item" }, [
      el("div", {}, [
        el("strong", { text: passkey.name || "Passkey" }),
        el("p", { class: "muted", text: `Created ${createdAt}` }),
      ]),
      deleteButton,
    ]);
  }

  async loadPasskeys() {
    this.render([], true);
    try {
      const response = await API.passkeyList();
      this.render(response?.passkeys || []);
    } catch (error) {
      showDialog(error.message || "Could not load passkeys");
      this.render([]);
    }
  }

  async addPasskey(button) {
    const name = window.prompt("Name this passkey", "Personal device")?.trim();
    if (!name) return;

    window.alert("Your browser will open its passkey prompt. Choose your preferred provider there, such as 1Password, Bitwarden, Apple Passwords, Google Password Manager, or a security key.");

    button.disabled = true;
    button.textContent = "Waiting for biometric...";
    try {
      const options = await API.passkeyRegisterBegin();
      const credential = await Passkey.register(options);
      await API.passkeyRegisterFinish(credential, name);
      toast("Passkey added", "success");
      await this.loadPasskeys();
    } catch (error) {
      if (error.name !== "NotAllowedError") {
        showDialog(error.message || "Could not add passkey");
      }
    } finally {
      button.disabled = false;
      button.textContent = "Add passkey";
    }
  }

  async deletePasskey(passkey, button) {
    const confirmed = window.confirm(`Delete ${passkey.name || "this passkey"}?`);
    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Deleting...";
    try {
      await API.passkeyDelete(passkey.id);
      toast("Passkey deleted", "success");
      await this.loadPasskeys();
    } catch (error) {
      showDialog(error.message || "Could not delete passkey");
    } finally {
      button.disabled = false;
      button.textContent = "Delete";
    }
  }
}

customElements.define("settings-page", SettingsPage);
