import { invoke } from "@tauri-apps/api/core";

export async function cancelRunningTests() {
  await invoke("abort_all_tasks");
}
