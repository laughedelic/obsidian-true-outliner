export interface Column {
	header: string;
	lines: string[];
}

export interface Range {
	anchor: number;
	head: number;
}

export interface ReadDocument {
	text: string;
	selection: Range | null;
	blockLines: number[];
}

export interface DrawnState {
	text: string;
	ranges?: readonly Range[];
	blockLines?: readonly number[];
}

export type KeyStep =
	| { kind: 'chord'; mods: ('mod' | 'ctrl' | 'alt' | 'shift')[]; key: string; times: number; source: string }
	| { kind: 'text'; text: string; source: string };

export interface ParsedCase {
	title: string | undefined;
	outline: boolean;
	tabs: boolean;
	platform: 'desktop' | 'mobile' | undefined;
	phases: KeyStep[][];
	before: ReadDocument;
	beforeLines: string[];
	clipboard: string | undefined;
	results: (ReadDocument & { header: string; lines: string[] })[];
	references: string[];
}

export function readColumns(text: string): (Column & { line: number })[];
export function readDocument(rawLines: readonly string[], firstLine?: number): ReadDocument;
export function drawDocument(state: DrawnState): string[];
export function layout(columns: readonly Column[]): string;
export function undraw(block: string): Column[];
export function parseKeys(value: string): KeyStep[][];
export function parseCase(source: string): ParsedCase;
