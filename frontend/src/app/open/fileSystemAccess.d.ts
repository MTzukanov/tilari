/** File System Access API bits not yet in TypeScript's DOM lib. */

interface FilePickerAcceptType {
  description?: string
  accept: Record<string, string | readonly string[]>
}

interface FilePickerOptions {
  types?: readonly FilePickerAcceptType[]
  excludeAcceptAllOption?: boolean
  id?: string
  startIn?: FileSystemHandle | WellKnownDirectory
}

interface OpenFilePickerOptions extends FilePickerOptions {
  multiple?: boolean
  mode?: 'read' | 'readwrite'
}

interface SaveFilePickerOptions extends FilePickerOptions {
  suggestedName?: string
}

type WellKnownDirectory = 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface Window {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
}
