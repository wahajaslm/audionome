<script setup lang="ts">
/**
 * DescribeStrip (design system): Feels · Love · Note, opened from the AskRow's More….
 * Props: feelings / qualities (options); feel / love (pressed values); note (v-model:note).
 * Emits: toggle-feel(v), toggle-love(v), update:note(text), cancel ("Not now"), done.
 * Feelings are round chips, qualities square: someone can love a sad passage for its melody.
 */
import Button from './Button.vue';
import Chip from './Chip.vue';

/** flat: no box of its own; rows sit in the parent panel, split by lines (Explore). */
defineProps<{ feelings: string[]; qualities: string[]; feel: string[]; love: string[]; note: string; flat?: boolean }>();
const emit = defineEmits<{ 'toggle-feel': [v: string]; 'toggle-love': [v: string]; 'update:note': [v: string]; cancel: []; done: [] }>();
</script>

<template>
  <section class="describe" :class="{ flat }" aria-label="Describe this moment">
    <div class="row">
      <span class="lbl">Feels</span>
      <div class="chips">
        <Chip v-for="f in feelings" :key="f" size="sm" :pressed="feel.includes(f)" @click="emit('toggle-feel', f)">{{ f }}</Chip>
      </div>
    </div>
    <div class="row">
      <span class="lbl">Love</span>
      <div class="chips">
        <Chip v-for="q in qualities" :key="q" square size="sm" :pressed="love.includes(q)" @click="emit('toggle-love', q)">{{ q }}</Chip>
      </div>
    </div>
    <div class="row">
      <span class="lbl">Note</span>
      <input
        class="in"
        type="text"
        aria-label="Optional note"
        placeholder="Optional — what did you notice?"
        :value="note"
        @input="emit('update:note', ($event.target as HTMLInputElement).value)"
        @keydown.enter="emit('done')"
      />
      <Button size="sm" @click="emit('cancel')">Not now</Button>
      <Button size="sm" variant="primary" @click="emit('done')">Done</Button>
    </div>
  </section>
</template>

<style scoped>
/* LAYOUT FIX - the root was class "strip", and ExplorePanel's scoped .strip (a horizontal
   scroller) also hit it, so Feels and Love sat side by side inside scroll bars. Unique name
   now, and the chips wrap instead of scrolling, so every option is visible.
   Example: Feels has 7 chips on a narrow panel -> before: "Othe" cut off behind a scroll bar;
   now: they wrap onto a second line. */
.describe {
  border: 1px solid var(--line-strong);
  background: var(--bg-panel);
  border-radius: var(--radius-md);
  padding: 2px 10px;
}
/* FLAT FIX - inside Explore the strip was a box inside the panel's box. Flat: no border or
   background, labels on the panel's 96 px column, rows split by the same lines as the panel.
   Example: Explore -> Hear / Feels / Love / Note read as one list, not a nested card. */
.describe.flat { border: 0; background: none; border-radius: 0; padding: 0; }
.describe.flat .row { border-top: 1px solid var(--line); padding: var(--space-3) 0; gap: var(--space-3); }
.describe.flat .row:last-child { padding-bottom: 0; }
.describe.flat .lbl { width: 96px; }
@media (max-width: 520px) { .describe.flat .lbl { width: 72px; } }
.row { display: flex; align-items: center; gap: var(--space-2); min-height: 40px; padding: 6px 0; }
.row + .row { border-top: 1px solid var(--line); }
.lbl { flex: none; width: 40px; font-size: 12px; color: var(--ink-mute); }
.chips { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; flex: 1; min-width: 0; }
.in {
  flex: 1;
  min-width: 0;
  height: 30px;
  box-sizing: border-box;
  padding: 0 var(--space-3);
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font: 14px var(--font-sans);
}
.in::placeholder { color: var(--ink-mute); }
</style>
