<script setup lang="ts">
import { ref, computed } from 'vue';
import { playerState, showToast } from '../../stores/player';

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
      const color = t.n
        ? (ti === selectedTraitIndex.value ? '#8EC5B8' : (selectedTraitIndex.value === -1 ? '#B4B4B9' : '#4A4A50'))
        : '#26262A';
      const deg = (idx / T) * 360;
      ticks.push({ x: R - 1, y: 0, deg, len, color });
      idx++;
    }
    for (let g = 0; g < 3; g++) {
      ticks.push({ x: R - 1, y: 0, deg: (idx / T) * 360, len: 4, color: '#26262A' });
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
</script>

<template>
  <div class="dna-container">
    <div class="dna-header">
      <h1 class="dna-title">My Music DNA</h1>
      <span class="dna-status-pill">Active Listening Insights Active</span>
    </div>

    <!-- Circular Ring Stage -->
    <div class="ring-stage">
      <div class="ring-circle">
        <!-- Center stats -->
        <div class="ring-center">
          <span class="center-pct">
            {{ totalMomentsCount ? getPercentage(computedTraits[selectedTraitIndex]?.n || 0) + '%' : '0' }}
          </span>
          <span class="center-label">
            {{ totalMomentsCount ? computedTraits[selectedTraitIndex]?.short : 'moments described' }}
          </span>
          <span class="center-sub">
            {{ totalMomentsCount ? 'of described preferences' : 'your portrait starts here' }}
          </span>
        </div>

        <!-- Rendered Ring Ticks -->
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

      <!-- Outer Radial Labels -->
      <button
        v-for="lb in ringLabels"
        :key="lb.index"
        class="ring-label-btn"
        :class="{ active: lb.selected }"
        :style="{
          left: lb.left,
          top: lb.top,
          transform: lb.transform,
          textAlign: lb.textAlign as any
        }"
        @click="selectedTraitIndex = lb.index"
      >
        <b>{{ lb.pct }}%</b>
        <span>{{ lb.label }}</span>
      </button>
    </div>

    <!-- Trait Descriptions -->
    <div class="trait-breakdown">
      <div
        v-for="(t, i) in computedTraits"
        :key="t.name"
        class="trait-card"
        :class="{ open: selectedTraitIndex === i }"
        @click="selectedTraitIndex = i"
      >
        <div class="trait-card-top">
          <div>
            <div class="trait-card-name">{{ t.name }}</div>
            <div class="trait-card-desc">{{ t.desc }} · {{ t.n }} saved passages</div>
          </div>
          <span class="trait-pct-pill">{{ getPercentage(t.n) }}%</span>
        </div>

        <div v-if="selectedTraitIndex === i && t.items.length" class="trait-moments-list">
          <div v-for="m in t.items" :key="m.id" class="ev-item">
            <span class="ev-dot">● You confirmed</span>
            <span class="ev-times">{{ m.startSec }}s – {{ m.endSec }}s</span>
            <span v-if="m.feelings?.length" class="ev-feelings">Felt: {{ m.feelings.join(', ') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dna-container {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 16px;
}
.dna-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.dna-title {
  font-size: 24px;
  font-weight: 500;
  margin: 0;
  color: var(--fg, #DCDCE0);
}
.dna-status-pill {
  font-size: 12px;
  color: var(--accent, #8EC5B8);
  border: 1px solid rgba(142, 197, 184, 0.3);
  padding: 4px 10px;
  border-radius: 12px;
}
.ring-stage {
  position: relative;
  width: 380px;
  height: 380px;
  margin: 20px auto 40px;
}
.ring-circle {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ring-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  z-index: 2;
}
.center-pct {
  font-size: 44px;
  font-weight: 300;
  color: var(--fg, #DCDCE0);
  font-variant-numeric: tabular-nums;
}
.center-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--accent, #8EC5B8);
  margin-top: 2px;
}
.center-sub {
  font-size: 12px;
  color: var(--mute, #85858B);
  margin-top: 4px;
}
.ring-tick {
  position: absolute;
  left: 189px;
  top: 0;
  width: 2px;
  border-radius: 1px;
  transform-origin: 1px 190px;
}
.ring-label-btn {
  position: absolute;
  background: none;
  border: none;
  color: var(--sub, #A1A1A6);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  padding: 4px 6px;
  z-index: 4;
}
.ring-label-btn b {
  font-size: 16px;
  color: var(--fg, #DCDCE0);
}
.ring-label-btn span {
  font-size: 12px;
}
.ring-label-btn.active b {
  color: var(--accent, #8EC5B8);
}
.ring-label-btn.active span {
  color: var(--accent, #8EC5B8);
}
.trait-breakdown {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}
.trait-card {
  background: var(--panel, #151518);
  border: 1px solid var(--line, #1F1F23);
  border-radius: 12px;
  padding: 16px 20px;
  cursor: pointer;
  transition: border-color .2s ease;
}
.trait-card.open {
  border-color: var(--line2, #2C2C31);
}
.trait-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.trait-card-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--fg, #DCDCE0);
}
.trait-card-desc {
  font-size: 12px;
  color: var(--mute, #85858B);
  margin-top: 4px;
}
.trait-pct-pill {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent, #8EC5B8);
  background: rgba(142, 197, 184, 0.1);
  padding: 4px 10px;
  border-radius: 8px;
}
.trait-moments-list {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line, #1F1F23);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ev-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--sub, #A1A1A6);
}
.ev-dot {
  color: var(--accent, #8EC5B8);
}
.ev-times {
  font-variant-numeric: tabular-nums;
  color: var(--fg, #DCDCE0);
}
.ev-feelings {
  font-style: italic;
  color: var(--mute, #85858B);
}
</style>

