<script lang="ts">
  interface Props {
    label: string;
  }

  let { label }: Props = $props();
</script>

<button data-testid="svelte-button">{label}</button>
