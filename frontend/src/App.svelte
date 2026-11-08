<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Library,
    Plus,
    Settings as SettingsIcon,
    AudioLines,
    ChevronRight,
  } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { route, navigate, syncRoute } from '$lib/navigation';
  import {
    session,
    playback,
    dockedPlayer,
    nowPlaying,
    errorMessage,
  } from '$lib/state';
  import { setSession } from '$lib/core/store.js';
  import { clearPlayer } from '$lib/core/player-store.js';
  import { initAudioPlayer } from '$lib/core/audio-player.js';
  import { listenForSongDeletions } from '$lib/song-deletion';
  import LibraryPage from './pages/Library.svelte';
  import Login from './pages/Login.svelte';
  import NativeAuth from './pages/NativeAuth.svelte';
  import Settings from './pages/Settings.svelte';
  import Discovery from './pages/Discovery.svelte';
  import SongEditor from './pages/SongEditor.svelte';
  import Player from '$lib/components/Player.svelte';
  import AppToaster from '$lib/components/AppToaster.svelte';
  let ready = $state(false);
  const accountName = $derived(
    $session?.user?.username || $session?.user?.email || 'Account',
  );
  const nav = [
    { href: '/home', label: 'Library', icon: Library },
    { href: '/discover', label: 'Add songs', icon: Plus },
    { href: '/settings', label: 'Settings', icon: SettingsIcon },
  ];
  const active = (href: string) =>
    href === '/discover'
      ? $route.path.startsWith('/discover')
      : $route.path === href;
  async function authenticate() {
    try {
      const value = await api.session();
      session.set(value);
      setSession(value);
    } catch {
      session.set(null);
      setSession(null);
    } finally {
      ready = true;
    }
  }
  function followLink(event: MouseEvent) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = (event.target as Element)?.closest('a');
    if (
      !link ||
      link.target ||
      link.hasAttribute('download') ||
      link.origin !== location.origin ||
      link.hash
    )
      return;
    event.preventDefault();
    navigate(link.pathname + link.search);
  }
  function shortcut(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if ($route.path !== '/home') navigate('/home');
      setTimeout(() => document.getElementById('library-search')?.focus(), 0);
    }
  }
  $effect(() => {
    if (!ready || $route.path === '/auth/native') return;
    if (!$session?.authenticated && $route.path !== '/') navigate('/', true);
    if ($session?.authenticated && $route.path === '/') navigate('/home', true);
  });
  onMount(() => {
    initAudioPlayer();
    const stopDeletions = listenForSongDeletions();
    authenticate();
    const media = matchMedia('(prefers-color-scheme: dark)');
    const syncAppearance = () => {
      if (localStorage.getItem('orpheus-appearance') === 'system')
        document.documentElement.classList.toggle('dark', media.matches);
    };
    media.addEventListener('change', syncAppearance);
    const unauthorized = () => {
      clearPlayer();
      session.set(null);
      setSession(null);
      if ($route.path !== '/auth/native') navigate('/', true);
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('orpheus:unauthorized', unauthorized);
    return () => {
      stopDeletions();
      media.removeEventListener('change', syncAppearance);
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('orpheus:unauthorized', unauthorized);
    };
  });
</script>

<svelte:document onclick={followLink} onkeydown={shortcut} />
<a href="#main" class="skip-link">Skip to content</a>
{#if $route.path === '/auth/native'}
  <NativeAuth />
{:else if !ready}
  <div class="boot">
    <AudioLines size={32} />
    <p>Opening your library…</p>
  </div>
{:else if !$session?.authenticated}
  <Login onauthenticated={authenticate} />
{:else}
  <div
    class:has-player={!!$playback.song}
    class:docked-player={$dockedPlayer}
    class="app-layout"
  >
    <aside class="sidebar">
      <a class="wordmark" href="/home" aria-label="Orpheus home"
        ><span class="brand-mark"><AudioLines size={23} /></span><span
          class="brand-name">orpheus</span
        ><span class="brand-dot">.</span></a
      >
      <nav aria-label="Primary">
        {#each nav as item}<a
            class:active={active(item.href)}
            href={item.href}
            aria-label={item.label}
            title={item.label}
            aria-current={active(item.href) ? 'page' : undefined}
            ><item.icon size={18} strokeWidth={1.7} /><span class="nav-label"
              >{item.label}</span
            ></a
          >{/each}
      </nav>
      <a
        class="sidebar-footer"
        href="/settings"
        aria-label={`Account settings: ${accountName}`}
        title={accountName}
      >
        <span class="account-avatar"
          >{accountName.slice(0, 1).toUpperCase()}</span
        >
        <div><strong>{accountName}</strong></div>
        <ChevronRight class="account-chevron" size={16} />
      </a>
    </aside>
    <header class="mobile-header">
      <a href="/home" class="wordmark"
        ><AudioLines size={22} /><span class="brand-name">orpheus</span><span
          class="brand-dot">.</span
        ></a
      >
    </header>
    <main id="main" tabindex="-1">
      {#key $route.path}
        {#if $route.path === '/home'}<LibraryPage />
        {:else if $route.path === '/settings'}<Settings />
        {:else if $route.path.startsWith('/discover')}<Discovery
            stage={$route.path.split('/')[2] || 'search'}
          />
        {:else if /^\/songs\/[^/]+\/edit$/.test($route.path)}<SongEditor
            id={decodeURIComponent($route.path.split('/')[2])}
          />
        {:else}<section class="page empty">
            <h1>Page not found</h1>
            <a href="/home">Return to your library</a>
          </section>{/if}
      {/key}
    </main>
    <nav class="bottom-nav" aria-label="Mobile primary">
      {#each nav as item}<a
          href={item.href}
          class:active={active(item.href)}
          aria-current={active(item.href) ? 'page' : undefined}
          ><item.icon size={21} strokeWidth={1.7} /><span>{item.label}</span></a
        >{/each}
    </nav>
    <Player />
  </div>
{/if}
<AppToaster
  navigation={ready &&
    !!$session?.authenticated &&
    $route.path !== '/auth/native'}
  fixedPlayer={ready &&
    !!$session?.authenticated &&
    $route.path !== '/auth/native' &&
    !!$playback.song &&
    !$dockedPlayer &&
    !$nowPlaying}
/>
