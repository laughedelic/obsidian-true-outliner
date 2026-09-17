<script setup lang="ts">
/**
 * A live editor running the plugin's own extensions, framed for a page.
 * Client-only: CodeMirror needs a DOM, and the shim installs Obsidian's
 * element helpers on import. A scripted run stops the moment a person
 * touches the editor, and the bar says which of the two is happening.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { OutlineEditor, ScriptRunner, ScriptStep, DemoSettings } from '../../demo/editor';

// The root is a ClientOnly fragment, so attributes go to the figure by hand.
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    doc: string;
    title?: string;
    path?: string;
    script?: ScriptStep[];
    autoplay?: boolean;
    loop?: boolean;
    caption?: string;
    hint?: string;
    height?: string;
    settings?: Partial<DemoSettings>;
    toggle?: boolean;
    source?: boolean;
    outline?: boolean;
    delay?: number;
  }>(),
  { title: 'Kitchen renovation.md', autoplay: false, loop: false, toggle: true, source: false, outline: true, delay: 750 },
);

const host = ref<HTMLElement | null>(null);
const editor = shallowRef<OutlineEditor | null>(null);
const runner = shallowRef<ScriptRunner | null>(null);
const outlineOn = ref(props.outline);
const showSource = ref(false);
const sourceText = ref(props.doc);
const status = ref<'idle' | 'playing' | 'paused'>('idle');
const stepLabel = ref('');
const zoomed = ref(false);
let observer: IntersectionObserver | null = null;
let stopInput: (() => void) | null = null;
let played = false;

const playing = computed(() => status.value === 'playing');
const stateText = computed(() =>
  status.value === 'playing' ? 'Playing' : status.value === 'paused' ? 'Paused: the editor is yours' : 'Ready',
);

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

function sync() {
  const ed = editor.value;
  if (!ed) return;
  zoomed.value = ed.isZoomed();
  outlineOn.value = ed.isOutline();
  sourceText.value = ed.view.state.doc.toString();
}

function stop(next: 'idle' | 'paused') {
  runner.value?.cancel();
  status.value = next;
  stepLabel.value = '';
  sync();
}

async function play() {
  const ed = editor.value;
  const r = runner.value;
  if (!ed || !r || !props.script) return;
  if (playing.value) return stop('idle');
  status.value = 'playing';
  ed.setDoc(props.doc);
  ed.setOutline(props.outline);
  if (ed.isZoomed()) ed.zoomOut();
  ed.foldAll('unfold');
  do {
    await r.run(props.script, (step) => {
      const label = labelOf(step);
      if (label) stepLabel.value = label;
      sync();
    });
    if (!playing.value) break;
    if (props.loop) {
      await new Promise((res) => setTimeout(res, 1800));
      if (!playing.value) break;
      ed.setDoc(props.doc);
      ed.setOutline(props.outline);
      if (ed.isZoomed()) ed.zoomOut();
      ed.foldAll('unfold');
    }
  } while (playing.value && props.loop);
  if (playing.value) status.value = 'idle';
  stepLabel.value = '';
  sync();
}

function reset() {
  const ed = editor.value;
  if (!ed) return;
  stop('idle');
  ed.setDoc(props.doc);
  ed.setOutline(props.outline);
  if (ed.isZoomed()) ed.zoomOut();
  ed.foldAll('unfold');
  sync();
}

function setOutline(on: boolean) {
  editor.value?.setOutline(on);
  sync();
}

function zoomOut() {
  editor.value?.zoomOut();
  sync();
}

onMounted(async () => {
  const { createOutlineEditor, scriptRunner } = await import('../../demo/editor');
  await import('../../demo/obsidian-theme.css');
  // The plugin's stylesheet, from its parts under styles/ in filename order.
  import.meta.glob('../../../styles/*.css', { eager: true });
  if (!host.value) return;
  const ed = createOutlineEditor(host.value, {
    doc: props.doc,
    path: props.path ?? props.title,
    settings: props.settings,
    outline: props.outline,
  });
  editor.value = ed;
  runner.value = scriptRunner(ed, props.delay);
  stopInput = ed.onUserInput(() => {
    if (playing.value) stop('paused');
  });
  ed.view.dom.addEventListener('keyup', sync);
  ed.view.dom.addEventListener('click', sync);
  if (props.autoplay && props.script && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !played) {
          played = true;
          void play();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(host.value);
  }
});

watch(showSource, (on) => {
  if (on) sync();
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
    <figure class="to-demo-frame" v-bind="$attrs">
      <div class="to-demo-bar">
        <span class="to-demo-title">{{ title }}</span>
        <span v-if="script" class="to-demo-state" :class="{ 'is-playing': playing, 'is-paused': status === 'paused' }">{{ stateText }}</span>
        <button v-if="script" type="button" @click="play" :aria-pressed="playing">
          {{ playing ? 'Stop' : status === 'paused' ? 'Play again' : 'Play' }}
        </button>
        <button type="button" @click="reset">Reset</button>
        <button v-if="zoomed" type="button" @click="zoomOut">Zoom out</button>
        <button v-if="toggle" type="button" :aria-pressed="outlineOn" @click="setOutline(!outlineOn)">
          Outline mode
        </button>
        <button v-if="source" type="button" :aria-pressed="showSource" @click="showSource = !showSource">
          Markdown
        </button>
      </div>
      <div class="to-demo-body" :style="height ? { height } : undefined">
        <div ref="host" v-show="!showSource" style="height: 100%"></div>
        <pre v-if="showSource" class="to-demo-source">{{ sourceText }}</pre>
        <div class="to-demo-hint" :class="{ 'is-on': !!stepLabel && playing }">{{ stepLabel }}</div>
      </div>
      <figcaption v-if="caption || hint" class="to-demo-caption">
        <span v-if="caption">{{ caption }}</span>
        <span v-if="hint" v-html="hint"></span>
      </figcaption>
    </figure>
  </ClientOnly>
</template>
