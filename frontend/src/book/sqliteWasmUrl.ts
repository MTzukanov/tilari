/** Browser/Vite-only WASM URL. Node loads the binary via fs in sqlite.ts. */
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

export default wasmUrl
