<script lang="ts">
  import { AudioLines, ArrowRight, Fingerprint } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { api } from '$lib/api';
  import { Passkey } from '$lib/core/passkey.js';
  import { errorMessage } from '$lib/state';
  let { onauthenticated }: { onauthenticated: () => Promise<void> } = $props();
  let email = $state(''),
    password = $state(''),
    busy = $state(false),
    error = $state('');
  const supported = Passkey.isSupported();
  async function login(event?: SubmitEvent, passkey = false) {
    event?.preventDefault();
    busy = true;
    error = '';
    try {
      if (passkey) {
        const options = await api.passkeyLoginBegin();
        await api.passkeyLoginFinish(await Passkey.authenticate(options));
      } else await api.login(email.trim(), password);
      await onauthenticated();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="login-layout">
  <section class="login-story">
    <a class="wordmark" href="/"
      ><AudioLines size={28} />orpheus<span class="brand-dot">.</span></a
    >
    <div>
      <p class="eyebrow">YOUR MUSIC, COLLECTED</p>
      <h1>A home for<br />every song.</h1>
      <p>
        The songs you find. The words you know.<br />A collection that sounds
        like you.
      </p>
      <div class="record-art">
        <div class="record-center"><AudioLines size={40} /></div>
      </div>
    </div>
    <small>Made for the way you listen.</small>
  </section>
  <section class="login-form">
    <form onsubmit={login}>
      <p class="eyebrow">WELCOME BACK</p>
      <h2>Good to hear from you.</h2>
      <p class="muted">Sign in to your personal music library.</p>
      <Label for="email">Email</Label><Input
        id="email"
        type="email"
        autocomplete="username webauthn"
        placeholder="you@example.com"
        bind:value={email}
        required
      /><Label for="password">Password</Label><Input
        id="password"
        type="password"
        autocomplete="current-password"
        bind:value={password}
        required
      />{#if error}<p class="error-message" role="alert">{error}</p>{/if}<Button
        type="submit"
        disabled={busy}
        >{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={16} /></Button
      >{#if supported}<div class="divider">or</div>
        <Button
          variant="outline"
          type="button"
          disabled={busy}
          onclick={() => login(undefined, true)}
          ><Fingerprint size={18} />Sign in with a passkey</Button
        >{/if}
      <p class="small muted">Your library. Your listening space.</p>
    </form>
  </section>
</div>
