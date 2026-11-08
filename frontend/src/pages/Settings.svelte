<script lang="ts">
  import { notify } from '$lib/notifications';
  import { onMount } from 'svelte';
  import {
    Fingerprint,
    Plus,
    Trash2,
    LogOut,
    Moon,
    Sun,
    Monitor,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Dialog from '$lib/components/ui/dialog';
  import { api } from '$lib/api';
  import { Passkey } from '$lib/core/passkey.js';
  import { clearPlayer } from '$lib/core/player-store.js';
  import { session, errorMessage } from '$lib/state';
  import { navigate } from '$lib/navigation';
  let keys = $state<{ id: string; name: string; createdAt: string }[]>([]),
    loading = $state(true),
    busy = $state(false),
    error = $state('');
  let addOpen = $state(false),
    keyName = $state('Personal device'),
    deleting = $state<{ id: string; name: string } | null>(null);
  let appearance = $state(localStorage.getItem('orpheus-appearance') || 'dark');
  const supported = Passkey.isSupported();
  $effect(() => {
    localStorage.setItem('orpheus-appearance', appearance);
    const dark =
      appearance === 'dark' ||
      (appearance === 'system' &&
        matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  });
  async function load() {
    try {
      keys = (await api.passkeyList()).passkeys;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    load();
  });
  async function add() {
    busy = true;
    error = '';
    try {
      const options = await api.passkeyRegisterBegin();
      await api.passkeyRegisterFinish(await Passkey.register(options), keyName);
      addOpen = false;
      await load();
      notify('Passkey added.', 'success');
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
  async function remove() {
    if (!deleting) return;
    busy = true;
    try {
      await api.passkeyDelete(deleting.id);
      deleting = null;
      await load();
      notify('Passkey deleted.', 'success');
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
  async function logout() {
    busy = true;
    try {
      await api.logout();
      clearPlayer();
      session.set(null);
      navigate('/', true);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<section class="page settings-page">
  <header class="page-heading">
    <div>
      <h1>Settings<span class="title-dot">.</span></h1>
    </div>
  </header>
  {#if error}<p class="error-message" role="alert">{error}</p>{/if}
  <section class="settings-section">
    <div>
      <h2>Appearance</h2>
    </div>
    <div class="appearance-options">
      {#each [{ value: 'dark', label: 'Dark', icon: Moon }, { value: 'light', label: 'Light', icon: Sun }, { value: 'system', label: 'System', icon: Monitor }] as option}<button
          class:selected={appearance === option.value}
          onclick={() => (appearance = option.value)}
          aria-pressed={appearance === option.value}
          ><option.icon size={21} />{option.label}</button
        >{/each}
    </div>
  </section>
  <section class="settings-section">
    <div class="section-heading">
      <div>
        <h2>Passkeys</h2>
        <p class="muted">A faster, secure way to sign in.</p>
      </div>
      <Button
        variant="outline"
        disabled={!supported || busy}
        onclick={() => (addOpen = true)}><Plus size={16} />Add passkey</Button
      >
    </div>
    {#if loading}<p class="muted">Loading passkeys…</p>{:else if !keys.length}<p
        class="quiet-empty"
      >
        <Fingerprint size={22} />No passkeys yet. Add one to skip the password.
      </p>{:else}<div class="passkey-list">
        {#each keys as key (key.id)}<div>
            <Fingerprint size={22} /><span
              ><strong>{key.name || 'Passkey'}</strong><small
                >Added {new Date(key.createdAt).toLocaleDateString()}</small
              ></span
            ><button
              class="icon-control"
              aria-label={`Delete ${key.name || 'passkey'}`}
              onclick={() => (deleting = key)}><Trash2 size={17} /></button
            >
          </div>{/each}
      </div>{/if}{#if !supported}<p class="small muted">
        Passkeys require a supported browser and a secure connection.
      </p>{/if}
  </section>
  <section class="settings-section">
    <div class="section-heading">
      <div>
        <h2>Your account</h2>
        <p class="muted">
          {$session?.user?.email || $session?.user?.username || ''}
        </p>
      </div>
      <Button variant="outline" disabled={busy} onclick={logout}
        ><LogOut size={16} />Sign out</Button
      >
    </div>
  </section>
</section>
<Dialog.Root bind:open={addOpen}
  ><Dialog.Content
    ><Dialog.Header
      ><Dialog.Title>Add a passkey</Dialog.Title><Dialog.Description
        >Give this passkey a name. Your browser will then ask where to save it.</Dialog.Description
      ></Dialog.Header
    >
    <form
      class="form-stack"
      onsubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <label for="key-name">Passkey name</label><Input
        id="key-name"
        bind:value={keyName}
        required
      />{#if error}<p role="alert" class="error-message">{error}</p>{/if}<Button
        type="submit"
        disabled={busy}
        >{busy ? 'Waiting for your browser…' : 'Create passkey'}</Button
      >
    </form></Dialog.Content
  ></Dialog.Root
>
<Dialog.Root
  open={!!deleting}
  onOpenChange={(open) => {
    if (!open) deleting = null;
  }}
  ><Dialog.Content
    ><Dialog.Header
      ><Dialog.Title>Delete this passkey?</Dialog.Title><Dialog.Description
        >{deleting?.name || 'This passkey'} will no longer be available for signing
        in.</Dialog.Description
      ></Dialog.Header
    >
    <div class="actions">
      <Button variant="outline" onclick={() => (deleting = null)}>Cancel</Button
      ><Button variant="destructive" disabled={busy} onclick={remove}
        >Delete passkey</Button
      >
    </div></Dialog.Content
  ></Dialog.Root
>
