<script lang="ts">
  import { Toaster } from '$lib/components/ui/sonner';

  let {
    navigation = false,
    fixedPlayer = false,
  }: {
    navigation?: boolean;
    fixedPlayer?: boolean;
  } = $props();
</script>

<div
  class="notification-layout"
  class:with-navigation={navigation}
  class:with-player={fixedPlayer}
>
  <Toaster
    position="bottom-right"
    duration={6000}
    visibleToasts={3}
    closeButton
    closeButtonAriaLabel="Dismiss notification"
    offset={{ bottom: 'var(--toast-bottom-offset)', right: '24px' }}
    mobileOffset={{
      bottom: 'var(--toast-bottom-offset)',
      left: '16px',
      right: '16px',
    }}
  />
</div>

<style>
  .notification-layout {
    display: contents;
    --toast-player-offset: 0px;
    --toast-navigation-offset: 0px;
    --toast-bottom-offset: calc(
      var(--toast-player-offset) + 20px + env(safe-area-inset-bottom, 0px)
    );
  }
  .with-player {
    --toast-player-offset: var(--player-height);
  }
  @media (max-width: 767px) {
    .notification-layout {
      --toast-bottom-offset: calc(
        var(--toast-player-offset) + var(--toast-navigation-offset) + 12px +
          env(safe-area-inset-bottom, 0px)
      );
    }
    .with-navigation {
      --toast-navigation-offset: var(--mobile-nav-height);
    }
  }
</style>
