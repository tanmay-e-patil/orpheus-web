import { API } from "../api.js";
import { Passkey } from "../passkey.js";
import { el, showDialog, toast } from "../store.js";

export class LoginPage extends HTMLElement {
  connectedCallback() {
    this.passkeySupported = Passkey.isSupported();
    this.replaceChildren(this.render());
  }

  render() {
    const email = el("input", {
      class: "input",
      type: "email",
      autocomplete: "username webauthn",
      placeholder: "you@example.com",
    });
    const password = el("input", {
      class: "input",
      type: "password",
      autocomplete: "current-password",
      placeholder: "********",
    });
    const submit = el("button", { class: "button", type: "submit", text: "Login" });

    const children = [
      el("h1", { text: "Orpheus" }),
      el("p", { class: "muted", text: "Sign in to your account" }),
    ];

    if (this.passkeySupported) {
      const passkeyButton = el("button", {
        class: "button passkey-button",
        type: "button",
        text: "Sign in with Passkey",
      });
      passkeyButton.addEventListener("click", async () => {
        passkeyButton.disabled = true;
        passkeyButton.textContent = "Waiting for biometric...";
        try {
          const options = await API.passkeyLoginBegin();
          const credential = await Passkey.authenticate(options);
          await API.passkeyLoginFinish(credential);
          toast("Signed in successfully");
          window.Orpheus.router.go("/home");
        } catch (error) {
          if (error.name !== "NotAllowedError") {
            showDialog(error.message || "Passkey sign in failed");
          }
        } finally {
          passkeyButton.disabled = false;
          passkeyButton.textContent = "Sign in with Passkey";
        }
      });
      children.push(passkeyButton);
      children.push(el("div", { class: "divider", text: "or" }));
    }

    const form = el("form", { class: "login-card" }, [
      ...children,
      el("label", { text: "Email" }),
      email,
      el("label", { text: "Password" }),
      password,
      submit,
    ]);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!email.value.trim() || !password.value) {
        showDialog("Email and password are required");
        return;
      }
      submit.disabled = true;
      submit.textContent = "Logging in...";
      try {
        await API.login(email.value.trim(), password.value);
        toast("Signed in successfully");
        window.Orpheus.router.go("/home");
      } catch (error) {
        showDialog(error.message || "Sign in failed");
      } finally {
        submit.disabled = false;
        submit.textContent = "Login";
      }
    });

    return el("section", { class: "login-page" }, [form]);
  }
}

customElements.define("login-page", LoginPage);
