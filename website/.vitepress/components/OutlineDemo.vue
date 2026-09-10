<script setup lang="ts">
/**
 * A live editor running the plugin's own extensions, framed for a docs page
 * or the landing page. Client-only: CodeMirror needs a DOM, and the shim
 * installs Obsidian's element helpers on import.
 */
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { OutlineEditor, ScriptRunner, ScriptStep, DemoSettings } from '../../demo/editor';

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
const playing = ref(false);
const stepLabel = ref('');
const zoomed = ref(false);
let observer: IntersectionObserver | null = null;
let played = false;

function labelOf(step: ScriptStep): string {
  if ('key' in step) {
    if (step.label) return step.label;
    const isMac = navigator.platform.startsWith('Mac');
    const parts: string[] = [];
    if (step.mod) parts.push(isMac ? '⌘' : 'Ctrl');
    if (step.alt) parts.push(isMac ? '⌥' : 'Alt');
    if (step.shift) parts.push('⇧');
    const names: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: '↵', Tab: 'Tab' };
    parts.push(names[step.key] ?? step.key);
    return parts.join(isMac ? '' : '+');
  }
  if ('type' in step) return `type "${step.type}"`;
  if ('say' in step) return step.say;
  if ('click' in step) return 'click marker';
  if ('outline' in step) return step.outline ? 'outline mode on' : 'outline mode off';
  return '';
}

async function play() {
  const ed = editor.value;
  const r = runner.value;
  if (!ed || !r || !props.script) return;
  if (playing.value) {
    r.cancel();
    playing.value = false;
    stepLabel.value = '';
    return;
  }
  playing.value = true;
  ed.setDoc(props.doc);
  ed.setOutline(props.outline);
  outlineOn.value = props.outline;
  if (ed.isZoomed()) ed.zoomOut();
  do {
    await r.run(props.script, (step) => {
      stepLabel.value = labelOf(step);
      outlineOn.value = ed.isOutline();
      zoomed.value = ed.isZoomed();
    });
    if (!playing.value) break;
    if (props.loop) {
      await new Promise((res) => setTimeout(res, 1800));
      if (!playing.value) break;
      ed.setDoc(props.doc);
      ed.setOutline(props.outline);
      if (ed.isZoomed()) ed.zoomOut();
    }
  } while (playing.value && props.loop);
  playing.value = false;
  stepLabel.value = '';
  zoomed.value = ed.isZoomed();
}

function reset() {
  const ed = editor.value;
  if (!ed) return;
  runner.value?.cancel();
  playing.value = false;
  stepLabel.value = '';
  ed.setDoc(props.doc);
  if (ed.isZoomed()) ed.zoomOut();
  zoomed.value = false;
}

function setOutline(on: boolean) {
  editor.value?.setOutline(on);
  outlineOn.value = on;
  zoomed.value = editor.value?.isZoomed() ?? false;
}

function zoomOut() {
  editor.value?.zoomOut();
  zoomed.value = false;
}

onMounted(async () => {
  const { createOutlineEditor, scriptRunner } = await import('../../demo/editor');
  await import('../../demo/obsidian-theme.css');
  await import('../../../styles.css');
  if (!host.value) return;
  const ed = createOutlineEditor(host.value, {
    doc: props.doc,
    path: props.path ?? props.title,
    settings: props.settings,
    outline: props.outline,
  });
  editor.value = ed;
  runner.value = scriptRunner(ed, props.delay);
  ed.view.dom.addEventListener('focusin', () => {
    if (playing.value) return;
  });
  const sync = () => {
    zoomed.value = ed.isZoomed();
    outlineOn.value = ed.isOutline();
    sourceText.value = ed.view.state.doc.toString();
  };
  ed.view.dom.addEventListener('keyup', sync);
  ed.view.dom.addEventListener('click', sync);
  if (props.autoplay && props.script) {
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
  if (on && editor.value) sourceText.value = editor.value.view.state.doc.toString();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  runner.value?.cancel();
  editor.value?.destroy();
});
</script>

<template>
  <ClientOnly>
    <figure class="to-demo-frame">
      <div class="to-demo-bar">
        <span class="to-demo-title">{{ title }}</span>
        <button v-if="script" type="button" @click="play" :aria-pressed="playing">
          {{ playing ? 'Stop' : 'Play' }}
        </button>
        <button v-if="script || true" type="button" @click="reset">Reset</button>
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
        <div class="to-demo-hint" :class="{ 'is-on': !!stepLabel }">{{ stepLabel }}</div>
      </div>
      <figcaption v-if="caption || hint" class="to-demo-caption">
        <span v-if="caption">{{ caption }}</span>
        <span v-if="hint" v-html="hint"></span>
      </figcaption>
    </figure>
  </ClientOnly>
</template>
