import type { Commands } from '../commands/useCommands';
import { formatShortcut, SHORTCUTS, type CommandId } from '../commands/shortcuts';
import { Modal } from './Modal';

const GROUPS: { title: string; prefix: string }[] = [
  { title: 'File', prefix: 'file.' },
  { title: 'Edit', prefix: 'edit.' },
  { title: 'Format', prefix: 'format.' },
  { title: 'Help', prefix: 'help.' },
];

/** Every shortcut, generated from the same table that handles the keys. */
export function ShortcutsDialog({ commands, onClose }: { commands: Commands; onClose: () => void }) {
  const bound = Object.entries(SHORTCUTS) as [CommandId, NonNullable<(typeof SHORTCUTS)[CommandId]>][];
  return (
    <Modal title="Keyboard Shortcuts" onClose={onClose}>
      <div className="shortcut-groups">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <dl>
              {bound
                .filter(([id]) => id.startsWith(group.prefix))
                .map(([id, binding]) => (
                  <div className="shortcut-row" key={id}>
                    <dt>{commands[id].label.replace('…', '')}</dt>
                    <dd>
                      {binding.keys.map((k) => (
                        <kbd key={formatShortcut(k)}>{formatShortcut(k)}</kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              {group.prefix === 'format.' && (
                <div className="shortcut-row">
                  <dt>Indent / outdent list item</dt>
                  <dd>
                    <kbd>Tab</kbd>
                    <kbd>Shift+Tab</kbd>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
