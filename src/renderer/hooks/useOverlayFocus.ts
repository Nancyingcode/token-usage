/**
 * @file Overlay focus management
 * @description Moves focus into overlays, contains keyboard navigation, and restores prior focus.
 */
import React from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const useOverlayFocus = <T extends HTMLElement>(
  onClose: () => void
): React.RefCallback<T> => {
  const onCloseRef = React.useRef(onClose);
  const cleanupRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const overlayRef = React.useCallback((overlay: T | null): void => {
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (!overlay) {
      return;
    }

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = [...overlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        return;
      }

      const focusIsOutside = !overlay.contains(document.activeElement);
      const shouldWrapBackward =
        event.shiftKey && (document.activeElement === firstElement || focusIsOutside);
      const shouldWrapForward =
        !event.shiftKey && (document.activeElement === lastElement || focusIsOutside);

      if (shouldWrapBackward || shouldWrapForward) {
        event.preventDefault();
        (shouldWrapBackward ? lastElement : firstElement).focus();
      }
    };

    overlay.addEventListener('keydown', handleKeyDown);
    cleanupRef.current = () => {
      overlay.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  React.useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    []
  );

  return overlayRef;
};
