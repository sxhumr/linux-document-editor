import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Command, Commands } from '../commands/useCommands';
import type { CommandId } from '../commands/shortcuts';
import { MenuBar, type MenuSpec } from './MenuBar';

afterEach(cleanup);

const frame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

function setup() {
  const cmd = (id: CommandId, label: string, extra: Partial<Command> = {}): Command => ({
    id,
    label,
    run: vi.fn(),
    enabled: true,
    ...extra,
  });
  const commands = {
    'file.new': cmd('file.new', 'New', { shortcut: 'Ctrl+N' }),
    'file.open': cmd('file.open', 'Open…'),
    'file.save': cmd('file.save', 'Save', { enabled: false }),
    'format.bold': cmd('format.bold', 'Bold', { checked: true }),
    'format.italic': cmd('format.italic', 'Italic', { checked: false }),
  } as unknown as Commands;
  const menus: MenuSpec[] = [
    { label: 'File', mnemonic: 'f', items: ['file.new', 'file.open', '-', 'file.save'] },
    { label: 'Format', mnemonic: 'o', items: ['format.bold', 'format.italic'] },
  ];
  render(<MenuBar menus={menus} commands={commands} />);
  return { commands };
}

describe('MenuBar', () => {
  it('opens a menu on click and lists its items with shortcuts', () => {
    setup();
    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));
    const menu = screen.getByRole('menu', { name: 'File' });
    expect(menu).toBeTruthy();
    expect(screen.getByText('Ctrl+N')).toBeTruthy();
    expect(screen.getAllByRole('separator')).toHaveLength(1);
  });

  it('runs a command on click and closes', async () => {
    const { commands } = setup();
    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));
    fireEvent.click(screen.getByText('Open…'));
    expect(screen.queryByRole('menu')).toBeNull();
    await frame();
    expect(commands['file.open'].run).toHaveBeenCalledOnce();
  });

  it('does not run a disabled command', async () => {
    const { commands } = setup();
    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));
    const save = screen.getByText('Save').closest('[role="menuitem"]')!;
    expect(save.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(save);
    await frame();
    expect(commands['file.save'].run).not.toHaveBeenCalled();
  });

  it('navigates with the keyboard, skipping disabled items', async () => {
    const { commands } = setup();
    const file = screen.getByRole('menuitem', { name: 'File' });
    fireEvent.keyDown(file, { key: 'ArrowDown' });
    await frame();
    const menu = screen.getByRole('menu', { name: 'File' });
    expect(document.activeElement?.textContent).toContain('New');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('Open');
    fireEvent.keyDown(menu, { key: 'ArrowDown' }); // Save is disabled → wraps to New
    expect(document.activeElement?.textContent).toContain('New');
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    await frame();
    expect(commands['file.new'].run).toHaveBeenCalledOnce();
  });

  it('moves between menus with arrows and closes with Escape', async () => {
    setup();
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'File' }), { key: 'ArrowDown' });
    await frame();
    fireEvent.keyDown(screen.getByRole('menu', { name: 'File' }), { key: 'ArrowRight' });
    expect(screen.getByRole('menu', { name: 'Format' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('menu', { name: 'Format' }), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Format' }));
  });

  it('opens with Alt+mnemonic', () => {
    setup();
    fireEvent.keyDown(window, { key: 'o', altKey: true });
    expect(screen.getByRole('menu', { name: 'Format' })).toBeTruthy();
  });

  it('shows toggle state', () => {
    setup();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Format' }));
    expect(screen.getByRole('menuitemcheckbox', { name: /Bold/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitemcheckbox', { name: /Italic/ }).getAttribute('aria-checked')).toBe('false');
  });
});
