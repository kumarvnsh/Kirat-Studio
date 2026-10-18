import { createRoot } from 'react-dom/client';
import './app/style.css';
import { App } from './app/App.tsx';
import { startSession } from './app/actions.ts';

// No StrictMode: the Three.js viewer is created once per page and owns its render loop.
createRoot(document.getElementById('root')!).render(<App />);
startSession();
