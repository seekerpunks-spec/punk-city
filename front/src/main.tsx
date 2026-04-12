import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SolanaProviders } from './solana/SolanaProviders'

createRoot(document.getElementById('root')!).render(
  <SolanaProviders>
    <App />
  </SolanaProviders>,
)
