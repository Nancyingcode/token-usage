// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SelectMenu, { type SelectMenuOption } from '../src/renderer/components/SelectMenu';

const OPTIONS = [
  { value: 'all', label: 'All projects' },
  { value: 'alpha', label: 'Alpha' },
  { value: 'disabled', label: 'Disabled project', disabled: true },
  { value: 'omega', label: 'Omega', description: 'Most recently active' },
] as const satisfies readonly SelectMenuOption<string>[];

interface RenderSelectMenuOptions {
  value?: string;
  options?: readonly SelectMenuOption<string>[];
  loading?: boolean;
  disabled?: boolean;
  onChange?: (value: string) => void;
}

const renderSelectMenu = ({
  value = 'all',
  options = OPTIONS,
  loading = false,
  disabled = false,
  onChange = vi.fn(),
}: RenderSelectMenuOptions = {}) => {
  const onParentKeyDown = vi.fn<(event: React.KeyboardEvent<HTMLDivElement>) => void>();
  const result = render(
    <div onKeyDown={onParentKeyDown}>
      <label>
        <span>Project</span>
        <SelectMenu
          value={value}
          options={options}
          ariaLabel="Project"
          loading={loading}
          disabled={disabled}
          loadingLabel="Loading options…"
          emptyLabel="No options available"
          onChange={onChange}
        />
      </label>
    </div>
  );

  return {
    ...result,
    trigger: screen.getByRole('combobox', { name: 'Project' }),
    onChange,
    onParentKeyDown,
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SelectMenu', () => {
  it('renders its listbox in a portal and selects an option with the mouse', () => {
    const { trigger, onChange } = renderSelectMenu();

    expect(trigger.hasAttribute('aria-controls')).toBe(false);
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    expect(listbox.getAttribute('aria-label')).toBe('Project');
    expect(listbox.parentElement?.classList.contains('select-menu-popover')).toBe(true);
    expect(listbox.parentElement?.parentElement).toBe(document.body);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(listbox.id);
    expect(screen.getByRole('option', { name: 'All projects' }).getAttribute('aria-selected')).toBe(
      'true'
    );

    fireEvent.mouseDown(screen.getByRole('option', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('option', { name: 'Alpha' }));

    expect(onChange).toHaveBeenCalledWith('alpha');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('supports complete keyboard navigation while skipping disabled options', () => {
    const { trigger, onChange } = renderSelectMenu();

    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(
      document.getElementById(trigger.getAttribute('aria-activedescendant') ?? '')?.textContent
    ).toContain('All projects');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(
      document.getElementById(trigger.getAttribute('aria-activedescendant') ?? '')?.textContent
    ).toContain('Alpha');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(
      document.getElementById(trigger.getAttribute('aria-activedescendant') ?? '')?.textContent
    ).toContain('Omega');

    fireEvent.keyDown(trigger, { key: 'Home' });
    fireEvent.keyDown(trigger, { key: 'End' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('omega');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens with Space, closes with Escape, and closes on Tab without trapping focus', () => {
    const { trigger, onChange, onParentKeyDown } = renderSelectMenu();

    trigger.focus();
    fireEvent.keyDown(trigger, { key: ' ' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    onParentKeyDown.mockClear();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(onParentKeyDown).not.toHaveBeenCalled();
    expect(trigger.hasAttribute('aria-controls')).toBe(false);

    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(fireEvent.keyDown(trigger, { key: 'Tab' })).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a non-selectable loading row when no options are available yet', () => {
    const { trigger, onChange } = renderSelectMenu({ options: [], loading: true });

    expect(trigger.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    const loadingStatus = screen.getByRole('status');
    expect(listbox.getAttribute('aria-busy')).toBe('true');
    expect(loadingStatus.textContent).toBe('Loading options…');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    fireEvent.click(loadingStatus);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps stale options selectable while announcing that options are refreshing', () => {
    const { trigger, onChange } = renderSelectMenu({ loading: true });

    fireEvent.click(trigger);

    expect(screen.getByRole('status').textContent).toBe('Loading options…');
    fireEvent.click(screen.getByRole('option', { name: 'Alpha' }));
    expect(onChange).toHaveBeenCalledWith('alpha');
  });

  it('shows an empty state and safely handles a controlled value outside the option list', () => {
    const { trigger, onChange } = renderSelectMenu({
      value: 'missing',
      options: [],
    });

    expect(trigger.textContent).toContain('missing');
    fireEvent.click(trigger);
    expect(screen.getByRole('status').textContent).toBe('No options available');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not open when disabled and closes when the user clicks outside', () => {
    const disabledRender = renderSelectMenu({ disabled: true });
    fireEvent.click(disabledRender.trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
    disabledRender.unmount();

    const { trigger } = renderSelectMenu();
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('places the portal above when space below is constrained and closes it on scroll', () => {
    const { trigger } = renderSelectMenu();
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 20,
      y: 250,
      top: 250,
      right: 220,
      bottom: 282,
      left: 20,
      width: 200,
      height: 32,
      toJSON: () => undefined,
    });
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(300);
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800);

    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    expect(listbox.parentElement?.getAttribute('data-placement')).toBe('top');
    fireEvent.scroll(listbox);
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.scroll(window);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes an open menu when it becomes disabled', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SelectMenu
        value="all"
        options={OPTIONS}
        ariaLabel="Project"
        loadingLabel="Loading options…"
        emptyLabel="No options available"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Project' }));

    rerender(
      <SelectMenu
        value="all"
        options={OPTIONS}
        ariaLabel="Project"
        loadingLabel="Loading options…"
        emptyLabel="No options available"
        disabled
        onChange={onChange}
      />
    );

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('preserves number values when selecting an option', () => {
    const onChange = vi.fn();
    render(
      <SelectMenu
        value={20}
        options={[
          { value: 10, label: '10' },
          { value: 20, label: '20' },
        ]}
        ariaLabel="Page size"
        loadingLabel="Loading options…"
        emptyLabel="No options available"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Page size' }));
    fireEvent.click(screen.getByRole('option', { name: '10' }));
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('repairs the active descendant when options change while open', () => {
    const { trigger, rerender, onChange } = renderSelectMenu({ value: 'alpha' });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'End' });

    rerender(
      <div>
        <label>
          <span>Project</span>
          <SelectMenu
            value="alpha"
            options={[{ value: 'alpha', label: 'Alpha' }]}
            ariaLabel="Project"
            loadingLabel="Loading options…"
            emptyLabel="No options available"
            onChange={onChange}
          />
        </label>
      </div>
    );

    const activeOption = document.getElementById(
      screen.getByRole('combobox', { name: 'Project' }).getAttribute('aria-activedescendant') ?? ''
    );
    expect(activeOption?.textContent).toContain('Alpha');
  });
});
