import { API } from "../api.js";
import { el, showDialog, toast } from "../store.js";

export class LoginPage extends HTMLElement {
  connectedCallback() {
    this.replaceChildren(this.render());
  }

  render() {
    const username = el("input", { class: "input", type: "text", autocomplete: "username", placeholder: "your_username" });
    const password = el("input", { class: "input", type: "password", autocomplete: "current-password", placeholder: "********" });
    const submit = el("button", { class: "button", type: "submit", text: "Login" });
    const form = el("form", { class: "login-card" }, [
      el("h1", { text: "Orpheus" }),
      el("p", { class: "muted", text: "Login with Account" }),
      el("label", { text: "Username" }),
      username,
      el("label", { text: "Password" }),
      password,
      submit,
    ]);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!username.value.trim() || !password.value) {
        showDialog("Username and password are required");
        return;
      }
      submit.disabled = true;
      submit.textContent = "Logging in...";
      try {
        await API.login(username.value.trim(), password.value);
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
