import './polyfills';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { WalletProviderWrapper } from './WalletProvider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WalletProviderWrapper>
      <App />
    </WalletProviderWrapper>
  </React.StrictMode>,
);
