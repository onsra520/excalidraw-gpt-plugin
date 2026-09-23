import type { Tool } from '@modelcontextprotocol/server';

type ToolAnnotations = NonNullable<Tool['annotations']>;

const LOCAL_READ: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

const LOCAL_WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
};

const LOCAL_DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
};

const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  create_element: LOCAL_WRITE,
  update_element: LOCAL_WRITE,
  delete_element: LOCAL_DESTRUCTIVE,
  query_elements: LOCAL_READ,
  get_resource: LOCAL_READ,
  group_elements: LOCAL_WRITE,
  ungroup_elements: LOCAL_WRITE,
  align_elements: LOCAL_WRITE,
  distribute_elements: LOCAL_WRITE,
  lock_elements: LOCAL_WRITE,
  unlock_elements: LOCAL_WRITE,
  create_from_mermaid: LOCAL_WRITE,
  batch_create_elements: LOCAL_WRITE,
  get_element: LOCAL_READ,
  clear_canvas: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false
  },
  export_scene: LOCAL_WRITE,
  import_scene: LOCAL_DESTRUCTIVE,
  export_to_image: LOCAL_WRITE,
  duplicate_elements: LOCAL_WRITE,
  snapshot_scene: LOCAL_WRITE,
  restore_snapshot: LOCAL_DESTRUCTIVE,
  describe_scene: LOCAL_READ,
  get_canvas_screenshot: LOCAL_READ,
  read_diagram_guide: LOCAL_READ,
  export_to_excalidraw_url: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  },
  set_viewport: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export function annotationsForTool(name: string): ToolAnnotations {
  const annotations = TOOL_ANNOTATIONS[name];
  if (!annotations) {
    throw new Error(`Missing MCP safety annotations for tool: ${name}`);
  }
  return annotations;
}
