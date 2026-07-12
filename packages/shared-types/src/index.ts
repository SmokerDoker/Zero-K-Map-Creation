/** Metadata stored in a map project's `project.json`. */
export interface MapProjectMetadata {
  /** Schema version of project.json itself, for future migrations. */
  schemaVersion: 1
  name: string
  author: string
  /** Map version string shown in Zero-K's map list, e.g. "1.0". */
  version: string
  description: string
  /** Map size in Spring "map squares" (e.g. 10x10 -> 640x640 world units). */
  size: {
    width: number
    height: number
  }
  createdAt: string
  updatedAt: string
}

/** A project as known to the app: metadata plus its location on disk. */
export interface MapProjectSummary extends MapProjectMetadata {
  /** Absolute path to the project's root folder (the `.zkmap` directory). */
  projectPath: string
}
