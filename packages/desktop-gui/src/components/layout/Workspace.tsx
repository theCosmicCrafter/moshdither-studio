import * as React from 'react';
import { WebGLCanvas } from '../canvas/WebGLCanvas';

export const Workspace: React.FC = () => {
  return (
    <main className="app-workspace">
      <WebGLCanvas />
    </main>
  );
};
