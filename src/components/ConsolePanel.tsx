import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { X, Terminal as TerminalIcon } from 'lucide-react';

interface ConsolePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onResetGGB: () => void;
  ggbApi: any;
}

export default function ConsolePanel({ isOpen, onClose, onResetGGB, ggbApi }: ConsolePanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const isArwes = document.documentElement.getAttribute('data-theme') === 'arwes';

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      theme: {
        background: isArwes ? '#021114' : '#1e1e1e',
        foreground: isArwes ? '#00d4ff' : '#ffffff',
        cursor: isArwes ? '#00d4ff' : '#ffffff',
        selectionBackground: 'rgba(0, 212, 255, 0.3)',
      },
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    if (terminalRef.current) {
      term.open(terminalRef.current);
      fitAddon.fit();
    }

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    const handleCommand = (cmdLine: string) => {
      const args = cmdLine.trim().split(/\s+/);
      const command = args[0].toLowerCase();

      if (command === 'help') {
        term.writeln('Available commands:');
        term.writeln('  \x1b[1;33mreset-ggb\x1b[0m                       - Force reset all GeoGebra settings');
        term.writeln('  \x1b[1;33msetggb set bgcolor [HEX]\x1b[0m         - Set background color (e.g. #ffffff)');
        term.writeln('  \x1b[1;33msetggb show/hide [cas/algebra]\x1b[0m   - Toggle GGB components');
        term.writeln('  \x1b[1;33mclear\x1b[0m                             - Clear terminal');
        term.writeln('  \x1b[1;33mexit\x1b[0m                              - Close console');
      } else if (command === 'setggb') {
        if (!ggbApi) {
          term.writeln('\x1b[1;31mError: GeoGebra API not ready.\x1b[0m');
          return;
        }

        const action = args[1]?.toLowerCase();
        const target = args[2]?.toLowerCase();
        const value = args[3];

        if (action === 'set' && target === 'bgcolor') {
          if (!value || !/^#[0-9a-fA-F]{6}$/.test(value)) {
            term.writeln('Usage: setggb set bgcolor #RRGGBB');
            return;
          }

          try {
            const xml = ggbApi.getXML();
            const r = parseInt(value.slice(1, 3), 16);
            const g = parseInt(value.slice(3, 5), 16);
            const b = parseInt(value.slice(5, 7), 16);

            let newXml = xml;
            if (xml.includes('<bgColor')) {
              newXml = xml.replace(/<bgColor r="\d+" g="\d+" b="\d+"\/>/g, `<bgColor r="${r}" g="${g}" b="${b}"/>`);
            } else {
              newXml = xml.replace(/<euclidianView>/, `<euclidianView>\n<bgColor r="${r}" g="${g}" b="${b}"/>`);
            }

            ggbApi.setXML(newXml);
            localStorage.setItem('mathall-ggb-bgcolor', value);
            term.writeln(`\x1b[1;32mBackground color set to ${value}\x1b[0m`);
          } catch (e) {
            term.writeln(`\x1b[1;31mError applying color: ${e}\x1b[0m`);
          }
        } else if (action === 'show' || action === 'hide') {
          const visible = action === 'show';
          if (target === 'cas') {
            const perspective = visible ? 'C' : 'G'; // Simplified: show CAS or go back to Geometry
            // In GGB 6 API, better to use perspective codes
            ggbApi.evalCommand(`SetPerspective("${perspective}")`);
            term.writeln(`\x1b[1;32mCAS view ${visible ? 'shown' : 'hidden'}\x1b[0m`);
          } else if (target === 'algebra') {
            // Using API if available or perspective
            ggbApi.evalCommand(`SetPerspective("${visible ? 'A' : 'G'}")`);
            term.writeln(`\x1b[1;32mAlgebra view ${visible ? 'shown' : 'hidden'}\x1b[0m`);
          } else {
            term.writeln(`Unknown target: ${target}. Supported: cas, algebra`);
          }
        } else {
          term.writeln('Usage: setggb [set/show/hide] [target] [value]');
        }
      } else if (command === 'reset-ggb') {
        term.writeln('\x1b[1;31mForce resetting GeoGebra...\x1b[0m');
        onResetGGB();
      } else if (command === 'clear') {
        term.clear();
      } else if (command === 'exit') {
        onClose();
      } else if (command !== '') {
        term.writeln(`Command not found: ${command}`);
      }
    };

    term.writeln('\x1b[1;36mMathAll Debug Console v1.0.0\x1b[0m');
    term.writeln('Type \x1b[1;33mhelp\x1b[0m for available commands.');
    term.write('\r\n$ ');

    let currentLine = '';

    const dataListener = term.onData(data => {
      const code = data.charCodeAt(0);
      if (code === 13) { // Enter
        term.write('\r\n');
        handleCommand(currentLine);
        currentLine = '';
        term.write('$ ');
      } else if (code === 127 || code === 8) { // Backspace
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1);
          term.write('\b \b');
        }
      } else {
        currentLine += data;
        term.write(data);
      }
    });

    // Small delay to ensure container is ready
    setTimeout(() => fitAddon.fit(), 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      dataListener.dispose();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [isOpen, onResetGGB, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        width: '600px',
        height: '300px',
        background: 'var(--panel-bg)',
        backdropFilter: 'blur(12px)',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-color)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
      className="glass-panel"
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0,0,0,0.1)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-color)' }}>
          <TerminalIcon size={14} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '1px' }}>DEBUG_CONSOLE</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: 'var(--text-secondary)'
          }}
        >
          <X size={14} />
        </button>
      </div>
      <div
        ref={terminalRef}
        style={{
          flex: 1,
          padding: '8px',
          background: 'rgba(0,0,0,0.2)'
        }}
      />
    </div>
  );
}
