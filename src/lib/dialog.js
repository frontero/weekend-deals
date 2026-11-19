/**
 * Closes a dialog on a click outside it, on its backdrop. Such a click lands on the dialog element itself: a click
 * inside lands on what the dialog holds, as none of them has padding of its own.
 */
export function closeOnBackdrop(event) {
  if (event.target === event.currentTarget) event.currentTarget.close();
}
