/**
 * @file 用量表格焦点
 * @description 数据改变可见行时保留键盘阅读位置。
 */
import { type FocusEventHandler, useEffect, useLayoutEffect, useRef } from 'react';

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface FocusedRowControl {
  control: HTMLElement;
  position: number;
}

const getRowPosition = (control: HTMLElement): number => {
  const row = control.closest('tr, [role="row"]');
  const rowGroup = row?.parentElement;
  return rowGroup ? Array.from(rowGroup.children).indexOf(row) : -1;
};

export const useUsageTableFocus = (visibleRows: readonly unknown[]) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef<FocusedRowControl | null>(null);

  const onRowFocus: FocusEventHandler<HTMLElement> = ({ target }) => {
    if (target instanceof HTMLElement) {
      focusedRef.current = { control: target, position: getRowPosition(target) };
    }
  };

  const onRowBlur = (): void => {
    focusedRef.current = null;
  };

  useBrowserLayoutEffect(() => {
    const focused = focusedRef.current;
    const search = searchRef.current;
    if (!focused || !search) {
      return;
    }

    const { activeElement, body } = search.ownerDocument;
    const lostFocusDuringUpdate = activeElement === body;
    if (activeElement !== focused.control && !lostFocusDuringUpdate) {
      focusedRef.current = null;
      return;
    }

    // A data update can detach the active control without a React blur event.
    if (!focused.control.isConnected) {
      focusedRef.current = null;
      search.focus();
      return;
    }

    if (lostFocusDuringUpdate) {
      focused.control.focus({ preventScroll: true });
    }
    const position = getRowPosition(focused.control);
    if (lostFocusDuringUpdate || position !== focused.position) {
      focused.control.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      focusedRef.current = { control: focused.control, position };
    }
  }, [visibleRows]);

  return { searchRef, onRowFocus, onRowBlur };
};
