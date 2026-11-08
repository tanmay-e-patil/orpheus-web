<script lang="ts">
  import { onMount } from 'svelte';
  import { AudioLines, Fingerprint, ArrowRight, LogOut } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import Login from './Login.svelte';
  import { api } from '$lib/api';
  import { Passkey } from '$lib/core/passkey';
  import { route } from '$lib/navigation.svelte';
  import type { Session } from '$lib/types';
  const request = new URLSearchParams(route.search).get('request') || '';
  let details = $state<{
    action: string;
    userId?: string;
    name?: string;
  } | null>(null);
  let account = $state<Session | null>(null);
  let loading = $state(true),
    busy = $state(false),
    finished = $state(false),
    error = $state('');
  const correctAccount = $derived(
    !details?.userId || details.userId === account?.user?.id,
  );
  const message = (e: unknown) =>
    e instanceof Error ? e.message : 'Could not complete sign-in.';
  onMount(async () => {
    try {
      details = await api.nativeAuthDetails(request);
      account = await api.session().catch(() => null);
    } catch (e) {
      error = message(e);
    } finally {
      loading = false;
    }
  });
  async function authenticated() {
    account = await api.session();
    if (details?.action === 'login') await complete();
  }
  async function complete() {
    if (busy || !details || !correctAccount) return;
    busy = true;
    error = '';
    try {
      if (details.action === 'register') {
        const options = await api.passkeyRegisterBegin();
        const credential = await Passkey.register(options);
        await api.passkeyRegisterFinish(credential, details.name || 'iPhone');
      }
      const data = await api.nativeAuthAuthorize(request);
      const callback = new URL(data.callbackURL);
      if (
        callback.protocol !== 'orpheus:' ||
        callback.hostname !== 'auth' ||
        callback.pathname !== '/callback'
      )
        throw new Error('The server returned an invalid app callback.');
      finished = true;
      location.assign(callback.href);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'NotAllowedError'))
        error = message(e);
    } finally {
      busy = false;
    }
  }
  async function signOut() {
    busy = true;
    error = '';
    try {
      await api.logout();
      account = null;
    } catch (e) {
      error = message(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Orpheus · Continue to the iOS app</title>
  <meta name="referrer" content="no-referrer" />
</svelte:head>
{#if details && !account?.authenticated && !loading}
  <Login onauthenticated={authenticated} />
{:else}
  <main class="native-auth-page">
    <div class="wordmark">
      <AudioLines size={23} />orpheus<span class="brand-dot">.</span>
    </div>
    <p class="eyebrow">ORPHEUS FOR iOS</p>
    <h1>
      {details?.action === 'register' ? 'Add a passkey.' : 'Welcome back.'}
    </h1>
    {#if loading}<p class="muted">Opening your sign-in request…</p>
    {:else if finished}<p class="muted">You can return to Orpheus now.</p>
    {:else if details && account?.authenticated}
      <p class="muted">
        Signed in as {account.user?.username ||
          account.user?.email ||
          'your account'}.
      </p>
      {#if !correctAccount}<p class="error-message">
          Sign in with the same account as the iOS app to add a passkey.
        </p>
      {:else}
        <Button disabled={busy} onclick={complete}>
          {#if details.action === 'register'}<Fingerprint size={18} />{busy
              ? 'Adding passkey…'
              : 'Add passkey'}
          {:else}{busy ? 'Continuing…' : 'Continue to Orpheus'}<ArrowRight
              size={16}
            />{/if}
        </Button>
      {/if}
      <Button variant="ghost" disabled={busy} onclick={signOut}
        ><LogOut size={16} />Use another account</Button
      >
    {/if}
    {#if error}<p class="error-message" role="alert">{error}</p>{/if}
  </main>
{/if}

<style>
  .native-auth-page {
    max-width: 480px;
    margin: auto;
    padding: 64px 28px;
    display: grid;
    gap: 24px;
  }
  .native-auth-page .wordmark {
    margin-bottom: 48px;
    color: var(--primary);
  }
  .native-auth-page h1 {
    font-size: 32px;
  }
</style>
