/**
 * @file 通用非编辑型下拉菜单
 * @description
 * 提供受控单选、Portal 定位、完整键盘导航以及候选加载与空状态。
 */
import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Check, ChevronDown, LoaderCircle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { ICON_SIZE_SMALL } from '../constants/ui';

export type SelectMenuValue = string | number;

export interface SelectMenuOption<T extends SelectMenuValue> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface SelectMenuProps<T extends SelectMenuValue> {
  value: T;
  options: readonly SelectMenuOption<T>[];
  onChange: (value: T) => void;
  loadingLabel: string;
  emptyLabel: string;
  ariaLabel: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  fallbackLabel?: string;
}

type SelectMenuPlacement = 'top' | 'bottom';

interface SelectMenuPosition {
  placement: SelectMenuPlacement;
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

const SELECT_MENU_VIEWPORT_GUTTER_PX = 8;
const SELECT_MENU_TRIGGER_GAP_PX = 4;
const SELECT_MENU_MAX_HEIGHT_PX = 288;
const SELECT_MENU_MIN_WIDTH_PX = 160;
const SELECT_MENU_PREFERRED_SPACE_PX = 160;

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const isSameValue = <T extends SelectMenuValue>(left: T, right: T): boolean =>
  Object.is(left, right);

const getSelectableIndices = <T extends SelectMenuValue>(
  options: readonly SelectMenuOption<T>[]
): number[] => options.flatMap((option, index) => (option.disabled ? [] : [index]));

const getInitialActiveIndex = <T extends SelectMenuValue>(
  options: readonly SelectMenuOption<T>[],
  value: T,
  fallback: 'first' | 'last' = 'first'
): number => {
  const selectedIndex = options.findIndex(
    (option) => !option.disabled && isSameValue(option.value, value)
  );

  if (selectedIndex >= 0) {
    return selectedIndex;
  }

  const selectableIndices = getSelectableIndices(options);
  return fallback === 'first' ? (selectableIndices[0] ?? -1) : (selectableIndices.at(-1) ?? -1);
};

const moveActiveIndex = <T extends SelectMenuValue>(
  options: readonly SelectMenuOption<T>[],
  activeIndex: number,
  direction: 1 | -1
): number => {
  const selectableIndices = getSelectableIndices(options);

  if (selectableIndices.length === 0) {
    return -1;
  }

  const currentPosition = selectableIndices.indexOf(activeIndex);

  if (currentPosition < 0) {
    return direction === 1 ? (selectableIndices[0] ?? -1) : (selectableIndices.at(-1) ?? -1);
  }

  const nextPosition =
    (currentPosition + direction + selectableIndices.length) % selectableIndices.length;
  return selectableIndices[nextPosition] ?? -1;
};

export const getSelectMenuPosition = (
  triggerRect: DOMRect,
  viewportWidth: number,
  viewportHeight: number
): SelectMenuPosition => {
  const availableBelow =
    viewportHeight -
    triggerRect.bottom -
    SELECT_MENU_VIEWPORT_GUTTER_PX -
    SELECT_MENU_TRIGGER_GAP_PX;
  const availableAbove =
    triggerRect.top - SELECT_MENU_VIEWPORT_GUTTER_PX - SELECT_MENU_TRIGGER_GAP_PX;
  const placement: SelectMenuPlacement =
    availableBelow >= SELECT_MENU_PREFERRED_SPACE_PX || availableBelow >= availableAbove
      ? 'bottom'
      : 'top';
  const availableHeight = Math.max(0, placement === 'bottom' ? availableBelow : availableAbove);
  const viewportContentWidth = Math.max(0, viewportWidth - SELECT_MENU_VIEWPORT_GUTTER_PX * 2);
  const width = Math.min(
    Math.max(triggerRect.width, SELECT_MENU_MIN_WIDTH_PX),
    viewportContentWidth
  );
  const left = Math.min(
    Math.max(triggerRect.left, SELECT_MENU_VIEWPORT_GUTTER_PX),
    Math.max(SELECT_MENU_VIEWPORT_GUTTER_PX, viewportWidth - SELECT_MENU_VIEWPORT_GUTTER_PX - width)
  );
  const sharedPosition = {
    placement,
    left,
    width,
    maxHeight: Math.min(SELECT_MENU_MAX_HEIGHT_PX, availableHeight),
  };

  return placement === 'bottom'
    ? { ...sharedPosition, top: triggerRect.bottom + SELECT_MENU_TRIGGER_GAP_PX }
    : {
        ...sharedPosition,
        bottom: viewportHeight - triggerRect.top + SELECT_MENU_TRIGGER_GAP_PX,
      };
};

const SelectMenu = <T extends SelectMenuValue>({
  value,
  options,
  onChange,
  loadingLabel,
  emptyLabel,
  ariaLabel,
  disabled = false,
  loading = false,
  className,
  fallbackLabel,
}: SelectMenuProps<T>): React.ReactElement => {
  const generatedId = useId();
  const listboxId = `${generatedId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState<T | null>(null);
  const [position, setPosition] = useState<SelectMenuPosition | null>(null);
  const selectedOption = useMemo(
    () => options.find((option) => isSameValue(option.value, value)),
    [options, value]
  );
  const displayLabel = selectedOption?.label ?? fallbackLabel ?? String(value);
  const activeIndex =
    open && activeValue !== null
      ? options.findIndex((option) => !option.disabled && isSameValue(option.value, activeValue))
      : -1;
  const activeOptionId =
    open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;
  const showEmptyState = !loading && options.length === 0;
  const wrapperClassName = ['select-menu', className].filter(Boolean).join(' ');

  const closeMenu = useCallback((): void => {
    setOpen(false);
    setActiveValue(null);
    setPosition(null);
  }, []);

  const openMenu = (fallback: 'first' | 'last' = 'first'): void => {
    if (disabled) {
      return;
    }

    setOpen(true);
    const nextIndex = getInitialActiveIndex(options, value, fallback);
    setActiveValue(options[nextIndex]?.value ?? null);
  };

  const selectOption = (option: SelectMenuOption<T>): void => {
    if (disabled || option.disabled) {
      return;
    }

    onChange(option.value);
    closeMenu();
    triggerRef.current?.focus();
  };

  const handleTriggerClick = (): void => {
    if (open) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  const handleTriggerKeyDownCapture = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'Escape' || !open) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;

      if (open) {
        const nextIndex = moveActiveIndex(options, activeIndex, direction);
        setActiveValue(options[nextIndex]?.value ?? null);
      } else {
        openMenu(direction === 1 ? 'first' : 'last');
      }
      return;
    }

    if (event.key === 'Home' && open) {
      event.preventDefault();
      const nextIndex = getSelectableIndices(options)[0] ?? -1;
      setActiveValue(options[nextIndex]?.value ?? null);
      return;
    }

    if (event.key === 'End' && open) {
      event.preventDefault();
      const nextIndex = getSelectableIndices(options).at(-1) ?? -1;
      setActiveValue(options[nextIndex]?.value ?? null);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();

      if (!open) {
        openMenu();
        return;
      }

      const option = options[activeIndex];
      if (option) {
        selectOption(option);
      }
      return;
    }

    if (event.key === 'Tab' && open) {
      closeMenu();
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    if (activeIndex >= 0) {
      return;
    }

    const nextIndex = getInitialActiveIndex(options, value);
    setActiveValue(options[nextIndex]?.value ?? null);
  }, [activeIndex, open, options, value]);

  useEffect(() => {
    if (disabled && open) {
      closeMenu();
    }
  }, [closeMenu, disabled, open]);

  useEffect(() => {
    if (!open || !activeOptionId) {
      return;
    }

    const activeOption = document.getElementById(activeOptionId);
    activeOption?.scrollIntoView?.({ block: 'nearest' });
  }, [activeOptionId, open]);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = (): void => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      setPosition(
        getSelectMenuPosition(
          trigger.getBoundingClientRect(),
          window.innerWidth,
          window.innerHeight
        )
      );
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }

      closeMenu();
    };
    const handleScroll = (event: Event): void => {
      const target = event.target;
      if (target instanceof Node && popoverRef.current?.contains(target)) {
        return;
      }

      closeMenu();
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [closeMenu, open]);

  const popoverStyle: React.CSSProperties | undefined = position
    ? {
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
        ...(position.top === undefined ? {} : { top: position.top }),
        ...(position.bottom === undefined ? {} : { bottom: position.bottom }),
      }
    : undefined;

  return (
    <div className={wrapperClassName}>
      <button
        ref={triggerRef}
        type="button"
        className="select-menu-trigger"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        aria-busy={loading || undefined}
        disabled={disabled}
        title={displayLabel}
        onClick={handleTriggerClick}
        onKeyDownCapture={handleTriggerKeyDownCapture}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="select-menu-value">{displayLabel}</span>
        {loading ? (
          <LoaderCircle
            className="select-menu-loading-icon"
            aria-hidden="true"
            size={ICON_SIZE_SMALL}
          />
        ) : (
          <ChevronDown className="select-menu-chevron" aria-hidden="true" size={ICON_SIZE_SMALL} />
        )}
      </button>
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              className="select-menu-popover"
              data-placement={position?.placement ?? 'bottom'}
              style={popoverStyle}
            >
              {loading ? (
                <div className="select-menu-status select-menu-status--loading" role="status">
                  <LoaderCircle aria-hidden="true" size={ICON_SIZE_SMALL} />
                  <span>{loadingLabel}</span>
                </div>
              ) : null}
              <div
                id={listboxId}
                className="select-menu-listbox"
                role="listbox"
                aria-label={ariaLabel}
                aria-busy={loading || undefined}
              >
                {options.map((option, index) => {
                  const selected = isSameValue(option.value, value);
                  const active = index === activeIndex;
                  const optionClassName = [
                    'select-menu-option',
                    selected ? 'selected' : '',
                    active ? 'active' : '',
                    option.disabled ? 'disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <div
                      id={`${listboxId}-option-${index}`}
                      key={`${typeof option.value}:${String(option.value)}`}
                      className={optionClassName}
                      role="option"
                      aria-selected={selected}
                      aria-disabled={option.disabled || undefined}
                      onMouseEnter={() => {
                        if (!option.disabled) {
                          setActiveValue(option.value);
                        }
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectOption(option)}
                    >
                      <span className="select-menu-option-copy">
                        <strong>{option.label}</strong>
                        {option.description ? <small>{option.description}</small> : null}
                      </span>
                      {selected ? <Check aria-hidden="true" size={ICON_SIZE_SMALL} /> : null}
                    </div>
                  );
                })}
              </div>
              {showEmptyState ? (
                <div className="select-menu-status select-menu-status--empty" role="status">
                  {emptyLabel}
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export default SelectMenu;
