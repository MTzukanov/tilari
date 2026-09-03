/** Vite `?url` imports pulled in via shared frontend sqlite loader. */
declare module '*.wasm?url' {
  const url: string
  export default url
}
