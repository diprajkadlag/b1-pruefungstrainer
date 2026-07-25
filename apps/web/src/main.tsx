import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root fehlt im HTML.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
