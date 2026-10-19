import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Command, Commands } from '../commands/useCommands';
import type { CommandId } from '../commands/shortcuts';

export interface MenuSpec {
  label: string;
  /** Alt+<mnemonic> opens the menu; the letter is underlined in the label. */
  mnemonic: string;
  items: (CommandId | '-')[];
}

/**
 * A menubar following the WAI-ARIA menubar pattern: Left/Right between menus,
 * Down/Up/Home/End within one, Enter/Space to run, Escape to close, Alt+mnemonic to open.
 * Running a command returns focus to wherever it was before the menu opened (the page).
 */
export function MenuBar({ menus, commands }: { menus: MenuSpec[]; commands: Commands }) {
  const [open, setOpen] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);

  const itemsOf = () =>
    Array.from(barRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([data-trigger])') ?? []);
  const enabledItems = () => itemsOf().filter((el) => el.getAttribute('aria-disabled') !== 'true');

  const close = (restore: boolean) => {
    setOpen(null);
    if (restore) returnFocus.current?.focus();
  };

  const openMenu = (index: number, focus: 'first' | 'last' | 'none' = 'first') => {
    if (
      open === null &&
      document.activeElement instanceof HTMLElement &&
      !barRef.current?.contains(document.activeElement)
    ) {
      returnFocus.current = document.activeElement;
    }
    setOpen(index);
    triggers.current[index]?.focus();
    if (focus !== 'none') {
      requestAnimationFrame(() => {
        const items = enabledItems();
        (focus === 'first' ? items[0] : items.at(-1))?.focus();
      });
    }
  };

  // Alt+mnemonic from anywhere in the window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const index = menus.findIndex((m) => m.mnemonic.toLowerCase() === e.key.toLowerCase());
      if (index < 0) return;
      e.preventDefault();
      e.stopPropagation();
      openMenu(index);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  });

  // Clicking anywhere else closes the menu without stealing focus back.
  useEffect(() => {
    if (open === null) return;
    const onPointer = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('pointerdown', onPointer, { capture: true });
    return () => window.removeEventListener('pointerdown', onPointer, { capture: true });
  }, [open]);

  const run = (command: Command) => {
    if (!command.enabled) return;
    close(true);
    // Let focus land back in the document before the command acts on its selection.
    requestAnimationFrame(() => command.run());
  };

  const onTriggerKey = (e: ReactKeyboardEvent, index: number) => {
    const count = menus.length;
    const keys: Record<string, () => void> = {
      ArrowRight: () =>
        open === null ? triggers.current[(index + 1) % count]?.focus() : openMenu((index + 1) % count),
      ArrowLeft: () =>
        open === null ? triggers.current[(index + count - 1) % count]?.focus() : openMenu((index + count - 1) % count),
      ArrowDown: () => openMenu(index, 'first'),
      ArrowUp: () => openMenu(index, 'last'),
      Enter: () => openMenu(index, 'first'),
      ' ': () => openMenu(index, 'first'),
      Escape: () => close(true),
    };
    const action = keys[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  const onMenuKey = (e: ReactKeyboardEvent, index: number) => {
    const items = enabledItems();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    const keys: Record<string, () => void> = {
      ArrowDown: () => focusAt(current + 1),
      ArrowUp: () => focusAt(current - 1),
      Home: () => focusAt(0),
      End: () => focusAt(items.length - 1),
      ArrowRight: () => openMenu((index + 1) % menus.length),
      ArrowLeft: () => openMenu((index + menus.length - 1) % menus.length),
      Escape: () => {
        setOpen(null);
        triggers.current[index]?.focus();
      },
      Tab: () => close(false),
    };
    const action = keys[e.key];
    if (action) {
      if (e.key !== 'Tab') e.preventDefault();
      e.stopPropagation();
      action();
    }
  };

  return (
    <div className="menubar" role="menubar" aria-label="Main menu" ref={barRef}>
      {menus.map((menu, index) => {
        const at = menu.label.toLowerCase().indexOf(menu.mnemonic.toLowerCase());
        return (
          <div className="menu-root" key={menu.label}>
            <button
              type="button"
              role="menuitem"
              data-trigger
              className="menu-trigger"
              aria-haspopup="menu"
              aria-expanded={open === index}
              aria-keyshortcuts={`Alt+${menu.mnemonic.toUpperCase()}`}
              tabIndex={index === 0 ? 0 : -1}
              ref={(el) => {
                triggers.current[index] = el;
              }}
              onMouseDown={(e) => e.preventDefault() /* keep focus (and selection) in the page */}
              onClick={() => (open === index ? close(true) : openMenu(index, 'none'))}
              onMouseEnter={() => open !== null && open !== index && openMenu(index, 'none')}
              onKeyDown={(e) => onTriggerKey(e, index)}
            >
              {menu.label.slice(0, at)}
              <u>{menu.label[at]}</u>
              {menu.label.slice(at + 1)}
            </button>
            {open === index && (
              <div className="menu" role="menu" aria-label={menu.label} onKeyDown={(e) => onMenuKey(e, index)}>
                {menu.items.map((item, i) =>
                  item === '-' ? (
                    <div key={`sep-${i}`} role="separator" className="menu-separator" />
                  ) : (
                    <MenuItem key={item} command={commands[item]} onRun={run} />
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MenuItem({ command, onRun }: { command: Command; onRun: (c: Command) => void }) {
  const checkable = command.checked !== undefined;
  return (
    <div
      role={checkable ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={checkable ? command.checked : undefined}
      aria-disabled={!command.enabled || undefined}
      aria-keyshortcuts={command.shortcut}
      tabIndex={-1}
      className="menu-item"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onRun(command)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRun(command);
        }
      }}
      onMouseEnter={(e) => command.enabled && e.currentTarget.focus()}
    >
      <span className="menu-check" aria-hidden="true">
        {command.checked ? '✓' : ''}
      </span>
      <span className="menu-label">{command.label}</span>
      {command.shortcut && <span className="menu-shortcut">{command.shortcut}</span>}
    </div>
  );
}
