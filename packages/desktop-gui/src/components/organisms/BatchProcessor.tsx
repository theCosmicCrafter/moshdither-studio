import * as React from 'react';
import { useStudio } from '../../context/StudioContext';
import { Button } from '../atoms/Button';

export const BatchProcessor: React.FC = () => {
  const { activeEffects, outputDirectory, exportFormat, exportFps, addToast, addRenderJob, watermarkSettings } = useStudio();
  const [files, setFiles] = React.useState<string[]>([]);
  const [isRunning, setIsRunning] = React.useState(false);

  const selectFiles = async () => {
    if (!window.ipcRenderer) return;
    try {
      const paths = await window.ipcRenderer.invoke<string[]>('dialog:openMediaMultiple');
      if (paths && paths.length > 0) {
        setFiles(paths);
      }
    } catch {
      // User cancelled or IPC error — ignore
    }
  };

  const runBatch = () => {
    if (files.length === 0) return;
    setIsRunning(true);
    for (let i = 0; i < files.length; i++) {
      addRenderJob({
        name: `Batch ${i + 1}/${files.length}`,
        inputUrl: files[i],
        activeEffects,
        outputDirectory,
        exportFormat,
        exportFps,
        watermarkSettings,
      });
    }
    setIsRunning(false);
    addToast('Batch jobs queued!', 'success');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
      <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em' }}>
        Batch Processing
      </span>
      <Button variant="glass" onClick={selectFiles} disabled={isRunning}>
        {files.length > 0 ? `${files.length} files selected` : 'Select Files'}
      </Button>
      {files.length > 0 && (
        <Button variant="primary" onClick={runBatch} disabled={isRunning}>
          {isRunning ? 'Processing...' : 'Run Batch'}
        </Button>
      )}
    </div>
  );
};
