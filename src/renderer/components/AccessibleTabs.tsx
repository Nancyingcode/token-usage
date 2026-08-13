/**
 * @file Accessible controlled tabs
 * @description Implements the ARIA tab keyboard model and stable tab-to-panel identifiers.
 */

import React from 'react';

export interface AccessibleTab<T extends string> {
  value: T;
  label: string;
}

interface AccessibleTabsProps<T extends string> {
  groupId: string;
  label: string;
  value: T;
  tabs: ReadonlyArray<AccessibleTab<T>>;
  onChange: (value: T) => void;
}

export const getTabId = (groupId: string, value: string): string => `${groupId}-tab-${value}`;

export const getTabPanelId = (groupId: string, value: string): string =>
  `${groupId}-panel-${value}`;

const AccessibleTabs = <T extends string>({
  groupId,
  label,
  value,
  tabs,
  onChange,
}: AccessibleTabsProps<T>): React.ReactElement => {
  const buttonByValueRef = React.useRef(new Map<T, HTMLButtonElement>());

  const selectAndFocus = (target: AccessibleTab<T>): void => {
    onChange(target.value);
    buttonByValueRef.current.get(target.value)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let targetIndex: number;

    switch (event.key) {
      case 'ArrowLeft':
        targetIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case 'ArrowRight':
        targetIndex = (index + 1) % tabs.length;
        break;
      case 'Home':
        targetIndex = 0;
        break;
      case 'End':
        targetIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    const target = tabs[targetIndex];
    if (!target) {
      return;
    }

    event.preventDefault();
    selectAndFocus(target);
  };

  return (
    <div className="accessible-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => {
        const selected = value === tab.value;

        return (
          <button
            key={tab.value}
            ref={(node) => {
              if (node) {
                buttonByValueRef.current.set(tab.value, node);
              } else {
                buttonByValueRef.current.delete(tab.value);
              }
            }}
            id={getTabId(groupId, tab.value)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={getTabPanelId(groupId, tab.value)}
            tabIndex={selected ? 0 : -1}
            className={selected ? 'accessible-tab active' : 'accessible-tab'}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default AccessibleTabs;
