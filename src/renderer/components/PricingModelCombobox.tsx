/**
 * @file 模型价格 Model ID 组合框
 * @description
 * 提供可自由输入的模型价格候选选择，并以禁用项说明缺失 Model ID 的未知用量不可定价。
 */
import React, { useEffect, useId, useState } from 'react';
import { normalizeModelId } from '../../shared/pricing';
import type { PricingModelOption } from '../utils/pricingModelOptions';

interface PricingModelComboboxProps {
  value: string;
  options: PricingModelOption[];
  label: string;
  pricedLabel: string;
  unpricedLabel: string;
  unknownModelLabel: string;
  unknownModelDescription: string;
  emptyLabel: string;
  error?: string;
  onChange: (modelId: string) => void;
}

const findNextSelectableIndex = (
  options: PricingModelOption[],
  currentIndex: number,
  direction: 1 | -1
): number => {
  for (let offset = 1; offset <= options.length; offset += 1) {
    const candidateIndex = (currentIndex + direction * offset + options.length) % options.length;

    if (options[candidateIndex]?.kind === 'model') {
      return candidateIndex;
    }
  }

  return -1;
};

const PricingModelCombobox: React.FC<PricingModelComboboxProps> = ({
  value,
  options,
  label,
  pricedLabel,
  unpricedLabel,
  unknownModelLabel,
  unknownModelDescription,
  emptyLabel,
  error,
  onChange,
}) => {
  const generatedId = useId();
  const inputId = `${generatedId}-input`;
  const listboxId = `${generatedId}-listbox`;
  const errorId = `${generatedId}-error`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [displayValue, setDisplayValue] = useState(value);
  const activeOptionId =
    open && activeIndex >= 0 ? `${generatedId}-option-${activeIndex}` : undefined;

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const closeList = (): void => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const selectOption = (option: PricingModelOption): void => {
    if (option.kind !== 'model') {
      return;
    }

    setDisplayValue(option.modelId);
    onChange(option.modelId);
    closeList();
  };

  const moveActiveOption = (direction: 1 | -1): void => {
    const startingIndex = activeIndex >= 0 ? activeIndex : direction === 1 ? -1 : 0;
    const nextIndex = findNextSelectableIndex(options, startingIndex, direction);

    setOpen(true);
    setActiveIndex(nextIndex);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault();
      moveActiveOption(1);
      return;
    }

    if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault();
      moveActiveOption(-1);
      return;
    }

    if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      const option = options[activeIndex];

      if (option) {
        selectOption(option);
      }
      return;
    }

    if (event.key === 'Tab') {
      closeList();
    }
  };

  const handleKeyDownCapture = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Escape' || !open) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    closeList();
  };

  return (
    <div className="form-field pricing-model-combobox">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        role="combobox"
        value={displayValue}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-activedescendant={activeOptionId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const modelId = event.target.value;
          setDisplayValue(modelId);
          setOpen(true);
          setActiveIndex(-1);
          onChange(modelId);
        }}
        onKeyDownCapture={handleKeyDownCapture}
        onKeyDown={handleKeyDown}
      />
      <div className="pricing-model-combobox-list" hidden={!open}>
        <div
          id={listboxId}
          className="pricing-model-combobox-listbox"
          role="listbox"
          aria-label={label}
        >
          {options.map((option, index) => {
            const optionId = `${generatedId}-option-${index}`;
            const active = index === activeIndex;
            const selected =
              option.kind === 'model' &&
              normalizeModelId(option.modelId) === normalizeModelId(displayValue);
            const className = [
              'pricing-model-combobox-option',
              active ? 'active' : '',
              selected ? 'selected' : '',
              option.kind === 'unknown' ? 'disabled' : '',
            ]
              .filter(Boolean)
              .join(' ');

            if (option.kind === 'unknown') {
              return (
                <div
                  id={optionId}
                  key={option.key}
                  className={className}
                  role="option"
                  aria-selected="false"
                  aria-disabled="true"
                >
                  <strong>{unknownModelLabel}</strong>
                  <small>{unknownModelDescription}</small>
                </div>
              );
            }

            return (
              <div
                id={optionId}
                key={option.key}
                className={className}
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
              >
                <strong>{option.modelId}</strong>
                <small>{option.pricingState === 'priced' ? pricedLabel : unpricedLabel}</small>
              </div>
            );
          })}
        </div>
        {options.length === 0 ? (
          <div className="model-combobox-status" role="status">
            {emptyLabel}
          </div>
        ) : null}
      </div>
      {error ? (
        <small id={errorId} className="field-error">
          {error}
        </small>
      ) : null}
    </div>
  );
};

export default PricingModelCombobox;
