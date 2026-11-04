<script setup lang="ts">
import { ref, computed } from 'vue';
import { playerState, showToast, selectTrack } from '../../stores/player';
import Icon from '../shell/Icon.vue';

const definitions = [
  { name: 'Vocals and lyrics', short: 'vocals', label: 'Vocals', keys: ['Vocals', 'Lyrics'], desc: 'The voice and words you explicitly marked' },
  { name: 'Melody and rhythm', short: 'melodic moments', label: 'Melody', keys: ['Melody', 'Rhythm', 'Build-up', 'Drop'], desc: 'Melodies, grooves and changing intensity' },
  { name: 'Atmosphere and instruments', short: 'textures', label: 'Textures', keys: ['Atmosphere', 'Instruments'], desc: 'The instrumental sounds that stood out to you' },
  { name: 'Harmony', short: 'harmony', label: 'Harmony', keys: ['Harmony'], desc: 'Chord movement you said you enjoyed' }
];

const selectedTraitIndex = ref(0);

const computedTraits = computed(() => {
  const moments = playerState.moments;
  return definitions.map(d => {
    const items = moments.filter(m => (m.qualities || []).some((q: string) => d.keys.includes(q)));
    return {
      ...d,
      n: items.length,
      items
    };
  });
});

const totalMomentsCount = computed(() => {
  return computedTraits.value.reduce((acc, t) => acc + t.n, 0);
});

function getPercentage(n: number): number {
  if (!totalMomentsCount.value) return 0;
  return Math.round((100 * n) / totalMomentsCount.value);
}

const ringTicks = computed(() => {
  const R = 150;
  const traits = computedTraits.value;
  const ringN = traits.map(t => Math.max(2, t.n * 3));
  const T = ringN.reduce((n, v) => n + v + 3, 0);

  const ticks: { x: number; y: number; deg: number; len: number; color: string }[] = [];
  let idx = 0;

  traits.forEach((t, ti) => {
    const span = ringN[ti];
    for (let k = 0; k < span; k++) {
      const len = t.n ? Math.round(12 + 24 * Math.sin(Math.PI * (k + 0.5) / span)) : 9;
      // TraitRing rule: selected trait `accent`; others `wave-off` while one is selected,
      // light grey when none is (the README's light grey has no token, so `ink-sub` is used).
      // Traits with no moments and the gaps between arcs use the `line` hairline colour.
      const color = t.n
        ? (ti === selectedTraitIndex.value ? 'var(--accent)' : (selectedTraitIndex.value === -1 ? 'var(--ink-sub)' : 'var(--wave-off)'))
        : 'var(--line)';
      const deg = (idx / T) * 360;
      ticks.push({ x: R - 1, y: 0, deg, len, color });
      idx++;
    }
    for (let g = 0; g < 3; g++) {
      ticks.push({ x: R - 1, y: 0, deg: (idx / T) * 360, len: 4, color: 'var(--line)' });
      idx++;
    }
  });

  return ticks;
});

const ringLabels = computed(() => {
  const R = 150;
  const traits = computedTraits.value;
  const ringN = traits.map(t => Math.max(2, t.n * 3));
  const T = ringN.reduce((n, v) => n + v + 3, 0);

  let pos = 0;
  return traits.map((t, i) => {
    const span = ringN[i];
    const mid = ((pos + span / 2) / T) * 2 * Math.PI;
    pos += span + 3;
    const x = Math.sin(mid);
    const y = -Math.cos(mid);
    const right = x >= 0;
    return {
      index: i,
      label: t.label,
      pct: getPercentage(t.n),
      left: `calc(50% + ${Math.round(x * (R + 46))}px)`,
      top: `calc(50% + ${Math.round(y * (R + 34))}px)`,
      transform: `translate(${right ? '0' : '-100%'}, -50%)`,
      textAlign: right ? 'left' : 'right',
      selected: selectedTraitIndex.value === i
    };
  });
});

// TraitRow rule: four-bar meter filled by level (Emerging 1, Growing 2–3, Strong 4).
function level(n: number): number {
  return Math.min(4, n);
}

function playMoment(m: any) {
  const t = playerState.tracks.find(tr => tr.id === m.trackId);
  if (t) {
    selectTrack(t, m.startSec);
    playerState.activeView = 'player';
  } else {
    showToast('This song is no longer in your library.');
  }
}

function trackTitle(m: any): string {
  return playerState.tracks.find(tr => tr.id === m.trackId)?.title || 'Unknown song';
}

function formatTime(sec: number): string {
  const mm = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  return `${mm}:${ss < 10 ? '0' : ''}${ss}`;
}
</script>

<template>
  <div class="dna-container">
    <!-- Layout rule "Other pages": page title, one lead line. The accent status pill was removed:
         the accent is reserved for chosen moments. Voice rule: hedged, plain words. -->
    <div class="dna-header">
      <h1 class="dna-title page-title">My Music DNA</h1>
      <p class="dna-lead body">What the moments you described seem to have in common so far.</p>
    </div>

    <!-- TraitRing rule: 300px ring (radius 150) of 2px ticks; labels are buttons that select a trait. -->
    <div class="ring-stage">
      <div class="ring-circle">
        <div class="ring-center">
          <span class="center-pct numeral">
            {{ totalMomentsCount ? getPercentage(computedTraits[selectedTraitIndex]?.n || 0) + '%' : '0' }}
          </span>
          <span class="center-label body">
            {{ totalMomentsCount ? computedTraits[selectedTraitIndex]?.short : 'moments described' }}
          </span>
          <span class="center-sub caption">
            {{ totalMomentsCount ? 'of what you described' : 'your portrait starts here' }}
          </span>
        </div>

        <div
          v-for="(tk, i) in ringTicks"
          :key="i"
          class="ring-tick"
          :style="{
            height: tk.len + 'px',
            background: tk.color,
            transform: 'rotate(' + tk.deg + 'deg)'
          }"
        ></div>
      </div>

      <!-- Accessibility rule: pressed toggles use aria-pressed. -->
      <button
        v-for="lb in ringLabels"
        :key="lb.index"
        class="ring-label-btn label"
        :aria-pressed="lb.selected"
        :style="{
          left: lb.left,
          top: lb.top,
          transform: lb.transform,
          textAlign: lb.textAlign as any
        }"
        @click="selectedTraitIndex = lb.index"
      >
        <b class="item">{{ lb.pct }}%</b>
        <span>{{ lb.label }}</span>
      </button>
    </div>

    <!-- TraitRing rule: below 700px hide the outside labels and show the same items as tabs. -->
    <div class="ring-tabs" role="tablist" aria-label="Traits">
      <button
        v-for="lb in ringLabels"
        :key="lb.index"
        class="ring-tab body"
        role="tab"
        :aria-selected="lb.selected"
        @click="selectedTraitIndex = lb.index"
      >
        {{ lb.label }} {{ lb.pct }}%
      </button>
    </div>

    <!-- TraitRow rule: open list rows split by `line` hairlines (no cards): meter + name +
         meaning · count | play + best moment | strength. The name is the button that opens the
         moments behind the trait (aria-expanded), indented under the row. -->
    <ol class="trait-breakdown">
      <li
        v-for="(t, i) in computedTraits"
        :key="t.name"
        class="trait-card"
        :class="{ open: selectedTraitIndex === i }"
      >
        <div class="trait-card-top">
          <div class="trait-main">
            <span class="meter" :aria-label="`Strength ${level(t.n)} of 4`" role="img">
              <i v-for="k in 4" :key="k" :class="{ f: k <= level(t.n) }"></i>
            </span>
            <div>
              <button class="trait-card-name item" :aria-expanded="selectedTraitIndex === i" @click="selectedTraitIndex = i">
                {{ t.name }}
              </button>
              <div class="trait-card-desc label">{{ t.desc }} · {{ t.n }} {{ t.n === 1 ? 'moment' : 'moments' }}</div>
            </div>
          </div>

          <div class="trait-hear">
            <template v-if="t.items.length">
              <button class="cplay" aria-label="Play best moment" @click="playMoment(t.items[0])">
                <Icon name="play" :size="11" />
              </button>
              <span class="body">
                {{ trackTitle(t.items[0]) }} {{ formatTime(t.items[0].startSec) }}–{{ formatTime(t.items[0].endSec) }}
                <small v-if="t.items[0].feelings?.length" class="caption">{{ t.items[0].feelings.join(', ') }}</small>
              </span>
            </template>
          </div>

          <div class="trait-ans label">
            <span v-if="level(t.n) === 4" class="ok">Strong match</span>
            <span v-else-if="t.n >= 2">Growing</span>
            <span v-else-if="t.n === 1">Emerging</span>
            <span v-else>Not heard yet</span>
          </div>
        </div>

        <ul v-if="selectedTraitIndex === i && t.items.length" class="trait-moments-list">
          <li v-for="m in t.items" :key="m.id" class="ev-item label">
            <button class="cplay" aria-label="Play moment" @click="playMoment(m)">
              <Icon name="play" :size="11" />
            </button>
            <span class="ev-times">{{ trackTitle(m) }} {{ formatTime(m.startSec) }} – {{ formatTime(m.endSec) }}</span>
            <span v-if="m.feelings?.length" class="ev-feelings">Felt: {{ m.feelings.join(', ') }}</span>
          </li>
        </ul>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.dna-container {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
  font-variant-numeric: tabular-nums;
}
.dna-header {
  margin-bottom: var(--space-5);
}
.dna-title {
  margin: 0;
  color: var(--ink);
}
.dna-lead {
  margin: var(--space-2) 0 0;
  color: var(--ink-sub);
}
/* TraitRing rule: 300px ring centred in a 400px stage (room for the outside labels). */
.ring-stage {
  position: relative;
  height: 400px;
  margin: var(--space-4) 0 var(--space-6);
}
.ring-circle {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 300px;
  height: 300px;
  margin: -150px 0 0 -150px;
}
.ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: calc(var(--space-1) - 1px);
  z-index: 2;
}
.center-pct {
  color: var(--ink);
}
.center-label {
  color: var(--ink);
}
.center-sub {
  color: var(--ink-mute);
}
.ring-tick {
  position: absolute;
  left: 149px;
  top: 0;
  width: var(--wave-bar);
  border-radius: var(--radius-xs);
  transform-origin: 1px 150px;
}
.ring-label-btn {
  position: absolute;
  background: none;
  border: none;
  color: var(--ink-sub);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: calc(var(--space-1) / 2);
  padding: var(--space-1) var(--space-2);
  white-space: nowrap;
  z-index: 4;
}
.ring-label-btn b {
  color: var(--ink);
}
.ring-label-btn[aria-pressed='true'] b {
  color: var(--accent);
}
.ring-tabs {
  display: none;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
}
.ring-tab {
  height: 36px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-pill);
  border: 1px solid var(--line-strong);
  background: none;
  color: var(--ink-sub);
  cursor: pointer;
  transition: background-color 150ms, border-color 150ms, color 150ms;
}
.ring-tab[aria-selected='true'] {
  background: var(--chip-on);
  border-color: var(--chip-on-line);
  color: var(--ink);
}
.trait-breakdown {
  list-style: none;
  margin: var(--space-5) 0 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.trait-card {
  border-bottom: 1px solid var(--line);
  padding: var(--space-4) 0;
}
.trait-card-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 240px) 230px;
  align-items: center;
  gap: var(--space-2) var(--space-5);
}
.trait-main {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.meter {
  display: flex;
  gap: calc(var(--space-1) - 1px);
  align-items: flex-end;
}
.meter i {
  width: var(--space-1);
  height: 14px;
  border-radius: var(--radius-xs);
  background: var(--line-strong);
}
.meter i:nth-child(1) { height: 6px; }
.meter i:nth-child(2) { height: 9px; }
.meter i:nth-child(3) { height: 12px; }
.meter i.f {
  background: var(--accent);
}
.trait-card-name {
  background: none;
  border: 0;
  padding: 0;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
/* TraitRow rule: the open row's name turns `accent`. */
.trait-card.open .trait-card-name {
  color: var(--accent);
}
.trait-card-desc {
  color: var(--ink-mute);
  margin-top: calc(var(--space-1) - 1px);
}
.trait-hear {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink);
}
.trait-hear small {
  display: block;
  color: var(--ink-mute);
}
/* Button rule "Round play": circle with a line-strong ring. */
.cplay {
  width: 34px;
  height: 34px;
  flex: none;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  background: none;
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.trait-ans {
  display: flex;
  justify-content: flex-end;
  color: var(--ink-sub);
}
.ok {
  color: var(--accent);
}
.trait-moments-list {
  list-style: none;
  margin: var(--space-3) 0 0;
  padding: 0 0 0 var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.ev-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-sub);
}
.ev-times {
  color: var(--ink);
}
.ev-feelings {
  color: var(--ink-mute);
}
@media (max-width: 700px) {
  .ring-label-btn {
    display: none;
  }
  .ring-tabs {
    display: flex;
  }
}
/* TraitRow rule: one column on phones (breakpoint-phone, 600px). */
@media (max-width: 600px) {
  .trait-card-top {
    grid-template-columns: minmax(0, 1fr);
  }
  .trait-ans {
    justify-content: flex-start;
  }
}
</style>
