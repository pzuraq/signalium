<script lang="ts">
  import { signaliumState } from '../storage.ts';
  import { isSignaliumAvailable } from '../utils.ts';

  const events = $state([]);
  const isAvailable = $state(isSignaliumAvailable());

  try {
    signaliumState.subscribe(event => {
      events.push(event);
    });
  } catch (error) {
    console.error('Error subscribing to signaliumState', error);
  }
</script>

{#if isAvailable}
  <!-- Signalium Available -->
  <div class="w-full h-screen container mx-auto">
    <div class="flex flex-col gap-4">
      {#each events as event}
        <div class="flex flex-row gap-4">
          <p>{event.state}</p>
          <p>{event.timestamp}</p>
        </div>
      {/each}
    </div>
  </div>
{:else}
  <!-- Empty State -->
  <div class="w-full h-screen flex items-center justify-center flex-col">
    <p class="text-center px-2 text-2xl tracking-tighter text-balance max-lg:font-medium">
      Signalium is not available on this page.
    </p>
  </div>
{/if}
