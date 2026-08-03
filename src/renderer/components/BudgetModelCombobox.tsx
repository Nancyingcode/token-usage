/**
 * @file 预算模型组合框
 * @description
 * 提供可直接输入模型 ID 的受控组合框，并以键盘和 ARIA 语义暴露固定与动态模型候选。
 */
import React, { useEffect, useId, useState } from 'react';
import { getBudgetModelTargetKey } from '../../shared/budgetModelTarget';
import type { BudgetModelTarget } from '../../shared/budgetTypes';
import type { BudgetModelOption } from '../utils/budgetModelOptions';

interface BudgetModelComboboxProps {
  value: BudgetModelTarget;
  options: BudgetModelOption[];
  label: string;
  allModelsLabel: string;
  unknownModelLabel: string;
  error?: string;
  onChange: (target: BudgetModelTarget) => void;
}

const getTargetLabel = (
  target: BudgetModelTarget,
  allModelsLabel: string,
  unknownModelLabel: string
): string => {
  if (target.kind === 'all') {
    return allModelsLabel;
  }

  if (target.kind === 'unknown') {
    return unknownModelLabel;
  }

  return target.modelId;
};

const BudgetModelCombobox: React.FC<BudgetModelComboboxProps> = ({
  value,
  options,
  label,
  allModelsLabel,
  unknownModelLabel,
  error,
  onChange,
}) => {
  const generatedId = useId();
  const inputId = `${generatedId}-input`;
  const listboxId = `${generatedId}-listbox`;
  const errorId = `${generatedId}-error`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [displayValue, setDisplayValue] = useState(() =>
    getTargetLabel(value, allModelsLabel, unknownModelLabel)
  );
  const selectedKey = getBudgetModelTargetKey(value);
  const activeOptionId =
    open && activeIndex >= 0 ? `${generatedId}-option-${activeIndex}` : undefined;

  useEffect(() => {
    setDisplayValue(getTargetLabel(value, allModelsLabel, unknownModelLabel));
  }, [allModelsLabel, unknownModelLabel, value]);

  const closeList = (): void => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const selectOption = (option: BudgetModelOption): void => {
    const target = { ...option.target };
    setDisplayValue(getTargetLabel(target, allModelsLabel, unknownModelLabel));
    onChange(target);
    closeList();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current + 1) % options.length);
      return;
    }

    if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current <= 0 ? options.length - 1 : current - 1));
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

    if (event.key === 'Escape') {
      event.preventDefault();
      closeList();
      return;
    }

    if (event.key === 'Tab') {
      closeList();
    }
  };

  return (
    <div className="form-field budget-model-combobox">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        role="combobox"
        value={displayValue}
        aria-autocomplete="list"
        aria-controls={listboxId}
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
          onChange({ kind: 'model', modelId });
        }}
        onKeyDown={handleKeyDown}
      />
      <div id={listboxId} className="budget-model-combobox-list" role="listbox" hidden={!open}>
        {options.map((option, index) => {
          const optionId = `${generatedId}-option-${index}`;
          const active = index === activeIndex;
          const selected = option.key === selectedKey;
          const className = [
            'budget-model-combobox-option',
            active ? 'active' : '',
            selected ? 'selected' : '',
          ]
            .filter(Boolean)
            .join(' ');

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
              {getTargetLabel(option.target, allModelsLabel, unknownModelLabel)}
            </div>
          );
        })}
      </div>
      {error ? (
        <small id={errorId} className="field-error">
          {error}
        </small>
      ) : null}
    </div>
  );
};

export default BudgetModelCombobox;
