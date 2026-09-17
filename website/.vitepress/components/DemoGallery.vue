<script setup lang="ts">
/**
 * One editor, several focused sequences: the editor plays one while its
 * explanation stands beside it, pauses, moves to the next, and cycles. The
 * index on the side jumps to any of them. A person touching the editor stops
 * the playback and gets a live editor; Play hands it back.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { withBase } from 'vitepress';
import type { OutlineEditor, ScriptRunner, ScriptStep } from '../../demo/editor';
import { KITCHEN, SEQUENCES, type DemoSequence } from '../../demo/samples';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    sequences?: DemoSequence[];
    title?: string;
    delay?: number;
    /** Pause between one sequence's end and the next one's start. */
    between?: number;
  }>(),
  { title: 'Kitchen renovation.md', delay: 950, between: 2600 },
);

const host = ref<HTMLElement | null>(null);
const editor = shallowRef<OutlineEditor | null>(null);
const runner = shallowRef<ScriptRunner | null>(null);
const list = computed(() => props.sequences ?? SEQUENCES);
const index = ref(0);
const current = computed(() => list.value[index.value]!);
const status = ref<'idle' | 'playing' | 'paused' | 'stopped'>('idle');
const stepLabel = ref('');
const stepIndex = ref(0);
const stepCount = ref(1);
let observer: IntersectionObserver | null = null;
let stopInput: (() => void) | null = null;
let run = 0;
let reducedMotion = false;

const stateText = computed(() => {
  if (status.value === 'playing') return `Playing ${index.value + 1} of ${list.value.length}`;
  if (status.value === 'paused') return 'Paused: the editor is yours';
  if (status.value === 'stopped') return 'Stopped';
  return 'Ready';
});

function labelOf(step: ScriptStep): string {
  if (step.label) return step.label;
  if ('key' in step) {
    const isMac = navigator.platform.startsWith('Mac');
    const parts: string[] = [];
    if (step.mod) parts.push(isMac ? '⌘' : 'Ctrl');
    if (step.alt) parts.push(isMac ? '⌥' : 'Alt');
    if (step.shift) parts.push('⇧');
    const names: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: '↵', Tab: 'Tab', Backspace: '⌫' };
    parts.push(names[step.key] ?? step.key);
    return parts.join(isMac ? '' : '+');
  }
  if ('type' in step) return `type "${step.type}"`;
  if ('click' in step) return 'click the marker';
  if ('outline' in step) return step.outline ? 'outline mode on' : 'outline mode off';
  return '';
}

function prepare(seq: DemoSequence) {
  const ed = editor.value;
  if (!ed) return;
  ed.setDoc(seq.doc ?? KITCHEN);
  ed.setOutline(true);
  if (ed.isZoomed()) ed.zoomOut();
  ed.foldAll('unfold');
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Plays from `start`, then every following sequence, around and around,
 * until something stops it. */
async function playFrom(start: number) {
  const ed = editor.value;
  const r = runner.value;
  if (!ed || !r) return;
  const mine = ++run;
  r.cancel();
  status.value = 'playing';
  index.value = start;
  while (run === mine) {
    const seq = list.value[index.value]!;
    prepare(seq);
    stepIndex.value = 0;
    stepCount.value = seq.steps.length;
    stepLabel.value = '';
    await r.run(seq.steps, (step, i) => {
      stepIndex.value = i + 1;
      const label = labelOf(step);
      if (label) stepLabel.value = label;
    });
    if (run !== mine) return;
    await sleep(props.between);
    if (run !== mine) return;
    index.value = (index.value + 1) % list.value.length;
  }
}

function stop(next: 'paused' | 'stopped') {
  run++;
  runner.value?.cancel();
  status.value = next;
  stepLabel.value = '';
}

function toggle() {
  if (status.value === 'playing') stop('stopped');
  else void playFrom(index.value);
}

function pick(i: number) {
  void playFrom(i);
}

onMounted(async () => {
  const { createOutlineEditor, scriptRunner } = await import('../../demo/editor');
  await import('../../demo/obsidian-theme.css');
  // The plugin's stylesheet, from its parts under styles/ in filename order.
  import.meta.glob('../../../styles/*.css', { eager: true });
  if (!host.value) return;
  const ed = createOutlineEditor(host.value, { doc: current.value.doc ?? KITCHEN, path: props.title, outline: true });
  editor.value = ed;
  runner.value = scriptRunner(ed, props.delay);
  stopInput = ed.onUserInput(() => {
    if (status.value === 'playing') stop('paused');
  });
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      if (visible && status.value === 'idle') void playFrom(0);
      // Out of view, a cycling demo is work nobody sees; back in view it
      // resumes only if nobody stopped it.
      if (!visible && status.value === 'playing') stop('stopped'), (status.value = 'idle');
    },
    { threshold: 0.35 },
  );
  observer.observe(host.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  stopInput?.();
  runner.value?.cancel();
  editor.value?.destroy();
});
</script>

<template>
  <ClientOnly>
    <div class="to-gallery" v-bind="$attrs">
      <figure class="to-demo-frame">
        <div class="to-demo-bar">
          <span class="to-demo-title">{{ title }}</span>
          <span class="to-demo-state" :class="{ 'is-playing': status === 'playing', 'is-paused': status === 'paused' }">{{ stateText }}</span>
          <button type="button" @click="toggle" :aria-pressed="status === 'playing'">
            {{ status === 'playing' ? 'Stop' : status === 'paused' ? 'Resume' : 'Play' }}
          </button>
        </div>
        <div class="to-demo-body">
          <div ref="host" style="height: 100%"></div>
          <div class="to-demo-hint" :class="{ 'is-on': !!stepLabel && status === 'playing' }">{{ stepLabel }}</div>
        </div>
        <figcaption class="to-demo-caption">
          <span v-if="status === 'paused'">Type, press <kbd>Tab</kbd>, <kbd>⌘A</kbd> or <kbd>⌘⌥↑</kbd>, click a marker. Resume when you are done.</span>
          <span v-else>Live: the plugin's own editor code, running here. Click into it to try the keys yourself.</span>
        </figcaption>
      </figure>
      <aside class="to-gallery-side">
        <div class="to-gallery-current" aria-live="polite">
          <h3>{{ current.title }}</h3>
          <p>{{ current.blurb }}</p>
          <div class="to-gallery-keys"><kbd v-for="k in current.keys" :key="k">{{ k }}</kbd></div>
          <p class="to-gallery-more"><a :href="withBase(current.link)">In the guide</a></p>
        </div>
        <ol class="to-gallery-index">
          <li v-for="(seq, i) in list" :key="seq.id" :class="{ 'is-active': i === index }">
            <button type="button" @click="pick(i)" :aria-current="i === index ? 'true' : undefined">
              <span class="to-gallery-num">{{ String(i + 1).padStart(2, '0') }}</span>
              <span>{{ seq.title }}</span>
              <span
                v-if="i === index && status === 'playing'"
                class="to-gallery-progress"
                :style="{ '--progress': `${Math.round((stepIndex / stepCount) * 100)}%` }"
              ></span>
            </button>
          </li>
        </ol>
      </aside>
    </div>
  </ClientOnly>
</template>
