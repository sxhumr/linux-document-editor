import type { AppInfo } from '../native/bridge';
import { Modal } from './Modal';

export function AboutDialog({ info, onClose }: { info: AppInfo | null; onClose: () => void }) {
  return (
    <Modal title="About PageLite" onClose={onClose}>
      <p className="about-lead">
        <strong>PageLite {info?.version ?? ''}</strong>
        <br />A lightweight editor for Word documents.
      </p>
      {info && <p className="about-meta">WebKitGTK {info.webkitVersion}</p>}
      <h3>Built with</h3>
      <ul className="about-credits">
        <li>docx-editor.dev engine (Apache-2.0)</li>
        <li>webview/webview (MIT)</li>
        <li>React (MIT)</li>
        <li>GTK and WebKitGTK (LGPL-2.1+)</li>
      </ul>
      <p className="about-meta">
        PageLite is licensed under Apache-2.0. Third-party licences are in
        /usr/share/doc/pagelite/THIRD_PARTY_NOTICES.md.
      </p>
      <p className="about-meta">Works offline. PageLite never sends your documents anywhere.</p>
    </Modal>
  );
}
