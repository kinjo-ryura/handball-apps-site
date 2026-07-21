/* tslint:disable */
/* eslint-disable */

/**
 * 配信 JSON → `MatchView` の JSON 文字列。JS 側は `JSON.parse` で受ける。
 *
 * 戻り値を JsValue ではなく文字列にしているのは、境界を 1 回の serialize に閉じて
 * serde-wasm-bindgen 依存を持たないため（粗粒度バッチ 1 往復 — 設計不変条件 4）。
 */
export function buildMatchView(slug: string, json: string, new_ids: string[]): string;

/**
 * `buildMatchView` へ渡す ID の必要数。JS はこの数だけ `crypto.randomUUID()` を生成する。
 */
export function requiredIdCount(json: string): number;

/**
 * ツールキットのバージョン文字列。疎通確認の最小関数。
 * workspace で version を共有しているのでコア crate と同値。
 */
export function toolkitVersion(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly buildMatchView: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly requiredIdCount: (a: number, b: number) => [number, number, number];
    readonly toolkitVersion: () => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_alloc: () => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
