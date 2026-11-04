import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/**
 * Drop audio files anywhere in the app. `dragging` is true while files are held over the
 * window (to show the overlay); `onFiles` gets the dropped files.
 * Only file drags count: dragging text or a link inside the page does nothing.
 * Example: drag song.mp3 from Finder onto My Moments → overlay shows → drop → it is imported.
 */
export function useFileDrop(onFiles: (files: File[]) => void): { dragging: Ref<boolean> } {
  const dragging = ref(false);
  // dragenter/dragleave fire for every child element; count them so the overlay does not flicker.
  let depth = 0;
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

  function enter(e: DragEvent) { if (!hasFiles(e)) return; depth++; dragging.value = true; }
  function over(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault(); // allows the drop instead of the browser opening the file
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }
  function leave(e: DragEvent) { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) dragging.value = false; }
  function drop(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0; dragging.value = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) onFiles(files);
  }

  onMounted(() => {
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('dragenter', enter);
    window.removeEventListener('dragover', over);
    window.removeEventListener('dragleave', leave);
    window.removeEventListener('drop', drop);
  });
  return { dragging };
}
